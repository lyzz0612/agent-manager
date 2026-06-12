use anyhow::{Context, Result};
use std::collections::BTreeMap;
use std::path::Path;
use std::process::Command;
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct CommandCapture {
    pub success: bool,
    pub output: String,
}

pub fn run_command(program: &str, args: &[&str], working_dir: &Path) -> Result<String> {
    run_command_with_env(program, args, working_dir, &BTreeMap::new())
}

pub fn run_command_with_env(
    program: &str,
    args: &[&str],
    working_dir: &Path,
    envs: &BTreeMap<String, String>,
) -> Result<String> {
    let capture = run_command_capture_with_env(program, args, working_dir, envs)?;
    if capture.success {
        Ok(capture.output)
    } else {
        Err(anyhow::anyhow!("command failed: {}", capture.output))
    }
}

pub fn run_command_capture(program: &str, args: &[&str], working_dir: &Path) -> Result<CommandCapture> {
    run_command_capture_with_env(program, args, working_dir, &BTreeMap::new())
}

pub fn run_command_capture_with_env(
    program: &str,
    args: &[&str],
    working_dir: &Path,
    envs: &BTreeMap<String, String>,
) -> Result<CommandCapture> {
    run_command_capture_with_env_timeout(program, args, working_dir, envs, None)
}

pub fn run_command_capture_with_env_timeout(
    program: &str,
    args: &[&str],
    working_dir: &Path,
    envs: &BTreeMap<String, String>,
    timeout: Option<Duration>,
) -> Result<CommandCapture> {
    let program = program.to_string();
    let program_for_error = program.clone();
    let args = args.iter().map(|arg| arg.to_string()).collect::<Vec<_>>();
    let working_dir = working_dir.to_path_buf();
    let envs = envs.clone();

    let (sender, receiver) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let output = Command::new(&program)
            .args(&args)
            .current_dir(&working_dir)
            .envs(&envs)
            .output();
        let _ = sender.send(output);
    });

    let output = match timeout {
        Some(limit) => receiver
            .recv_timeout(limit)
            .map_err(|_| {
                anyhow::anyhow!(
                    "command timed out after {} ms: {program_for_error}",
                    limit.as_millis()
                )
            })?
            .with_context(|| format!("failed to start command: {program_for_error}"))?,
        None => receiver
            .recv()
            .map_err(|_| anyhow::anyhow!("command thread exited before returning output"))?
            .with_context(|| format!("failed to start command: {program_for_error}"))?,
    };

    Ok(CommandCapture {
        success: output.status.success(),
        output: combine_output(&output.stdout, &output.stderr),
    })
}

fn combine_output(stdout: &[u8], stderr: &[u8]) -> String {
    let stdout = String::from_utf8_lossy(stdout);
    let stderr = String::from_utf8_lossy(stderr);

    match (stdout.trim().is_empty(), stderr.trim().is_empty()) {
        (true, true) => String::new(),
        (false, true) => stdout.trim().to_string(),
        (true, false) => stderr.trim().to_string(),
        (false, false) => format!("{stdout}\n{stderr}").trim().to_string(),
    }
}
