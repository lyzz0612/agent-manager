use anyhow::{anyhow, Context, Result};
use host_fs::{installable_skill_agent_ids, skills_cli_agent_name, user_home_dir};
use host_model::{
    SkillsCliCapability, SkillsCliInstallRequest, SkillsCliInstallResult, SkillsCliPreviewResult,
    SkillsCliPreviewSkill,
};
use host_proc::run_command_capture_with_env_timeout;
use regex::Regex;
use std::collections::BTreeMap;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tracing::info;

const CLI_TIMEOUT: Duration = Duration::from_secs(120);

static INSTALL_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn install_lock() -> &'static Mutex<()> {
    INSTALL_LOCK.get_or_init(|| Mutex::new(()))
}

pub fn skills_cli_status() -> SkillsCliCapability {
    let Ok(home) = user_home_dir() else {
        return SkillsCliCapability {
            ready: false,
            node_version: None,
            skills_cli_version: None,
            message: "无法解析用户主目录，请设置 HOME 或 USERPROFILE".to_string(),
        };
    };

    let env = cli_env(&home);
    let node_version = read_command_version("node", &["-v"], &home, &env);
    if node_version.is_none() {
        return SkillsCliCapability {
            ready: false,
            node_version: None,
            skills_cli_version: None,
            message: "未检测到 Node.js，请确认运行环境已安装 Node".to_string(),
        };
    }

    let skills_cli_version =
        read_command_version("npx", &["skills", "--version"], &home, &env).or_else(|| {
            read_command_version("npx", &["skills", "-v"], &home, &env)
        });

    if skills_cli_version.is_none() {
        return SkillsCliCapability {
            ready: false,
            node_version,
            skills_cli_version: None,
            message: "未检测到 Skills CLI，请确认 npx skills 可用".to_string(),
        };
    }

    SkillsCliCapability {
        ready: true,
        node_version,
        skills_cli_version,
        message: "Skills CLI 可用".to_string(),
    }
}

pub fn skills_cli_preview(source: &str) -> Result<SkillsCliPreviewResult> {
    let normalized = normalize_source(source)?;
    ensure_ready()?;

    let home = user_home_dir()?;
    let env = cli_env(&home);
    let started = Instant::now();
    let capture = run_command_capture_with_env_timeout(
        "npx",
        &["skills", "add", &normalized, "-l", "-y"],
        &home,
        &env,
        Some(CLI_TIMEOUT),
    )
    .context("failed to run skills preview")?;

    info!(
        source = %normalized,
        elapsed_ms = started.elapsed().as_millis(),
        "skills cli preview completed"
    );

    if !capture.success {
        return Err(anyhow!(
            "无法获取 skill 列表: {}",
            summarize_cli_output(&capture.output)
        ));
    }

    let skills = parse_preview_skills(&capture.output);
    if skills.is_empty() {
        return Err(anyhow!(
            "无法获取 skill 列表: {}",
            summarize_cli_output(&capture.output)
        ));
    }

    Ok(SkillsCliPreviewResult {
        source: normalized,
        skills,
    })
}

pub fn skills_cli_install(request: &SkillsCliInstallRequest) -> Result<SkillsCliInstallResult> {
    let normalized = normalize_source(&request.source)?;
    ensure_ready()?;

    if request.skills.is_empty() {
        return Err(anyhow!("请至少选择一个 skill"));
    }

    if request.agents.is_empty() {
        return Err(anyhow!("请至少选择一个 agent"));
    }

    let mut cli_agents = Vec::new();
    for agent_id in &request.agents {
        let cli_name = skills_cli_agent_name(agent_id)
            .ok_or_else(|| anyhow!("未知或未支持的 agent: {agent_id}"))?;
        if !installable_skill_agent_ids().contains(&agent_id.as_str()) {
            return Err(anyhow!("未知或未支持的 agent: {agent_id}"));
        }
        if !cli_agents.contains(&cli_name) {
            cli_agents.push(cli_name);
        }
    }

    let home = user_home_dir()?;
    let env = cli_env(&home);
    let _guard = install_lock()
        .lock()
        .map_err(|_| anyhow!("另一个 skill 安装正在进行，请稍后重试"))?;

    let mut args = vec![
        "skills".to_string(),
        "add".to_string(),
        normalized.clone(),
        "-g".to_string(),
        "-y".to_string(),
        "--copy".to_string(),
    ];

    args.push("--agent".to_string());
    args.extend(cli_agents.iter().map(|name| (*name).to_string()));

    args.push("--skill".to_string());
    args.extend(request.skills.iter().cloned());

    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let started = Instant::now();
    let capture = run_command_capture_with_env_timeout(
        "npx",
        &arg_refs,
        &home,
        &env,
        Some(CLI_TIMEOUT),
    )
    .context("failed to run skills install")?;

    info!(
        source = %normalized,
        skill_count = request.skills.len(),
        agents = ?request.agents,
        elapsed_ms = started.elapsed().as_millis(),
        "skills cli install completed"
    );

    if !capture.success {
        return Err(anyhow!(
            "安装失败: {}",
            summarize_cli_output(&capture.output)
        ));
    }

    let skill_count = request.skills.len();
    let agent_count = request.agents.len();
    Ok(SkillsCliInstallResult {
        message: format!("已安装 {skill_count} 个 skill 到 {agent_count} 个 agent"),
        installed_skills: request.skills.clone(),
        agents: request.agents.clone(),
    })
}

fn ensure_ready() -> Result<()> {
    if skills_cli_status().ready {
        Ok(())
    } else {
        Err(anyhow!("Skills CLI 不可用: {}", skills_cli_status().message))
    }
}

fn normalize_source(source: &str) -> Result<String> {
    let trimmed = source.trim();
    if trimmed.is_empty() {
        return Err(anyhow!("请提供有效的仓库或链接"));
    }
    Ok(trimmed.to_string())
}

fn cli_env(home: &Path) -> BTreeMap<String, String> {
    let mut env = BTreeMap::new();
    env.insert("HOME".to_string(), home.to_string_lossy().to_string());
    env.insert("USERPROFILE".to_string(), home.to_string_lossy().to_string());
    env.insert("CI".to_string(), "true".to_string());
    env.insert("NO_COLOR".to_string(), "1".to_string());
    env
}

fn read_command_version(
    program: &str,
    args: &[&str],
    home: &Path,
    env: &BTreeMap<String, String>,
) -> Option<String> {
    let capture = run_command_capture_with_env_timeout(
        program,
        args,
        home,
        env,
        Some(Duration::from_secs(30)),
    )
    .ok()?;

    if !capture.success {
        return None;
    }

    let version = capture.output.trim().to_string();
    if version.is_empty() {
        None
    } else {
        Some(version)
    }
}

fn summarize_cli_output(output: &str) -> String {
    let stripped = strip_ansi(output);
    let lines: Vec<&str> = stripped
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();

    for line in &lines {
        let lower = line.to_ascii_lowercase();
        if lower.contains("error")
            || lower.contains("failed")
            || lower.contains("fatal")
            || lower.contains("enoent")
        {
            return line.chars().take(240).collect();
        }
    }

    for line in lines.iter().rev() {
        if is_meaningful_cli_line(line) {
            return line.chars().take(240).collect();
        }
    }

    lines
        .first()
        .map(|line| line.chars().take(240).collect())
        .unwrap_or_else(|| "命令执行失败".to_string())
}

fn is_meaningful_cli_line(line: &str) -> bool {
    if line.contains("Available Skills") {
        return false;
    }
    if line.contains("Found ") && line.contains("skills") {
        return false;
    }
    if line.contains("Cloning repository") || line.contains("Repository cloned") {
        return false;
    }

    let alphanumeric = line.chars().filter(|c| c.is_alphanumeric()).count();
    if alphanumeric < 8 {
        return false;
    }

    !line
        .chars()
        .all(|c| matches!(c, '|' | '│' | '◇' | '○' | '●' | '◆' | '•' | '·' | '—' | '-' | ' '))
}

fn strip_ansi(text: &str) -> String {
    static ANSI_RE: OnceLock<Regex> = OnceLock::new();
    let re = ANSI_RE.get_or_init(|| {
        Regex::new(r"\x1b\[[?\d;]*[a-zA-Z]").expect("ansi regex")
    });
    re.replace_all(text, "").into_owned()
}

fn normalize_table_line(line: &str) -> String {
    line.chars()
        .map(|c| match c {
            '\u{2502}' | '\u{2503}' | '\u{2551}' => '|',
            _ => c,
        })
        .collect()
}

fn parse_preview_skills(output: &str) -> Vec<SkillsCliPreviewSkill> {
    let stripped = strip_ansi(output);
    let mut skills = Vec::new();
    let mut in_section = false;
    let mut current_name: Option<String> = None;
    let mut current_desc = String::new();

    for line in stripped.lines() {
        if line.contains("Available Skills") {
            in_section = true;
            continue;
        }

        if !in_section {
            continue;
        }

        if line.contains("Use --skill") {
            break;
        }

        if let Some(name) = parse_skill_name_line(line) {
            if let Some(previous) = current_name.take() {
                skills.push(SkillsCliPreviewSkill {
                    name: previous,
                    description: current_desc.trim().to_string(),
                });
                current_desc.clear();
            }
            current_name = Some(name);
            continue;
        }

        if let Some(description) = parse_skill_description_line(line) {
            if current_name.is_some() {
                if !current_desc.is_empty() {
                    current_desc.push(' ');
                }
                current_desc.push_str(&description);
            }
        }
    }

    if let Some(name) = current_name {
        skills.push(SkillsCliPreviewSkill {
            name,
            description: current_desc.trim().to_string(),
        });
    }

    skills
}

fn parse_skill_name_line(line: &str) -> Option<String> {
    let line = normalize_table_line(line);
    static NAME_RE: OnceLock<Regex> = OnceLock::new();
    let re = NAME_RE.get_or_init(|| {
        Regex::new(r"^\|+\s{3,5}([a-zA-Z0-9][\w-]*)\s*$").expect("skill name regex")
    });
    re.captures(&line)
        .and_then(|caps| caps.get(1))
        .map(|value| value.as_str().to_string())
}

fn parse_skill_description_line(line: &str) -> Option<String> {
    let line = normalize_table_line(line);
    static DESC_RE: OnceLock<Regex> = OnceLock::new();
    let re = DESC_RE.get_or_init(|| {
        Regex::new(r"^\|+\s{5,}(.+?)\s*$").expect("skill desc regex")
    });
    re.captures(&line)
        .and_then(|caps| caps.get(1))
        .map(|value| value.as_str().trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_preview_skills_extracts_names_and_descriptions() {
        let sample = r#"
o  Available Skills
|
|    web-design-guidelines
|
|      Review UI code for Web Interface Guidelines compliance.
|
|    writing-guidelines
|
|      Review docs/prose for Writing Guidelines compliance.

—  Use --skill <name> to install specific skills
"#;

        let skills = parse_preview_skills(sample);
        assert_eq!(skills.len(), 2);
        assert_eq!(skills[0].name, "web-design-guidelines");
        assert!(skills[0].description.contains("Review UI code"));
        assert_eq!(skills[1].name, "writing-guidelines");
    }

    #[test]
    fn parse_preview_skills_handles_ci_style_box_drawing_output() {
        let sample = r#"
o  Found 26 skills
│◆ Available Skills
││   browser-bridge
││     通过 Chrome 扩展控制真实浏览器。
││   cs-issue
││     修 bug 的子流程入口。

—  Use --skill <name> to install specific skills
"#;

        let skills = parse_preview_skills(sample);
        assert_eq!(skills.len(), 2);
        assert_eq!(skills[0].name, "browser-bridge");
        assert!(skills[0].description.contains("Chrome"));
        assert_eq!(skills[1].name, "cs-issue");
    }

    #[test]
    fn summarize_cli_output_skips_spinner_lines() {
        let sample = "\x1b[?25l│◆ Source: https://example.com\n\x1b[?25herror: repository not found";
        assert_eq!(
            summarize_cli_output(sample),
            "error: repository not found"
        );
    }
}
