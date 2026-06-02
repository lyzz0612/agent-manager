use anyhow::{anyhow, Context, Result};
use host_fs::{
    config_root, cursor_binary_path, ensure_layout, runtime_root, skills_root, state_root,
};
use host_model::{
    ActionMessage, AuthStep, CursorAccountStatus, CursorAuthFlowStatus, CursorRuntimeStatus,
    KnownConfig, RawConfigDocument, RawConfigPreview, RuntimeActionResult, SkillDocument,
    SkillSummary,
};
use host_proc::run_command_with_env;
use regex::Regex;
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

const CURSOR_INSTALL_COMMAND: &str = "curl https://cursor.com/install -fsS | bash";

pub struct CursorProvider {
    base_dir: PathBuf,
}

impl CursorProvider {
    pub fn new(base_dir: impl Into<PathBuf>) -> Self {
        Self {
            base_dir: base_dir.into(),
        }
    }

    pub fn ensure_layout(&self) -> Result<()> {
        ensure_layout(&self.base_dir)
    }

    pub fn runtime_status(&self) -> CursorRuntimeStatus {
        let runtime_dir = runtime_root(&self.base_dir);
        let binary_path = cursor_binary_path(&self.base_dir);
        let installed = binary_path.exists();
        let version = if installed {
            self.run_agent_command(&["--version"]).ok()
        } else {
            None
        };

        CursorRuntimeStatus {
            installed,
            version,
            managed_root: runtime_dir.to_string_lossy().to_string(),
        }
    }

    pub fn install_latest_runtime(&self) -> Result<RuntimeActionResult> {
        self.ensure_layout()?;
        self.run_shell_command(CURSOR_INSTALL_COMMAND)
            .context("failed to run official Cursor install command")?;
        let status = self.runtime_status();

        if !status.installed {
            return Err(anyhow!("安装命令执行完成，但未检测到受管的 Cursor CLI"));
        }

        Ok(RuntimeActionResult {
            installed: status.installed,
            version: status.version,
            managed_root: status.managed_root,
            message: "已通过官方安装脚本完成 Cursor 安装".to_string(),
        })
    }

    pub fn upgrade_runtime(&self) -> Result<RuntimeActionResult> {
        self.ensure_layout()?;

        if !self.runtime_status().installed {
            return Err(anyhow!("当前未检测到已安装的 Cursor，无法执行升级"));
        }

        self.run_agent_command(&["update"])
            .context("failed to run `agent update`")?;
        let status = self.runtime_status();

        Ok(RuntimeActionResult {
            installed: status.installed,
            version: status.version,
            managed_root: status.managed_root,
            message: "已执行 Cursor CLI 手动升级".to_string(),
        })
    }

    pub fn account_status(&self) -> CursorAccountStatus {
        if !self.runtime_status().installed {
            return CursorAccountStatus {
                logged_in: false,
                email: None,
                display_name: None,
                note: "尚未安装 Cursor CLI，无法检测账号状态。".to_string(),
            };
        }

        match self.run_agent_command(&["status"]) {
            Ok(output) => parse_account_status(&output),
            Err(_) => {
                let fallback = self.read_fallback_account_file();
                fallback.unwrap_or(CursorAccountStatus {
                    logged_in: false,
                    email: None,
                    display_name: None,
                    note: "未能通过 `agent status` 解析账号信息，当前返回最小状态。".to_string(),
                })
            }
        }
    }

    pub fn auth_flow_status(&self) -> CursorAuthFlowStatus {
        CursorAuthFlowStatus {
            summary: "当前阶段采用网页引导 + 外部完成关键认证步骤的流程。".to_string(),
            steps: vec![
                AuthStep {
                    title: "开始登录".to_string(),
                    detail: "在受管运行时目录中执行 `agent login` 开始浏览器登录流程。"
                        .to_string(),
                },
                AuthStep {
                    title: "外部完成认证".to_string(),
                    detail: "如果 CLI 打开浏览器、展示链接或要求完成额外确认，请在外部完成。"
                        .to_string(),
                },
                AuthStep {
                    title: "返回管理页确认".to_string(),
                    detail: "返回管理页后，通过刷新状态或重新检查 `agent status` 确认账号信息。"
                        .to_string(),
                },
            ],
        }
    }

    pub fn known_config(&self) -> Result<KnownConfig> {
        let config = self.read_config_json()?;

        Ok(KnownConfig {
            disable_telemetry: config
                .get("disableTelemetry")
                .and_then(|value| value.as_bool())
                .unwrap_or(false),
            auto_update: config
                .get("autoUpdate")
                .and_then(|value| value.as_bool())
                .unwrap_or(true),
            release_track: config
                .get("releaseTrack")
                .and_then(|value| value.as_str())
                .unwrap_or("stable")
                .to_string(),
        })
    }

    pub fn update_known_config(&self, next: KnownConfig) -> Result<KnownConfig> {
        let mut config = self.read_config_json()?;

        if !config.is_object() {
            config = Value::Object(Map::new());
        }

        let object = config
            .as_object_mut()
            .expect("config should be a JSON object after normalization");
        object.insert(
            "disableTelemetry".to_string(),
            Value::Bool(next.disable_telemetry),
        );
        object.insert("autoUpdate".to_string(), Value::Bool(next.auto_update));
        object.insert(
            "releaseTrack".to_string(),
            Value::String(next.release_track.clone()),
        );

        self.write_config_json(&Value::Object(object.clone()))?;
        Ok(next)
    }

    pub fn raw_config(&self) -> Result<RawConfigDocument> {
        self.ensure_layout()?;
        let path = self.config_file();

        if !path.exists() {
            self.write_config_json(&default_config_json())?;
        }

        Ok(RawConfigDocument {
            path: path.to_string_lossy().to_string(),
            content: fs::read_to_string(&path).unwrap_or_else(|_| "{}".to_string()),
        })
    }

    pub fn preview_raw_config(&self, next_content: String) -> Result<RawConfigPreview> {
        serde_json::from_str::<Value>(&next_content).context("原始配置必须是合法 JSON")?;
        let current = self.raw_config()?;

        Ok(RawConfigPreview {
            path: current.path,
            current_content: current.content,
            next_content,
        })
    }

    pub fn save_raw_config(&self, next_content: String) -> Result<RawConfigDocument> {
        serde_json::from_str::<Value>(&next_content).context("原始配置必须是合法 JSON")?;
        let path = self.config_file();
        fs::write(&path, next_content.as_bytes())
            .with_context(|| format!("failed to write config file: {}", path.display()))?;
        self.raw_config()
    }

    pub fn list_skills(&self) -> Result<Vec<SkillSummary>> {
        self.ensure_layout()?;
        let root = skills_root(&self.base_dir);
        let mut skills = collect_files(&root)?;
        skills.sort();

        Ok(skills
            .into_iter()
            .filter_map(|path| {
                path.file_name().and_then(|value| value.to_str()).map(|name| SkillSummary {
                    name: name.to_string(),
                    path: path.to_string_lossy().to_string(),
                })
            })
            .collect())
    }

    pub fn read_skill(&self, name: &str) -> Result<SkillDocument> {
        let path = self.skill_path(name)?;
        let content = fs::read_to_string(&path)
            .with_context(|| format!("failed to read skill: {}", path.display()))?;

        Ok(SkillDocument {
            name: path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or(name)
                .to_string(),
            path: path.to_string_lossy().to_string(),
            content,
        })
    }

    pub fn update_skill(&self, name: &str, content: &str) -> Result<SkillDocument> {
        let path = self.skill_path(name)?;

        if !path.exists() {
            return Err(anyhow!("当前只支持编辑已有 skill"));
        }

        fs::write(&path, content.as_bytes())
            .with_context(|| format!("failed to update skill: {}", path.display()))?;

        self.read_skill(name)
    }

    pub fn delete_skill(&self, name: &str) -> Result<ActionMessage> {
        let path = self.skill_path(name)?;

        if !path.exists() {
            return Err(anyhow!("未找到对应的 skill 文件"));
        }

        fs::remove_file(&path)
            .with_context(|| format!("failed to delete skill: {}", path.display()))?;

        Ok(ActionMessage {
            message: format!("已删除 skill `{name}`"),
        })
    }

    fn config_file(&self) -> PathBuf {
        config_root(&self.base_dir).join("config.json")
    }

    fn read_config_json(&self) -> Result<Value> {
        self.ensure_layout()?;
        let path = self.config_file();

        if !path.exists() {
            let default = default_config_json();
            self.write_config_json(&default)?;
            return Ok(default);
        }

        let content = fs::read_to_string(&path)
            .with_context(|| format!("failed to read config file: {}", path.display()))?;
        serde_json::from_str(&content).context("配置文件不是合法 JSON")
    }

    fn write_config_json(&self, value: &Value) -> Result<()> {
        let path = self.config_file();
        let contents = serde_json::to_string_pretty(value)?;
        fs::write(&path, contents.as_bytes())
            .with_context(|| format!("failed to write config file: {}", path.display()))
    }

    fn skill_path(&self, name: &str) -> Result<PathBuf> {
        let root = skills_root(&self.base_dir);
        let file_name = Path::new(name)
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| anyhow!("无效的 skill 文件名"))?;

        Ok(root.join(file_name))
    }

    fn runtime_env(&self) -> BTreeMap<String, String> {
        let runtime_dir = runtime_root(&self.base_dir);
        let local_bin = runtime_dir.join(".local").join("bin");
        let existing_path = env::var("PATH").unwrap_or_default();
        let mut envs = BTreeMap::new();
        envs.insert("HOME".to_string(), runtime_dir.to_string_lossy().to_string());
        envs.insert(
            "PATH".to_string(),
            format!("{}:{}", local_bin.to_string_lossy(), existing_path),
        );
        envs
    }

    fn run_shell_command(&self, command: &str) -> Result<String> {
        let runtime_dir = runtime_root(&self.base_dir);
        run_command_with_env("bash", &["-lc", command], &runtime_dir, &self.runtime_env())
    }

    fn run_agent_command(&self, args: &[&str]) -> Result<String> {
        let runtime_dir = runtime_root(&self.base_dir);
        let binary = cursor_binary_path(&self.base_dir);
        let program = binary.to_string_lossy().to_string();
        run_command_with_env(&program, args, &runtime_dir, &self.runtime_env())
    }

    fn read_fallback_account_file(&self) -> Option<CursorAccountStatus> {
        let account_file = state_root(&self.base_dir).join("account.json");
        let contents = fs::read_to_string(account_file).ok()?;
        let json = serde_json::from_str::<serde_json::Value>(&contents).ok()?;

        Some(CursorAccountStatus {
            logged_in: json
                .get("logged_in")
                .and_then(|value| value.as_bool())
                .unwrap_or(false),
            email: json
                .get("email")
                .and_then(|value| value.as_str())
                .map(ToString::to_string),
            display_name: json
                .get("display_name")
                .and_then(|value| value.as_str())
                .map(ToString::to_string),
            note: "账号信息按 best-effort 从受管状态文件读取。".to_string(),
        })
    }
}

#[allow(dead_code)]
fn _path_as_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn default_config_json() -> Value {
    json!({
        "disableTelemetry": false,
        "autoUpdate": true,
        "releaseTrack": "stable"
    })
}

fn collect_files(root: &Path) -> Result<Vec<PathBuf>> {
    if !root.exists() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();

    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_dir() {
            files.extend(collect_files(&path)?);
        } else if path.is_file() {
            files.push(path);
        }
    }

    Ok(files)
}

fn parse_account_status(output: &str) -> CursorAccountStatus {
    let lower = output.to_ascii_lowercase();
    let logged_in = !lower.contains("not authenticated") && !lower.contains("logged out");
    let email = Regex::new(r"(?i)([A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,})")
        .ok()
        .and_then(|regex| regex.captures(output))
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().to_string());
    let display_name = Regex::new(r"(?im)^(?:name|display name|signed in as)\s*:\s*(.+)$")
        .ok()
        .and_then(|regex| regex.captures(output))
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().trim().to_string())
        .filter(|value| email.as_ref().map(|mail| mail != value).unwrap_or(true));

    CursorAccountStatus {
        logged_in,
        email,
        display_name,
        note: "账号信息由 `agent status` 输出做 best-effort 解析。".to_string(),
    }
}
