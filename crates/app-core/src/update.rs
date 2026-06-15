use crate::{read_version, AppConfig};
use anyhow::{anyhow, Context, Result};
use host_model::{AppSettings, AppUpdateResult, AppUpdateStatus};
use host_proc::run_command_capture;
use serde::{Deserialize, Serialize};
use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

const UPDATE_WORKER_FLAG: &str = "--update-worker";
const UPDATE_PARENT_PID_FLAG: &str = "--parent-pid";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BuildProfile {
    Debug,
    Release,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct UpdateJobState {
    phase: String,
    message: String,
    output: String,
    version: String,
    git_commit: Option<String>,
    #[serde(default)]
    worker_pid: Option<u32>,
}

struct InnerUpdateResult {
    success: bool,
    message: String,
    output: String,
    version: String,
    git_commit: Option<String>,
    rolled_back: bool,
}

pub fn parse_update_worker_parent_pid(args: &[String]) -> Option<u32> {
    if !args.iter().any(|arg| arg == UPDATE_WORKER_FLAG) {
        return None;
    }

    let index = args
        .iter()
        .position(|arg| arg == UPDATE_PARENT_PID_FLAG)?;
    let pid = args.get(index + 1)?.parse().ok()?;
    Some(pid)
}

pub fn app_settings(config: &AppConfig) -> AppSettings {
    let git = read_git_state(&config.repo_root, false).ok();

    AppSettings {
        app_name: config.app_name.clone(),
        version: config.version.clone(),
        mode: config.mode.as_str().to_string(),
        repo_root: config.repo_root.display().to_string(),
        update_supported: git.is_some(),
        git_remote: git.as_ref().map(|state| state.remote.clone()),
        git_branch: git.as_ref().map(|state| state.branch.clone()),
        git_commit: git.as_ref().map(|state| state.commit.clone()),
        git_upstream_commit: git.as_ref().and_then(|state| state.upstream_commit.clone()),
        update_available: git.as_ref().map(|state| state.behind_commits > 0).unwrap_or(false),
        behind_commits: git.as_ref().map(|state| state.behind_commits).unwrap_or(0),
    }
}

pub fn check_for_updates(config: &AppConfig) -> Result<AppSettings> {
    let git = read_git_state(&config.repo_root, true)
        .context("failed to check repository updates")?;

    Ok(AppSettings {
        app_name: config.app_name.clone(),
        version: config.version.clone(),
        mode: config.mode.as_str().to_string(),
        repo_root: config.repo_root.display().to_string(),
        update_supported: true,
        git_remote: Some(git.remote),
        git_branch: Some(git.branch),
        git_commit: Some(git.commit),
        git_upstream_commit: git.upstream_commit,
        update_available: git.behind_commits > 0,
        behind_commits: git.behind_commits,
    })
}

pub fn recover_stale_update_job_on_startup(config: &AppConfig) {
    let Some(state) = read_job_state(config) else {
        return;
    };

    if !matches!(state.phase.as_str(), "running" | "restarting") {
        return;
    }

    if state.worker_pid.map(process_alive).unwrap_or(false) {
        return;
    }

    let (phase, message) = if state.phase == "restarting" {
        (
            "success",
            "更新已完成（上次重启后任务状态已自动恢复）。",
        )
    } else {
        (
            "failed",
            "检测到未完成的更新任务（工作进程已退出），请检查后重试。",
        )
    };

    let _ = write_job_state(
        config,
        &UpdateJobState {
            phase: phase.to_string(),
            message: message.to_string(),
            output: state.output,
            version: state.version,
            git_commit: state.git_commit,
            worker_pid: None,
        },
    );
}

pub fn update_job_status(config: &AppConfig) -> AppUpdateStatus {
    let Some(state) = normalize_job_state(config) else {
        return idle_update_status(config);
    };

    let active = is_job_active(&state);

    AppUpdateStatus {
        active,
        phase: state.phase,
        message: state.message,
        output: state.output,
        version: state.version,
        git_commit: state.git_commit,
    }
}

pub fn spawn_background_update(config: &AppConfig) -> Result<AppUpdateResult> {
    if let Some(state) = normalize_job_state(config) {
        if is_job_active(&state) {
            return Err(anyhow!("已有更新任务正在执行，请等待完成后再试。"));
        }
    }

    let git = read_git_state(&config.repo_root, true)
        .context("failed to inspect repository before update")?;

    if git.behind_commits == 0 {
        return Ok(AppUpdateResult {
            success: true,
            started: false,
            message: "当前已是最新版本，无需拉取。".to_string(),
            output: String::new(),
            version: config.version.clone(),
            git_commit: Some(git.commit),
            restart_required: false,
        });
    }

    let parent_pid = std::process::id();
    let exe = std::env::current_exe().context("failed to resolve current executable")?;

    let git_commit = git.commit.clone();

    write_job_state(
        config,
        &UpdateJobState {
            phase: "running".to_string(),
            message: "更新任务已在后台启动。".to_string(),
            output: String::new(),
            version: config.version.clone(),
            git_commit: Some(git_commit.clone()),
            worker_pid: None,
        },
    )?;

    spawn_detached_worker(&exe, parent_pid, &config.repo_root)?;

    Ok(AppUpdateResult {
        success: true,
        started: true,
        message: "更新已在后台启动，完成后将自动重启服务。".to_string(),
        output: String::new(),
        version: config.version.clone(),
        git_commit: Some(git_commit),
        restart_required: false,
    })
}

pub fn run_update_worker(config: &AppConfig, parent_pid: u32) -> Result<()> {
    register_update_worker_pid(config);

    let profile = detect_build_profile();
    let result = pull_and_build_inner(config, profile);

    match result {
        Ok(inner) if inner.success => {
            // 先写入 success，避免重启过程中 worker 被杀导致锁卡在 restarting。
            write_job_state(
                config,
                &UpdateJobState {
                    phase: "success".to_string(),
                    message: "更新完成，服务正在重启…".to_string(),
                    output: inner.output.clone(),
                    version: inner.version.clone(),
                    git_commit: inner.git_commit.clone(),
                    worker_pid: Some(std::process::id()),
                },
            )?;

            if let Err(error) = restart_server(config, parent_pid) {
                write_job_state(
                    config,
                    &UpdateJobState {
                        phase: "failed".to_string(),
                        message: format!("构建成功，但自动重启失败：{error}"),
                        output: inner.output,
                        version: inner.version,
                        git_commit: inner.git_commit,
                        worker_pid: None,
                    },
                )?;
                return Err(error);
            }

            Ok(())
        }
        Ok(inner) => {
            write_job_state(
                config,
                &UpdateJobState {
                    phase: "failed".to_string(),
                    message: inner.message,
                    output: inner.output,
                    version: inner.version,
                    git_commit: inner.git_commit,
                    worker_pid: None,
                },
            )?;
            Ok(())
        }
        Err(error) => {
            write_job_state(
                config,
                &UpdateJobState {
                    phase: "failed".to_string(),
                    message: error.to_string(),
                    output: error.to_string(),
                    version: config.version.clone(),
                    git_commit: None,
                    worker_pid: None,
                },
            )?;
            Err(error)
        }
    }
}

fn pull_and_build_inner(config: &AppConfig, profile: BuildProfile) -> Result<InnerUpdateResult> {
    let git = read_git_state(&config.repo_root, true)
        .context("failed to inspect repository before update")?;

    if git.behind_commits == 0 {
        return Ok(InnerUpdateResult {
            success: true,
            message: "当前已是最新版本，无需拉取。".to_string(),
            output: String::new(),
            version: config.version.clone(),
            git_commit: Some(git.commit),
            rolled_back: false,
        });
    }

    let upstream = git
        .upstream_ref
        .clone()
        .ok_or_else(|| anyhow!("无法确定远程跟踪分支"))?;

    let baseline_commit = git.commit_full.clone();
    write_update_baseline(config, &baseline_commit)?;

    let mut output = String::new();
    let mut success = true;
    let mut pulled = false;

    append_step(
        &mut output,
        &mut success,
        "git reset --hard HEAD",
        run_git_capture(&config.repo_root, &["reset", "--hard", "HEAD"]),
    )?;
    append_step(
        &mut output,
        &mut success,
        "git clean -fd",
        run_git_capture(&config.repo_root, &["clean", "-fd"]),
    )?;

    append_step(
        &mut output,
        &mut success,
        "git pull",
        run_git_capture(&config.repo_root, &["pull", "--ff-only", "origin", &git.branch]),
    )?;
    pulled = success;

    if success {
        append_step(
            &mut output,
            &mut success,
            "npm run build:web",
            run_command_capture(npm_program(), &["run", "build:web"], &config.repo_root),
        )?;
    }

    if success {
        let label = cargo_build_label(profile);
        let args = cargo_build_args(profile);
        append_step(
            &mut output,
            &mut success,
            label,
            run_command_capture("cargo", &args, &config.repo_root),
        )?;
    }

    let mut rolled_back = false;
    if !success && pulled {
        rolled_back = rollback_to_baseline(config, &baseline_commit, &mut output)?;
    }

    let refreshed = read_git_state(&config.repo_root, false).ok();
    let version = read_version(&config.repo_root).unwrap_or_else(|_| config.version.clone());

    if success {
        if let Some(state) = refreshed.as_ref() {
            write_update_baseline(config, &state.commit_full)?;
        }
    }

    Ok(InnerUpdateResult {
        success,
        message: build_update_message(success, rolled_back, &upstream),
        output,
        version,
        git_commit: refreshed.map(|state| state.commit),
        rolled_back,
    })
}

struct GitState {
    remote: String,
    branch: String,
    commit: String,
    commit_full: String,
    upstream_ref: Option<String>,
    upstream_commit: Option<String>,
    behind_commits: u32,
}

fn idle_update_status(config: &AppConfig) -> AppUpdateStatus {
    AppUpdateStatus {
        active: false,
        phase: "idle".to_string(),
        message: "当前没有进行中的更新任务。".to_string(),
        output: String::new(),
        version: config.version.clone(),
        git_commit: None,
    }
}

fn update_job_path(config: &AppConfig) -> PathBuf {
    config.managed_base_dir.join(".update-job.json")
}

fn write_job_state(config: &AppConfig, state: &UpdateJobState) -> Result<()> {
    fs::create_dir_all(&config.managed_base_dir)
        .with_context(|| format!("failed to create {}", config.managed_base_dir.display()))?;
    fs::write(
        update_job_path(config),
        serde_json::to_string_pretty(state).context("failed to serialize update job state")?,
    )
    .with_context(|| format!("failed to write {}", update_job_path(config).display()))?;
    Ok(())
}

fn read_job_state(config: &AppConfig) -> Option<UpdateJobState> {
    let raw = fs::read_to_string(update_job_path(config)).ok()?;
    serde_json::from_str(&raw).ok()
}

fn is_job_active(state: &UpdateJobState) -> bool {
    matches!(state.phase.as_str(), "running" | "restarting")
}

fn normalize_job_state(config: &AppConfig) -> Option<UpdateJobState> {
    let state = read_job_state(config)?;

    if !is_job_active(&state) {
        return Some(state);
    }

    let worker_alive = state
        .worker_pid
        .map(process_alive)
        .unwrap_or(false);

    let stale = match state.phase.as_str() {
        "restarting" => !worker_alive,
        "running" => state.worker_pid.is_some() && !worker_alive,
        _ => false,
    };

    if !stale {
        return Some(state);
    }

    let (phase, message) = if state.phase == "restarting" {
        (
            "success",
            "更新已完成（上次重启后任务状态已自动恢复）。",
        )
    } else {
        (
            "failed",
            "更新任务已中断（工作进程已结束），请检查后重试。",
        )
    };

    let normalized = UpdateJobState {
        phase: phase.to_string(),
        message: message.to_string(),
        output: state.output,
        version: state.version,
        git_commit: state.git_commit,
        worker_pid: None,
    };
    let _ = write_job_state(config, &normalized);
    Some(normalized)
}

fn register_update_worker_pid(config: &AppConfig) {
    let worker_pid = std::process::id();
    let Some(mut state) = read_job_state(config) else {
        return;
    };

    if !is_job_active(&state) {
        return;
    }

    state.worker_pid = Some(worker_pid);
    let _ = write_job_state(config, &state);
}

fn detect_build_profile() -> BuildProfile {
    if let Ok(exe) = std::env::current_exe() {
        let path = exe.to_string_lossy();
        if path.contains("/release/") || path.contains("\\release\\") {
            return BuildProfile::Release;
        }
    }

    if std::env::var("APP_ENV")
        .map(|value| {
            matches!(
                value.to_ascii_lowercase().as_str(),
                "production" | "prod"
            )
        })
        .unwrap_or(false)
    {
        return BuildProfile::Release;
    }

    BuildProfile::Debug
}

fn cargo_build_label(profile: BuildProfile) -> &'static str {
    match profile {
        BuildProfile::Release => "cargo build --release --locked -p agent-manager-server",
        BuildProfile::Debug => "cargo build --locked -p agent-manager-server",
    }
}

fn cargo_build_args(profile: BuildProfile) -> Vec<&'static str> {
    match profile {
        BuildProfile::Release => vec!["build", "--release", "--locked", "-p", "agent-manager-server"],
        BuildProfile::Debug => vec!["build", "--locked", "-p", "agent-manager-server"],
    }
}

fn spawn_detached_worker(exe: &Path, parent_pid: u32, repo_root: &Path) -> Result<()> {
    let command = format!(
        "setsid {} {} {} {} </dev/null >/dev/null 2>&1 &",
        shell_quote(exe),
        UPDATE_WORKER_FLAG,
        UPDATE_PARENT_PID_FLAG,
        parent_pid
    );

    let capture = run_command_capture("sh", &["-c", &command], repo_root)
        .context("failed to spawn detached update worker")?;

    if capture.success {
        Ok(())
    } else {
        Err(anyhow!(
            "failed to spawn detached update worker: {}",
            capture.output
        ))
    }
}

fn restart_server(config: &AppConfig, parent_pid: u32) -> Result<()> {
    signal_terminate(parent_pid).context("failed to stop current server process")?;
    wait_for_process_exit(parent_pid, 30).context("timed out waiting for old server to exit")?;
    spawn_server_binary(config).context("failed to start new server process")?;
    Ok(())
}

fn spawn_server_binary(config: &AppConfig) -> Result<()> {
    let exe = std::env::current_exe().context("failed to resolve server executable")?;
    let command = format!(
        "setsid {} </dev/null >/dev/null 2>&1 &",
        shell_quote(&exe)
    );

    let mut command_builder = Command::new("sh");
    command_builder
        .arg("-c")
        .arg(command)
        .current_dir(&config.repo_root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    for key in [
        "APP_ENV",
        "ADMIN_TOKEN",
        "PORT",
        "MANAGED_BASE_DIR",
        "WEB_DIST_DIR",
        "REPO_ROOT",
    ] {
        if let Ok(value) = std::env::var(key) {
            command_builder.env(key, value);
        }
    }

    command_builder
        .spawn()
        .context("failed to spawn replacement server process")?;
    Ok(())
}

fn signal_terminate(pid: u32) -> Result<()> {
    let capture = run_command_capture("kill", &["-TERM", &pid.to_string()], Path::new("/"))
        .with_context(|| format!("failed to send SIGTERM to process {pid}"))?;

    if capture.success {
        Ok(())
    } else {
        Err(anyhow!(
            "failed to send SIGTERM to process {pid}: {}",
            capture.output
        ))
    }
}

fn wait_for_process_exit(pid: u32, timeout_secs: u64) -> Result<()> {
    let deadline = Duration::from_secs(timeout_secs);
    let started = std::time::Instant::now();

    while started.elapsed() < deadline {
        if !process_alive(pid) {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(200));
    }

    Err(anyhow!("process {pid} did not exit within {timeout_secs}s"))
}

fn process_alive(pid: u32) -> bool {
    #[cfg(unix)]
    {
        return Path::new(&format!("/proc/{pid}")).exists();
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let filter = format!("PID eq {pid}");
        let output = Command::new("tasklist")
            .args(["/FI", &filter, "/NH"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        return output
            .map(|capture| {
                String::from_utf8_lossy(&capture.stdout)
                    .contains(&pid.to_string())
            })
            .unwrap_or(false);
    }
}

fn shell_quote(path: &Path) -> String {
    let value = path.display().to_string();
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn build_update_message(success: bool, rolled_back: bool, upstream: &str) -> String {
    if success {
        return format!("已从 GitHub 拉取更新并完成构建（{upstream}）。");
    }

    if rolled_back {
        return "更新失败，已自动回滚到更新前的代码版本。当前服务可继续使用，稍后可直接重试拉取。".to_string();
    }

    "更新失败，请查看下方命令输出。".to_string()
}

fn update_baseline_path(config: &AppConfig) -> PathBuf {
    config.managed_base_dir.join(".update-baseline")
}

fn write_update_baseline(config: &AppConfig, commit: &str) -> Result<()> {
    fs::create_dir_all(&config.managed_base_dir)
        .with_context(|| format!("failed to create {}", config.managed_base_dir.display()))?;
    fs::write(update_baseline_path(config), commit)
        .with_context(|| "failed to persist update baseline commit")?;
    Ok(())
}

fn rollback_to_baseline(
    config: &AppConfig,
    baseline_commit: &str,
    output: &mut String,
) -> Result<bool> {
    let mut rollback_success = true;
    append_step(
        output,
        &mut rollback_success,
        &format!("git reset --hard {baseline_commit}"),
        run_git_capture(
            &config.repo_root,
            &["reset", "--hard", baseline_commit],
        ),
    )?;

    if rollback_success {
        writeln!(
            output,
            "已回滚到更新前提交 {baseline_commit}。保底记录保存在 {}。",
            update_baseline_path(config).display()
        )
        .ok();
        writeln!(output).ok();
    } else {
        writeln!(
            output,
            "自动回滚失败。可手动执行：git reset --hard {baseline_commit}"
        )
        .ok();
        writeln!(
            output,
            "保底提交记录：{}",
            update_baseline_path(config).display()
        )
        .ok();
        writeln!(output).ok();
    }

    Ok(rollback_success)
}

fn resolve_upstream_ref(repo_root: &Path, branch: &str) -> Option<String> {
    if let Ok(upstream) = run_git(
        repo_root,
        &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    ) {
        return Some(upstream);
    }

    let origin_branch = format!("origin/{branch}");
    if run_git(repo_root, &["rev-parse", "--verify", &origin_branch]).is_ok() {
        return Some(origin_branch);
    }

    None
}

fn count_behind_commits(repo_root: &Path, upstream_ref: &str) -> Result<u32> {
    let output = run_git(
        repo_root,
        &["rev-list", "--count", &format!("HEAD..{upstream_ref}")],
    )?;
    output
        .parse::<u32>()
        .with_context(|| format!("invalid commit count from git: {output}"))
}

fn read_git_state(repo_root: &Path, fetch: bool) -> Result<GitState> {
    if !repo_root.join(".git").exists() {
        return Err(anyhow!("当前目录不是 Git 仓库，无法执行自更新"));
    }

    if fetch {
        run_git_capture(repo_root, &["fetch", "origin"])
            .with_context(|| "git fetch origin failed")?;
    }

    let remote = run_git(repo_root, &["remote", "get-url", "origin"])?;
    let branch = run_git(repo_root, &["rev-parse", "--abbrev-ref", "HEAD"])?;
    let commit = run_git(repo_root, &["rev-parse", "--short", "HEAD"])?;
    let commit_full = run_git(repo_root, &["rev-parse", "HEAD"])?;
    let upstream_ref = resolve_upstream_ref(repo_root, &branch);
    let upstream_commit = upstream_ref
        .as_ref()
        .and_then(|reference| run_git(repo_root, &["rev-parse", "--short", reference]).ok());
    let behind_commits = upstream_ref
        .as_ref()
        .map(|reference| count_behind_commits(repo_root, reference))
        .transpose()?
        .unwrap_or(0);

    Ok(GitState {
        remote,
        branch,
        commit,
        commit_full,
        upstream_ref,
        upstream_commit,
        behind_commits,
    })
}

fn run_git(repo_root: &Path, args: &[&str]) -> Result<String> {
    let capture = run_git_capture(repo_root, args)?;
    if capture.success {
        Ok(capture.output)
    } else {
        Err(anyhow!("git {} failed: {}", args.join(" "), capture.output))
    }
}

fn run_git_capture(repo_root: &Path, args: &[&str]) -> Result<host_proc::CommandCapture> {
    run_command_capture("git", args, repo_root)
        .with_context(|| format!("failed to run git {}", args.join(" ")))
}

fn append_step(
    output: &mut String,
    success: &mut bool,
    label: &str,
    result: Result<host_proc::CommandCapture>,
) -> Result<()> {
    writeln!(output, "$ {label}").ok();
    match result {
        Ok(capture) => {
            if !capture.output.is_empty() {
                writeln!(output, "{}", capture.output).ok();
            }
            if !capture.success {
                *success = false;
            }
        }
        Err(error) => {
            *success = false;
            writeln!(output, "{error}").ok();
        }
    }
    writeln!(output).ok();
    Ok(())
}

fn npm_program() -> &'static str {
    if cfg!(windows) {
        "npm.cmd"
    } else {
        "npm"
    }
}
