use anyhow::{Context, Result};
use std::collections::BTreeMap;
use std::path::Path;
use std::process::Command;

pub fn run_command(program: &str, args: &[&str], working_dir: &Path) -> Result<String> {
    run_command_with_env(program, args, working_dir, &BTreeMap::new())
}

pub fn run_command_with_env(
    program: &str,
    args: &[&str],
    working_dir: &Path,
    envs: &BTreeMap<String, String>,
) -> Result<String> {
    let output = Command::new(program)
        .args(args)
        .current_dir(working_dir)
        .envs(envs)
        .output()
        .with_context(|| format!("failed to start command: {program}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(anyhow::anyhow!(
            "command failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}
