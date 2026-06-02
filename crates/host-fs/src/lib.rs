use anyhow::Result;
use std::fs;
use std::path::{Path, PathBuf};

pub fn managed_root(base_dir: &Path) -> PathBuf {
    base_dir.join("managed").join("cursor")
}

pub fn runtime_root(base_dir: &Path) -> PathBuf {
    managed_root(base_dir).join("runtime")
}

pub fn state_root(base_dir: &Path) -> PathBuf {
    runtime_root(base_dir).join(".cursor").join("state")
}

pub fn config_root(base_dir: &Path) -> PathBuf {
    runtime_root(base_dir).join(".cursor")
}

pub fn skills_root(base_dir: &Path) -> PathBuf {
    config_root(base_dir).join("skills")
}

pub fn cursor_binary_path(base_dir: &Path) -> PathBuf {
    runtime_root(base_dir).join(".local").join("bin").join("agent")
}

pub fn ensure_layout(base_dir: &Path) -> Result<()> {
    for dir in [
        managed_root(base_dir),
        runtime_root(base_dir),
        state_root(base_dir),
        config_root(base_dir),
        skills_root(base_dir),
    ] {
        fs::create_dir_all(dir)?;
    }

    Ok(())
}
