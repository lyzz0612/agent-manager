use anyhow::{anyhow, Context, Result};
use host_fs::{
    find_plugin_definition, gh_cli_install_command, gh_cli_install_root, plugin_home_dir,
    resolve_gh_cli_binary, user_home_dir, user_path_with_local_bin, GH_PLUGIN_ID, SUPPORTED_PLUGINS,
};
use host_model::{
    ActionMessage, AuthStep, GhAccountStatus, GhAuthFlowStatus, GhLoginSessionStatus,
    GhLoginStartResult, PluginDetail, PluginSummary, RuntimeActionResult,
};
use host_proc::{
    run_command_capture_with_env_timeout, run_command_streaming_with_env, run_command_with_env,
    CommandLineSink, OutputStream,
};
use regex::Regex;
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tracing::info;

const GH_HOSTNAME: &str = "github.com";
const GH_DEVICE_URL: &str = "https://github.com/login/device";
const LOGIN_TIMEOUT: Duration = Duration::from_secs(600);

#[derive(Debug, Default)]
struct GhLoginSessionState {
    active: bool,
    auth_url: Option<String>,
    device_code: Option<String>,
    message: String,
    error: Option<String>,
}

fn login_session() -> Arc<Mutex<GhLoginSessionState>> {
    static SESSION: OnceLock<Arc<Mutex<GhLoginSessionState>>> = OnceLock::new();
    SESSION
        .get_or_init(|| Arc::new(Mutex::new(GhLoginSessionState::default())))
        .clone()
}

pub struct GhProvider;

impl GhProvider {
    pub fn new() -> Self {
        Self
    }

    pub fn list_plugins(&self) -> Vec<PluginSummary> {
        SUPPORTED_PLUGINS
            .iter()
            .filter(|definition| definition.id == GH_PLUGIN_ID)
            .map(|definition| self.plugin_summary(definition))
            .collect()
    }

    pub fn plugin_detail(&self, plugin_id: &str) -> Result<PluginDetail> {
        if plugin_id != GH_PLUGIN_ID {
            return Err(anyhow!("暂不支持查看插件详情: {plugin_id}"));
        }

        let definition = find_plugin_definition(plugin_id)?;
        let status = self.plugin_runtime_status();

        Ok(PluginDetail {
            id: definition.id.to_string(),
            name: definition.name.to_string(),
            installed: status.installed,
            daemon_status: String::new(),
            providers_listing: String::new(),
            agents_listing: String::new(),
            daemon_pair_json: String::new(),
        })
    }

    pub fn install_plugin(&self, plugin_id: &str) -> Result<RuntimeActionResult> {
        if plugin_id != GH_PLUGIN_ID {
            return Err(anyhow!("暂不支持安装插件: {plugin_id}"));
        }
        self.install_gh(false)
    }

    pub fn install_plugin_with_sink(
        &self,
        plugin_id: &str,
        sink: &dyn CommandLineSink,
    ) -> Result<RuntimeActionResult> {
        if plugin_id != GH_PLUGIN_ID {
            return Err(anyhow!("暂不支持安装插件: {plugin_id}"));
        }
        self.install_gh_with_sink(false, sink)
    }

    pub fn upgrade_plugin(&self, plugin_id: &str) -> Result<RuntimeActionResult> {
        if plugin_id != GH_PLUGIN_ID {
            return Err(anyhow!("暂不支持升级插件: {plugin_id}"));
        }
        self.install_gh(true)
    }

    pub fn upgrade_plugin_with_sink(
        &self,
        plugin_id: &str,
        sink: &dyn CommandLineSink,
    ) -> Result<RuntimeActionResult> {
        if plugin_id != GH_PLUGIN_ID {
            return Err(anyhow!("暂不支持升级插件: {plugin_id}"));
        }
        self.install_gh_with_sink(true, sink)
    }

    pub fn uninstall_plugin_with_sink(
        &self,
        plugin_id: &str,
        sink: &dyn CommandLineSink,
    ) -> Result<RuntimeActionResult> {
        if plugin_id != GH_PLUGIN_ID {
            return Err(anyhow!("暂不支持卸载插件: {plugin_id}"));
        }
        sink.on_line(OutputStream::Stdout, "正在卸载 GitHub CLI…");
        self.uninstall_plugin(plugin_id)
    }

    pub fn uninstall_plugin(&self, plugin_id: &str) -> Result<RuntimeActionResult> {
        if plugin_id != GH_PLUGIN_ID {
            return Err(anyhow!("暂不支持卸载插件: {plugin_id}"));
        }

        let home = user_home_dir()?;
        let install_root = gh_cli_install_root(&home);
        let local_bin = home.join(".local").join("bin");

        for candidate in host_fs::gh_cli_binary_candidates(&home) {
            if candidate.starts_with(&install_root) || candidate.starts_with(&local_bin) {
                let _ = fs::remove_file(&candidate);
            }
        }

        if install_root.exists() {
            fs::remove_dir_all(&install_root)
                .with_context(|| format!("failed to remove {}", install_root.display()))?;
        }

        let status = self.plugin_runtime_status();
        Ok(RuntimeActionResult {
            installed: status.installed,
            version: status.version,
            install_dir: status.install_dir,
            data_dir: status.data_dir,
            message: "已卸载 GitHub CLI（保留 ~/.config/gh 用户数据）".to_string(),
        })
    }

    pub fn account_status(&self) -> GhAccountStatus {
        if !self.plugin_runtime_status().installed {
            return GhAccountStatus {
                logged_in: false,
                username: None,
                hostname: GH_HOSTNAME.to_string(),
                note: "尚未安装 GitHub CLI，无法检测账号状态。".to_string(),
            };
        }

        let home = match user_home_dir() {
            Ok(home) => home,
            Err(error) => {
                return GhAccountStatus {
                    logged_in: false,
                    username: None,
                    hostname: GH_HOSTNAME.to_string(),
                    note: error.to_string(),
                };
            }
        };

        match self.run_gh(&home, &["auth", "status", "--hostname", GH_HOSTNAME]) {
            Ok(output) => parse_gh_account_status(&output),
            Err(error) => GhAccountStatus {
                logged_in: false,
                username: None,
                hostname: GH_HOSTNAME.to_string(),
                note: format!("未能通过 `gh auth status` 解析账号信息: {error}"),
            },
        }
    }

    pub fn auth_flow_status(&self) -> GhAuthFlowStatus {
        GhAuthFlowStatus {
            summary: "点击「登录」获取验证码与授权链接，在浏览器完成 device 授权后，本页会自动刷新登录状态。"
                .to_string(),
            steps: vec![
                AuthStep {
                    title: "开始登录".to_string(),
                    detail: "系统会在后台执行 `gh auth login --web` 并展示 device 验证码与链接。"
                        .to_string(),
                },
                AuthStep {
                    title: "打开授权链接".to_string(),
                    detail: format!("在浏览器打开 {GH_DEVICE_URL}，输入一次性验证码。"),
                },
                AuthStep {
                    title: "等待确认".to_string(),
                    detail: "返回本页后无需手动刷新，系统会持续检测登录结果。".to_string(),
                },
            ],
        }
    }

    pub fn start_login(&self) -> GhLoginStartResult {
        if !self.plugin_runtime_status().installed {
            return GhLoginStartResult {
                started: false,
                already_logged_in: false,
                auth_url: None,
                device_code: None,
                message: "尚未安装 GitHub CLI，无法开始登录。".to_string(),
            };
        }

        if self.account_status().logged_in {
            return GhLoginStartResult {
                started: false,
                already_logged_in: true,
                auth_url: None,
                device_code: None,
                message: "当前已登录 GitHub.com。".to_string(),
            };
        }

        let session = login_session();
        {
            let guard = session.lock().expect("gh login session lock poisoned");
            if guard.active {
                return GhLoginStartResult {
                    started: true,
                    already_logged_in: false,
                    auth_url: guard.auth_url.clone(),
                    device_code: guard.device_code.clone(),
                    message: guard.message.clone(),
                };
            }
        }

        let home = match user_home_dir() {
            Ok(home) => home,
            Err(error) => {
                return GhLoginStartResult {
                    started: false,
                    already_logged_in: false,
                    auth_url: None,
                    device_code: None,
                    message: error.to_string(),
                };
            }
        };

        if let Err(error) = self.spawn_login_process(&home) {
            return GhLoginStartResult {
                started: false,
                already_logged_in: false,
                auth_url: None,
                device_code: None,
                message: error.to_string(),
            };
        }

        for _ in 0..20 {
            std::thread::sleep(Duration::from_millis(250));
            let guard = session.lock().expect("gh login session lock poisoned");
            if guard.device_code.is_some() || guard.error.is_some() {
                return GhLoginStartResult {
                    started: true,
                    already_logged_in: false,
                    auth_url: guard.auth_url.clone().or(Some(GH_DEVICE_URL.to_string())),
                    device_code: guard.device_code.clone(),
                    message: guard.message.clone(),
                };
            }
        }

        let guard = session.lock().expect("gh login session lock poisoned");
        GhLoginStartResult {
            started: true,
            already_logged_in: false,
            auth_url: guard.auth_url.clone().or(Some(GH_DEVICE_URL.to_string())),
            device_code: guard.device_code.clone(),
            message: guard.message.clone(),
        }
    }

    pub fn login_session_status(&self) -> GhLoginSessionStatus {
        let session = login_session();
        let guard = session.lock().expect("gh login session lock poisoned");
        GhLoginSessionStatus {
            active: guard.active,
            auth_url: guard.auth_url.clone(),
            device_code: guard.device_code.clone(),
            message: guard.message.clone(),
            error: guard.error.clone(),
        }
    }

    pub fn logout(&self) -> Result<ActionMessage> {
        if !self.plugin_runtime_status().installed {
            return Ok(ActionMessage {
                message: "GitHub CLI 未安装，无需注销。".to_string(),
            });
        }

        if !self.account_status().logged_in {
            return Ok(ActionMessage {
                message: "当前未登录 GitHub.com。".to_string(),
            });
        }

        let home = user_home_dir()?;
        self.run_gh(
            &home,
            &["auth", "logout", "--hostname", GH_HOSTNAME, "--yes"],
        )?;

        Ok(ActionMessage {
            message: "已注销 GitHub.com 登录。".to_string(),
        })
    }

    fn plugin_summary(&self, definition: &host_fs::PluginDefinition) -> PluginSummary {
        let status = self.plugin_runtime_status();
        PluginSummary {
            id: definition.id.to_string(),
            name: definition.name.to_string(),
            description: definition.description.to_string(),
            installed: status.installed,
            version: status.version,
            install_dir: status.install_dir,
            data_dir: status.data_dir,
            install_supported: definition.install_supported,
            install_command: if definition.install_supported {
                Some(if definition.id == GH_PLUGIN_ID {
                    gh_cli_install_command()
                } else {
                    definition.install_command.to_string()
                })
            } else {
                None
            },
            official_url: definition.official_url.to_string(),
            default_workspace: definition.default_workspace.to_string(),
        }
    }

    fn plugin_runtime_status(&self) -> PluginRuntimeStatus {
        let default_data_dir = user_home_dir()
            .map(|home| plugin_home_dir(&home, GH_PLUGIN_ID).to_string_lossy().to_string())
            .unwrap_or_else(|_| "~/.config/gh".to_string());

        let Ok(home) = user_home_dir() else {
            return PluginRuntimeStatus {
                installed: false,
                version: None,
                install_dir: String::new(),
                data_dir: default_data_dir,
            };
        };

        let env = self.user_env(&home);
        let data_dir = plugin_home_dir(&home, GH_PLUGIN_ID)
            .to_string_lossy()
            .to_string();
        let install_dir = resolve_gh_cli_binary(&home)
            .ok()
            .and_then(|path| {
                path.parent()
                    .map(|parent| parent.to_string_lossy().to_string())
            })
            .unwrap_or_else(|| gh_cli_install_root(&home).to_string_lossy().to_string());
        let installed = resolve_gh_cli_binary(&home).is_ok();
        let version = if installed {
            self.read_gh_version(&home, &env)
        } else {
            None
        };

        PluginRuntimeStatus {
            installed,
            version,
            install_dir,
            data_dir,
        }
    }

    fn install_gh(&self, upgrade: bool) -> Result<RuntimeActionResult> {
        self.install_gh_with_sink(upgrade, &NoopSink)
    }

    fn install_gh_with_sink(
        &self,
        upgrade: bool,
        sink: &dyn CommandLineSink,
    ) -> Result<RuntimeActionResult> {
        let started = Instant::now();
        let home = user_home_dir()?;
        let env = self.user_env(&home);

        if upgrade && !self.plugin_runtime_status().installed {
            return Err(anyhow!("当前未检测到已安装的 GitHub CLI，无法执行升级"));
        }

        sink.on_line(
            OutputStream::Stdout,
            if upgrade {
                "正在获取 GitHub CLI 最新 release…"
            } else {
                "正在下载 GitHub CLI…"
            },
        );

        let (version, asset_url) = fetch_latest_release_asset()?;
        let staging = home.join(".local").join("tmp");
        fs::create_dir_all(&staging)?;
        let archive_path = staging.join(asset_file_name(&version));

        let handles = host_proc::ProcHandles::new(sink);
        let capture = run_command_streaming_with_env(
            "curl",
            &["-fsSL", "-o", archive_path.to_string_lossy().as_ref(), &asset_url],
            &home,
            &env,
            Some(Duration::from_secs(300)),
            handles.child(),
            handles.cancel(),
            |stream, line| sink.on_line(stream, line),
        )
        .with_context(|| format!("failed to download gh release from {asset_url}"))?;

        if !capture.success {
            return Err(anyhow!("下载 GitHub CLI 失败: {}", capture.output));
        }

        sink.on_line(OutputStream::Stdout, "正在解压 GitHub CLI…");

        let install_version_dir = gh_cli_install_root(&home).join(&version);
        fs::create_dir_all(&install_version_dir)?;
        extract_gh_archive(&archive_path, &install_version_dir)?;

        let binary = find_extracted_gh_binary(&install_version_dir)?;
        let local_bin_dir = home.join(".local").join("bin");
        fs::create_dir_all(&local_bin_dir)?;
        let link_path = local_bin_dir.join(if cfg!(windows) { "gh.exe" } else { "gh" });
        if link_path.exists() {
            fs::remove_file(&link_path)?;
        }

        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&binary, &link_path)
                .with_context(|| format!("failed to link {} -> {}", link_path.display(), binary.display()))?;
        }

        #[cfg(windows)]
        {
            fs::copy(&binary, &link_path)
                .with_context(|| format!("failed to copy gh to {}", link_path.display()))?;
        }

        let _ = fs::remove_file(&archive_path);

        let status = self.plugin_runtime_status();
        if !status.installed {
            return Err(anyhow!(
                "GitHub CLI 安装完成，但未检测到 gh 可执行文件，请确认 ~/.local/bin 在 PATH 中"
            ));
        }

        info!(
            plugin_id = GH_PLUGIN_ID,
            version = ?status.version,
            elapsed_ms = started.elapsed().as_millis(),
            "gh plugin installed"
        );

        let action = if upgrade { "升级" } else { "安装" };
        Ok(RuntimeActionResult {
            installed: status.installed,
            version: status.version,
            install_dir: status.install_dir,
            data_dir: status.data_dir,
            message: format!("已{action} GitHub CLI（官方 release {version}）"),
        })
    }

    fn read_gh_version(&self, home: &Path, env: &BTreeMap<String, String>) -> Option<String> {
        let binary = resolve_gh_cli_binary(home).ok()?;
        let output = run_gh_cli(
            &binary,
            &["--version"],
            home,
            env,
            Some(Duration::from_secs(5)),
        )
        .ok()?;
        output
            .lines()
            .next()
            .map(|line| line.trim().to_string())
            .filter(|line| !line.is_empty())
    }

    fn run_gh(&self, home: &Path, args: &[&str]) -> Result<String> {
        let env = self.user_env(home);
        let binary = resolve_gh_cli_binary(home)?;
        run_gh_cli(&binary, args, home, &env, Some(Duration::from_secs(30)))
    }

    fn spawn_login_process(&self, home: &Path) -> Result<()> {
        let binary = resolve_gh_cli_binary(home)?;
        let program = binary.to_string_lossy().to_string();
        let home_buf = home.to_path_buf();
        let envs = self.user_env(home);
        let session = login_session();
        let started = Instant::now();

        {
            let mut guard = session.lock().expect("gh login session lock poisoned");
            guard.active = true;
            guard.auth_url = Some(GH_DEVICE_URL.to_string());
            guard.device_code = None;
            guard.error = None;
            guard.message = "正在启动 GitHub 登录...".to_string();
        }

        std::thread::spawn(move || {
            let mut command = Command::new(&program);
            command
                .args([
                    "auth",
                    "login",
                    "--hostname",
                    GH_HOSTNAME,
                    "--git-protocol",
                    "https",
                    "--web",
                    "--skip-ssh-key",
                ])
                .current_dir(&home_buf)
                .envs(&envs)
                .env("BROWSER", "false")
                .env("GH_BROWSER", "false")
                .env("GH_FORCE_TTY", "1")
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());

            let mut child = match command.spawn() {
                Ok(child) => child,
                Err(error) => {
                    set_login_session_error(&session, error.to_string());
                    return;
                }
            };

            if let Some(mut stdin) = child.stdin.take() {
                std::thread::spawn(move || {
                    let _ = stdin.write_all(b"\n");
                });
            }

            if let Some(stdout) = child.stdout.take() {
                let session_clone = session.clone();
                std::thread::spawn(move || {
                    let reader = BufReader::new(stdout);
                    for line in reader.lines().map_while(Result::ok) {
                        update_login_session_from_line(&session_clone, &line);
                    }
                });
            }

            if let Some(stderr) = child.stderr.take() {
                let session_clone = session.clone();
                std::thread::spawn(move || {
                    let reader = BufReader::new(stderr);
                    for line in reader.lines().map_while(Result::ok) {
                        update_login_session_from_line(&session_clone, &line);
                    }
                });
            }

            let exit_status = {
                let deadline = started + LOGIN_TIMEOUT;
                loop {
                    match child.try_wait() {
                        Ok(Some(status)) => break Ok(status),
                        Ok(None) if Instant::now() >= deadline => {
                            let _ = child.kill();
                            set_login_session_error(
                                &session,
                                "登录超时（10 分钟），请重试。".to_string(),
                            );
                            return;
                        }
                        Ok(None) => {
                            std::thread::sleep(Duration::from_millis(250));
                        }
                        Err(error) => break Err(error),
                    }
                }
            };
            let mut guard = session.lock().expect("gh login session lock poisoned");
            guard.active = false;

            match exit_status {
                Ok(status) if status.success() => {
                    guard.message = "登录成功。".to_string();
                    info!(
                        plugin_id = GH_PLUGIN_ID,
                        elapsed_ms = started.elapsed().as_millis(),
                        "gh login completed"
                    );
                }
                Ok(_) if guard.error.is_none() => {
                    guard.error = Some("登录未完成或已取消。".to_string());
                    if guard.message.is_empty() {
                        guard.message = "登录流程已结束。".to_string();
                    }
                }
                Err(error) if guard.error.is_none() => {
                    guard.error = Some(error.to_string());
                }
                _ => {}
            }
        });

        Ok(())
    }

    fn user_env(&self, home: &Path) -> BTreeMap<String, String> {
        let mut envs = BTreeMap::new();
        envs.insert("HOME".to_string(), home.to_string_lossy().to_string());
        envs.insert("USERPROFILE".to_string(), home.to_string_lossy().to_string());
        envs.insert("PATH".to_string(), user_path_with_local_bin(home));
        envs
    }
}

#[derive(Debug, Clone)]
struct PluginRuntimeStatus {
    installed: bool,
    version: Option<String>,
    install_dir: String,
    data_dir: String,
}

fn fetch_latest_release_asset() -> Result<(String, String)> {
    let home = user_home_dir()?;
    let env = BTreeMap::from([("PATH".to_string(), user_path_with_local_bin(&home))]);
    let capture = run_command_capture_with_env_timeout(
        "curl",
        &["-fsSL", "https://api.github.com/repos/cli/cli/releases/latest"],
        &home,
        &env,
        Some(Duration::from_secs(60)),
    )?;
    if !capture.success {
        return Err(anyhow!("failed to fetch gh releases: {}", capture.output));
    }

    let json: Value =
        serde_json::from_str(&capture.output).context("gh releases response is not JSON")?;
    let tag = json
        .get("tag_name")
        .and_then(|value| value.as_str())
        .ok_or_else(|| anyhow!("gh releases response missing tag_name"))?;
    let version = tag.trim_start_matches('v').to_string();
    let suffix = release_asset_suffix();

    let assets = json
        .get("assets")
        .and_then(|value| value.as_array())
        .ok_or_else(|| anyhow!("gh releases response missing assets"))?;

    let download_url = assets
        .iter()
        .find_map(|asset| {
            let name = asset.get("name")?.as_str()?;
            if name.ends_with(suffix) {
                asset.get("browser_download_url")?.as_str().map(str::to_string)
            } else {
                None
            }
        })
        .ok_or_else(|| anyhow!("no gh release asset matching *{suffix}"))?;

    Ok((version, download_url))
}

fn release_asset_suffix() -> &'static str {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("linux", "x86_64") => "linux_amd64.tar.gz",
        ("linux", "aarch64") => "linux_arm64.tar.gz",
        ("macos", "x86_64") => "macOS_amd64.tar.gz",
        ("macos", "aarch64") => "macOS_arm64.tar.gz",
        ("windows", "x86_64") => "windows_amd64.zip",
        _ => "linux_amd64.tar.gz",
    }
}

fn asset_file_name(version: &str) -> String {
    format!("gh_{version}_{}", release_asset_suffix())
}

fn extract_gh_archive(archive_path: &Path, dest_dir: &Path) -> Result<()> {
    let home = user_home_dir()?;
    let env = BTreeMap::from([("PATH".to_string(), user_path_with_local_bin(&home))]);
    let archive = archive_path.to_string_lossy().to_string();
    let dest = dest_dir.to_string_lossy().to_string();

    if archive.ends_with(".zip") {
        if cfg!(windows) {
            run_command_with_env(
                "powershell",
                &[
                    "-NoProfile",
                    "-Command",
                    &format!("Expand-Archive -Path '{archive}' -DestinationPath '{dest}' -Force"),
                ],
                &home,
                &env,
            )?;
        } else {
            run_command_with_env("unzip", &["-o", &archive, "-d", &dest], &home, &env)?;
        }
    } else {
        run_command_with_env("tar", &["-xzf", &archive, "-C", &dest], &home, &env)?;
    }

    Ok(())
}

fn find_extracted_gh_binary(root: &Path) -> Result<PathBuf> {
    let binary_name = if cfg!(windows) { "gh.exe" } else { "gh" };
    let direct = root.join("bin").join(binary_name);
    if direct.exists() {
        return Ok(direct);
    }

    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            let nested = path.join("bin").join(binary_name);
            if nested.exists() {
                return Ok(nested);
            }
        }
    }

    Err(anyhow!("gh binary not found under {}", root.display()))
}

fn run_gh_cli(
    program: &Path,
    args: &[&str],
    home: &Path,
    env: &BTreeMap<String, String>,
    timeout: Option<Duration>,
) -> Result<String> {
    let program_string = program.to_string_lossy().to_string();
    let capture = if let Some(limit) = timeout {
        run_command_capture_with_env_timeout(&program_string, args, home, env, Some(limit))?
    } else {
        host_proc::run_command_capture_with_env(&program_string, args, home, env)?
    };

    if capture.success {
        Ok(capture.output)
    } else {
        Err(anyhow!("gh command failed: {}", capture.output))
    }
}

fn parse_gh_account_status(output: &str) -> GhAccountStatus {
    let lower = output.to_ascii_lowercase();
    let username = Regex::new(r"(?i)logged in to github\.com as ([^\s]+)")
        .ok()
        .and_then(|regex| regex.captures(output))
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().to_string());
    let logged_out = lower.contains("not logged in") || lower.contains("no accounts");
    let logged_in = !logged_out && username.is_some();

    GhAccountStatus {
        logged_in,
        username,
        hostname: GH_HOSTNAME.to_string(),
        note: "GitHub CLI 账号信息由 `gh auth status` 做 best-effort 解析。".to_string(),
    }
}

fn update_login_session_from_line(session: &Arc<Mutex<GhLoginSessionState>>, line: &str) {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return;
    }

    let mut guard = session.lock().expect("gh login session lock poisoned");
    if let Some(code) = extract_device_code(trimmed) {
        guard.device_code = Some(code);
        guard.auth_url = Some(GH_DEVICE_URL.to_string());
        guard.message = "请在浏览器打开授权链接并输入验证码。".to_string();
        return;
    }

    if let Some(url) = extract_auth_url(trimmed) {
        guard.auth_url = Some(url);
    }

    if guard.device_code.is_none() {
        guard.message = trimmed.to_string();
    }
}

fn set_login_session_error(session: &Arc<Mutex<GhLoginSessionState>>, message: String) {
    let mut guard = session.lock().expect("gh login session lock poisoned");
    guard.active = false;
    guard.error = Some(message.clone());
    guard.message = message;
}

fn extract_device_code(text: &str) -> Option<String> {
    Regex::new(r"(?i)\b([A-Z0-9]{4}-[A-Z0-9]{4})\b")
        .ok()?
        .captures(text)
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().to_uppercase())
}

fn extract_auth_url(text: &str) -> Option<String> {
    Regex::new(r"https://github\.com/login/device")
        .ok()?
        .find(text)
        .map(|value| value.as_str().to_string())
}

struct NoopSink;

impl CommandLineSink for NoopSink {
    fn on_line(&self, _stream: OutputStream, _line: &str) {}
}
