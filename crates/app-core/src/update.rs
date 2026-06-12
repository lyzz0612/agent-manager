use crate::{read_version, AppConfig};
use anyhow::{anyhow, Context, Result};
use host_model::{AppSettings, AppUpdateResult};
use host_proc::run_command_capture;
use std::fmt::Write as _;
use std::path::Path;

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

pub fn pull_and_build(config: &AppConfig) -> Result<AppUpdateResult> {
    let git = read_git_state(&config.repo_root, true)
        .context("failed to inspect repository before update")?;

    if git.behind_commits == 0 {
        return Ok(AppUpdateResult {
            success: true,
            message: "当前已是最新版本，无需拉取。".to_string(),
            output: String::new(),
            version: config.version.clone(),
            git_commit: Some(git.commit),
            restart_required: false,
        });
    }

    let upstream = git
        .upstream_ref
        .clone()
        .ok_or_else(|| anyhow!("无法确定远程跟踪分支"))?;

    let mut output = String::new();
    let mut success = true;

    append_step(
        &mut output,
        &mut success,
        "git pull",
        run_git_capture(&config.repo_root, &["pull", "--ff-only", "origin", &git.branch]),
    )?;

    if success {
        append_step(
            &mut output,
            &mut success,
            "npm run build:web",
            run_command_capture(npm_program(), &["run", "build:web"], &config.repo_root),
        )?;
    }

    if success {
        append_step(
            &mut output,
            &mut success,
            "cargo build -p agent-manager-server",
            run_command_capture(
                "cargo",
                &["build", "-p", "agent-manager-server"],
                &config.repo_root,
            ),
        )?;
    }

    let refreshed = read_git_state(&config.repo_root, false).ok();
    let version = read_version(&config.repo_root).unwrap_or_else(|_| config.version.clone());

    Ok(AppUpdateResult {
        success,
        message: if success {
            format!("已从 GitHub 拉取更新并完成构建（{upstream}）。请重启服务使后端生效。")
        } else {
            "更新失败，请查看下方命令输出。".to_string()
        },
        output,
        version,
        git_commit: refreshed.map(|state| state.commit),
        restart_required: success,
    })
}

struct GitState {
    remote: String,
    branch: String,
    commit: String,
    upstream_ref: Option<String>,
    upstream_commit: Option<String>,
    behind_commits: u32,
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
        upstream_ref,
        upstream_commit,
        behind_commits,
    })
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

fn run_git(repo_root: &Path, args: &[&str]) -> Result<String> {
    let capture = run_git_capture(repo_root, args)?;
    if capture.success {
        Ok(capture.output)
    } else {
        Err(anyhow!("git {} failed: {}", args.join(" "), capture.output))
    }
}

fn run_git_capture(repo_root: &Path, args: &[&str]) -> Result<host_proc::CommandCapture> {
    run_command_capture("git", args, repo_root).with_context(|| format!("failed to run git {}", args.join(" ")))
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
