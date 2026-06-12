use anyhow::{anyhow, Context, Result};
use host_fs::{
    find_plugin_definition, plugin_config_path, plugin_home_dir, user_home_dir,
    user_path_with_local_bin, PASEO_DEFAULT_WORKSPACE, PASEO_OFFICIAL_RELAY_ENDPOINT,
    PASEO_PLUGIN_ID, SUPPORTED_PLUGINS,
};
use host_model::{ActionMessage, PluginDetail, PluginSummary, RuntimeActionResult};
use host_proc::{run_command_capture_with_env, run_command_capture_with_env_timeout, run_command_with_env};
use std::time::Duration;
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

pub struct PaseoProvider;

impl PaseoProvider {
    pub fn new() -> Self {
        Self
    }

    pub fn list_plugins(&self) -> Vec<PluginSummary> {
        SUPPORTED_PLUGINS
            .iter()
            .map(|definition| self.plugin_summary(definition))
            .collect()
    }

    pub fn plugin_detail(&self, plugin_id: &str) -> Result<PluginDetail> {
        let definition = find_plugin_definition(plugin_id)?;
        let status = self.plugin_runtime_status(definition.id);

        match plugin_id {
            PASEO_PLUGIN_ID => {
                let (daemon_status, providers_listing, agents_listing, daemon_pair_json) =
                    if status.installed {
                        self.read_paseo_detail_outputs()?
                    } else {
                        (
                            "Paseo CLI 未安装，无法执行 paseo daemon status".to_string(),
                            "Paseo CLI 未安装，无法执行 paseo provider ls".to_string(),
                            "Paseo CLI 未安装，无法执行 paseo ls".to_string(),
                            "Paseo CLI 未安装，无法执行 paseo daemon pair --json".to_string(),
                        )
                    };

                Ok(PluginDetail {
                    id: definition.id.to_string(),
                    name: definition.name.to_string(),
                    installed: status.installed,
                    daemon_status,
                    providers_listing,
                    agents_listing,
                    daemon_pair_json,
                })
            }
            other => Err(anyhow!("暂不支持查看插件详情: {other}")),
        }
    }

    pub fn install_plugin(&self, plugin_id: &str) -> Result<RuntimeActionResult> {
        let definition = find_plugin_definition(plugin_id)?;
        if !definition.install_supported {
            return Err(anyhow!("暂不支持安装插件: {plugin_id}"));
        }

        match plugin_id {
            PASEO_PLUGIN_ID => self.install_paseo(),
            other => Err(anyhow!("暂不支持安装插件: {other}")),
        }
    }

    pub fn upgrade_plugin(&self, plugin_id: &str) -> Result<RuntimeActionResult> {
        let definition = find_plugin_definition(plugin_id)?;
        if !definition.install_supported {
            return Err(anyhow!("暂不支持升级插件: {plugin_id}"));
        }

        match plugin_id {
            PASEO_PLUGIN_ID => self.upgrade_paseo(),
            other => Err(anyhow!("暂不支持升级插件: {other}")),
        }
    }

    pub fn daemon_action(&self, plugin_id: &str, action: &str) -> Result<ActionMessage> {
        if plugin_id != PASEO_PLUGIN_ID {
            return Err(anyhow!("暂不支持 daemon 操作: {plugin_id}"));
        }

        let status = self.plugin_runtime_status(PASEO_PLUGIN_ID);
        if !status.installed {
            return Err(anyhow!("Paseo CLI 未安装，无法执行 daemon 操作"));
        }

        let command = match action {
            "start" => "start",
            "stop" => "stop",
            "restart" => "restart",
            other => return Err(anyhow!("未知 daemon 操作: {other}")),
        };

        let home = user_home_dir()?;
        let env = self.user_env(&home);
        let binary = resolve_paseo_cli_binary(&home, &env)?;
        let output = capture_paseo_cli_output(
            &binary,
            &["daemon", command],
            &home,
            &env,
            Some(Duration::from_secs(15)),
        );
        let status_output = capture_paseo_cli_output(
            &binary,
            &["daemon", "status"],
            &home,
            &env,
            Some(Duration::from_secs(8)),
        );

        Ok(ActionMessage {
            message: format!("paseo daemon {command} 完成\n\n{output}\n\n{status_output}"),
        })
    }

    pub fn uninstall_plugin(&self, plugin_id: &str) -> Result<RuntimeActionResult> {
        let definition = find_plugin_definition(plugin_id)?;
        if !definition.install_supported {
            return Err(anyhow!("暂不支持卸载插件: {plugin_id}"));
        }

        match plugin_id {
            PASEO_PLUGIN_ID => self.uninstall_paseo(),
            other => Err(anyhow!("暂不支持卸载插件: {other}")),
        }
    }

    fn plugin_summary(&self, definition: &host_fs::PluginDefinition) -> PluginSummary {
        let status = self.plugin_runtime_status(definition.id);
        PluginSummary {
            id: definition.id.to_string(),
            name: definition.name.to_string(),
            installed: status.installed,
            version: status.version,
            install_dir: status.install_dir,
            data_dir: status.data_dir,
            install_supported: definition.install_supported,
            install_command: if definition.install_supported {
                Some(definition.install_command.to_string())
            } else {
                None
            },
            official_url: definition.official_url.to_string(),
            default_workspace: definition.default_workspace.to_string(),
        }
    }

    fn plugin_runtime_status(&self, plugin_id: &str) -> PluginRuntimeStatus {
        if find_plugin_definition(plugin_id).is_err() {
            return PluginRuntimeStatus {
                installed: false,
                version: None,
                install_dir: String::new(),
                data_dir: format!("~/.{plugin_id}"),
            };
        }

        let default_data_dir = plugin_home_dir(
            &user_home_dir().unwrap_or_else(|_| PathBuf::from("~")),
            plugin_id,
        )
        .to_string_lossy()
        .to_string();

        let Ok(home) = user_home_dir() else {
            return PluginRuntimeStatus {
                installed: false,
                version: None,
                install_dir: String::new(),
                data_dir: default_data_dir,
            };
        };

        if plugin_id != PASEO_PLUGIN_ID {
            return PluginRuntimeStatus {
                installed: false,
                version: None,
                install_dir: String::new(),
                data_dir: default_data_dir,
            };
        }

        let env = self.user_env(&home);
        let data_dir = plugin_home_dir(&home, plugin_id)
            .to_string_lossy()
            .to_string();
        let install_dir = resolve_paseo_cli_binary(&home, &env)
            .ok()
            .map(|path| {
                path.parent()
                    .map(|parent| parent.to_string_lossy().to_string())
                    .unwrap_or_else(|| path.to_string_lossy().to_string())
            })
            .or_else(|| {
                npm_global_prefix(&home, &env)
                    .map(|path| path.to_string_lossy().to_string())
            })
            .unwrap_or_else(|| "npm 全局目录".to_string());
        let installed = is_paseo_installed(&home, &env);
        let version = if installed {
            read_paseo_version(&home, &env)
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

    fn read_paseo_detail_outputs(&self) -> Result<(String, String, String, String)> {
        let home = user_home_dir()?;
        let env = self.user_env(&home);
        let binary = resolve_paseo_cli_binary(&home, &env)?;

        let daemon_status = capture_paseo_cli_output(
            &binary,
            &["daemon", "status"],
            &home,
            &env,
            Some(Duration::from_secs(8)),
        );
        let providers_listing = capture_paseo_cli_output(
            &binary,
            &["provider", "ls"],
            &home,
            &env,
            Some(Duration::from_secs(8)),
        );
        let agents_listing =
            capture_paseo_cli_output(&binary, &["ls"], &home, &env, Some(Duration::from_secs(8)));
        let daemon_pair_json = sanitize_daemon_pair_json(capture_paseo_cli_output(
            &binary,
            &["daemon", "pair", "--json"],
            &home,
            &env,
            Some(Duration::from_secs(8)),
        ));

        Ok((
            daemon_status,
            providers_listing,
            agents_listing,
            daemon_pair_json,
        ))
    }

    fn install_paseo(&self) -> Result<RuntimeActionResult> {
        let home = user_home_dir()?;
        let env = self.user_env(&home);

        run_command_with_env("npm", &["install", "-g", "@getpaseo/cli"], &home, &env)
            .context("failed to install @getpaseo/cli via npm")?;

        fs::create_dir_all(PASEO_DEFAULT_WORKSPACE).with_context(|| {
            format!("failed to create default workspace directory: {PASEO_DEFAULT_WORKSPACE}")
        })?;

        self.write_paseo_config(&home)?;
        self.ensure_paseo_daemon(&home, &env)?;

        let status = self.plugin_runtime_status(PASEO_PLUGIN_ID);
        if !status.installed {
            return Err(anyhow!(
                "npm 安装完成，但未检测到 @getpaseo/cli，请确认 npm 全局目录可用"
            ));
        }

        Ok(RuntimeActionResult {
            installed: status.installed,
            version: status.version,
            install_dir: status.install_dir,
            data_dir: status.data_dir,
            message: format!(
                "已安装 Paseo CLI，写入官方 relay 配置，并已启动本地 daemon；默认工作区为 {PASEO_DEFAULT_WORKSPACE}"
            ),
        })
    }

    fn upgrade_paseo(&self) -> Result<RuntimeActionResult> {
        let status = self.plugin_runtime_status(PASEO_PLUGIN_ID);
        if !status.installed {
            return Err(anyhow!("当前未检测到已安装的 Paseo CLI，无法执行升级"));
        }

        let home = user_home_dir()?;
        let env = self.user_env(&home);

        run_command_with_env(
            "npm",
            &["install", "-g", "@getpaseo/cli@latest"],
            &home,
            &env,
        )
        .context("failed to upgrade @getpaseo/cli via npm")?;

        self.write_paseo_config(&home)?;
        self.ensure_paseo_daemon(&home, &env)?;

        let status = self.plugin_runtime_status(PASEO_PLUGIN_ID);

        Ok(RuntimeActionResult {
            installed: status.installed,
            version: status.version,
            install_dir: status.install_dir,
            data_dir: status.data_dir,
            message: "已升级 Paseo CLI 到最新版本，并已确保本地 daemon 运行".to_string(),
        })
    }

    fn uninstall_paseo(&self) -> Result<RuntimeActionResult> {
        let home = user_home_dir()?;
        let env = self.user_env(&home);

        if resolve_paseo_cli_binary(&home, &env).is_ok() {
            let _ = resolve_paseo_cli_binary(&home, &env).and_then(|binary| {
                run_paseo_cli(&binary, &["daemon", "stop"], &home, &env, Some(Duration::from_secs(8)))
            });
        }

        if is_paseo_installed(&home, &env) {
            run_command_with_env("npm", &["uninstall", "-g", "@getpaseo/cli"], &home, &env)
                .context("failed to uninstall @getpaseo/cli via npm")?;
        } else {
            return Err(anyhow!("当前未检测到已安装的 Paseo CLI，无法执行卸载"));
        }

        let status = self.plugin_runtime_status(PASEO_PLUGIN_ID);

        Ok(RuntimeActionResult {
            installed: status.installed,
            version: status.version,
            install_dir: status.install_dir,
            data_dir: status.data_dir,
            message: "已卸载 Paseo CLI（保留 ~/.paseo 用户数据）".to_string(),
        })
    }

    fn write_paseo_config(&self, home: &Path) -> Result<()> {
        let paseo_home = plugin_home_dir(home, PASEO_PLUGIN_ID);
        fs::create_dir_all(&paseo_home)?;

        let config_path = plugin_config_path(home, PASEO_PLUGIN_ID);
        let mut config = if config_path.exists() {
            let content = fs::read_to_string(&config_path)
                .with_context(|| format!("failed to read {}", config_path.display()))?;
            serde_json::from_str(&content).context("Paseo 配置文件不是合法 JSON")?
        } else {
            json!({
                "$schema": "https://paseo.sh/schemas/paseo.config.v1.json",
                "version": 1,
                "daemon": {
                    "listen": "127.0.0.1:6767",
                    "hostnames": ["localhost", ".localhost"],
                    "mcp": { "enabled": true }
                }
            })
        };

        if !config.is_object() {
            config = json!({});
        }

        let object = config
            .as_object_mut()
            .expect("config should be a JSON object after normalization");

        object.insert(
            "$schema".to_string(),
            json!("https://paseo.sh/schemas/paseo.config.v1.json"),
        );
        object.insert("version".to_string(), json!(1));

        let daemon = object
            .entry("daemon".to_string())
            .or_insert_with(|| Value::Object(Map::new()));
        if !daemon.is_object() {
            *daemon = Value::Object(Map::new());
        }

        let daemon_object = daemon.as_object_mut().expect("daemon should be an object");
        daemon_object
            .entry("listen".to_string())
            .or_insert_with(|| json!("127.0.0.1:6767"));
        daemon_object
            .entry("hostnames".to_string())
            .or_insert_with(|| json!(["localhost", ".localhost"]));
        daemon_object.insert(
            "relay".to_string(),
            json!({
                "enabled": true,
                "endpoint": PASEO_OFFICIAL_RELAY_ENDPOINT,
                "publicEndpoint": PASEO_OFFICIAL_RELAY_ENDPOINT,
                "useTls": true
            }),
        );

        let contents = serde_json::to_string_pretty(&Value::Object(object.clone()))?;
        fs::write(&config_path, contents.as_bytes())
            .with_context(|| format!("failed to write {}", config_path.display()))?;

        Ok(())
    }

    fn ensure_paseo_daemon(&self, home: &Path, env: &BTreeMap<String, String>) -> Result<()> {
        let binary = resolve_paseo_cli_binary(home, env)?;
        let status = capture_paseo_cli_output(
            &binary,
            &["daemon", "status"],
            home,
            env,
            Some(Duration::from_secs(8)),
        );
        if status.contains("running") {
            return Ok(());
        }

        run_paseo_cli(
            &binary,
            &["daemon", "start"],
            home,
            env,
            Some(Duration::from_secs(15)),
        )
        .context("failed to start Paseo daemon after install/upgrade")?;

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

fn is_paseo_installed(home: &Path, env: &BTreeMap<String, String>) -> bool {
    resolve_paseo_cli_binary(home, env).is_ok() || read_paseo_version_from_npm(home, env).is_some()
}

fn read_paseo_version(home: &Path, env: &BTreeMap<String, String>) -> Option<String> {
    if let Ok(binary) = resolve_paseo_cli_binary(home, env) {
        if let Ok(output) = run_paseo_cli(
            &binary,
            &["--version"],
            home,
            env,
            Some(Duration::from_secs(3)),
        ) {
            let version = output.trim().to_string();
            if !version.is_empty() {
                return Some(version);
            }
        }
    }

    read_paseo_version_from_npm(home, env)
}

fn run_paseo_cli(
    program: &Path,
    args: &[&str],
    home: &Path,
    env: &BTreeMap<String, String>,
    timeout: Option<Duration>,
) -> Result<String> {
    let program_string = program.to_string_lossy().to_string();
    let (program, arg_refs): (&str, Vec<&str>) = if cfg!(windows) {
        let lower = program_string.to_lowercase();
        if lower.ends_with(".cmd") || lower.ends_with(".bat") {
            let mut wrapped = vec!["/C", program_string.as_str()];
            wrapped.extend(args);
            ("cmd", wrapped)
        } else {
            (program_string.as_str(), args.to_vec())
        }
    } else {
        (program_string.as_str(), args.to_vec())
    };

    let capture = if let Some(limit) = timeout {
        run_command_capture_with_env_timeout(program, &arg_refs, home, env, Some(limit))?
    } else {
        run_command_capture_with_env(program, &arg_refs, home, env)?
    };

    if capture.output.trim().is_empty() {
        return Err(anyhow!("paseo command produced no output"));
    }

    Ok(capture.output.trim().to_string())
}

fn capture_paseo_cli_output(
    program: &Path,
    args: &[&str],
    home: &Path,
    env: &BTreeMap<String, String>,
    timeout: Option<Duration>,
) -> String {
    run_paseo_cli(program, args, home, env, timeout).unwrap_or_else(|error| error.to_string())
}

fn sanitize_daemon_pair_json(raw: String) -> String {
    let Ok(mut json) = serde_json::from_str::<Value>(&raw) else {
        return raw;
    };

    if let Some(object) = json.as_object_mut() {
        object.remove("qr");
    }

    serde_json::to_string_pretty(&json).unwrap_or(raw)
}

fn read_paseo_version_from_npm(home: &Path, env: &BTreeMap<String, String>) -> Option<String> {
    let output = run_command_capture_with_env_timeout(
        "npm",
        &["list", "-g", "@getpaseo/cli", "--depth=0", "--json"],
        home,
        env,
        Some(Duration::from_secs(3)),
    )
    .ok()?;
    if output.output.trim().is_empty() {
        return None;
    }
    let json: Value = serde_json::from_str(&output.output).ok()?;
    json.pointer("/dependencies/@getpaseo/cli/version")
        .and_then(|value| value.as_str())
        .map(ToString::to_string)
}

fn resolve_paseo_cli_binary(home: &Path, env: &BTreeMap<String, String>) -> Result<PathBuf> {
    for candidate in paseo_path_candidates(home, env) {
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    if cfg!(windows) {
        if let Ok(output) = run_command_capture_with_env_timeout(
            "where",
            &["paseo"],
            home,
            env,
            Some(Duration::from_secs(3)),
        ) {
            if output.success || !output.output.trim().is_empty() {
                for line in output.output.lines() {
                    let path = PathBuf::from(line.trim());
                    if path.exists() {
                        return Ok(path);
                    }
                }
            }
        }
    } else if let Ok(output) = run_command_capture_with_env_timeout(
        "bash",
        &["-lc", "command -v paseo"],
        home,
        env,
        Some(Duration::from_secs(3)),
    ) {
        if !output.output.trim().is_empty() {
            let path = PathBuf::from(output.output.trim());
            if path.exists() {
                return Ok(path);
            }
        }
    }

    Err(anyhow!("未找到 Paseo CLI（npm 全局目录中的 paseo）"))
}

fn paseo_path_candidates(home: &Path, env: &BTreeMap<String, String>) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if cfg!(windows) {
        for key in ["NVM_SYMLINK", "NVM_HOME"] {
            if let Ok(value) = std::env::var(key) {
                candidates.extend(paseo_binary_candidates(&PathBuf::from(value)));
            }
        }

        if let Ok(appdata) = std::env::var("APPDATA") {
            candidates.extend(paseo_binary_candidates(&PathBuf::from(appdata).join("npm")));
        }
    } else {
        candidates.extend(paseo_binary_candidates(&home.join(".npm-global")));
    }

    if let Some(prefix) = npm_global_prefix(home, env) {
        candidates.extend(paseo_binary_candidates(&prefix));
    }

    candidates
}

fn paseo_binary_candidates(prefix: &Path) -> Vec<PathBuf> {
    if cfg!(windows) {
        vec![
            prefix.join("paseo.cmd"),
            prefix.join("paseo.exe"),
            prefix.join("paseo"),
            prefix.join("bin").join("paseo.cmd"),
            prefix.join("bin").join("paseo.exe"),
            prefix.join("bin").join("paseo"),
        ]
    } else {
        vec![
            prefix.join("bin").join("paseo"),
            prefix.join("paseo"),
        ]
    }
}

fn npm_global_prefix(home: &Path, env: &BTreeMap<String, String>) -> Option<PathBuf> {
    let output = run_command_capture_with_env_timeout(
        "npm",
        &["config", "get", "prefix"],
        home,
        env,
        Some(Duration::from_secs(3)),
    )
    .ok()?;
    let trimmed = output.output.trim();
    if trimmed.is_empty() || trimmed == "undefined" || trimmed == "null" {
        return None;
    }

    Some(PathBuf::from(trimmed))
}
