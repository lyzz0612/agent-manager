use anyhow::{Context, Result};
use regex::Regex;
use std::collections::BTreeMap;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputStream {
    Stdout,
    Stderr,
}

impl OutputStream {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Stdout => "stdout",
            Self::Stderr => "stderr",
        }
    }
}

#[derive(Debug, Clone)]
pub struct CommandCapture {
    pub success: bool,
    pub output: String,
}

pub trait CommandLineSink: Send + Sync {
    fn on_line(&self, stream: OutputStream, line: &str);
    fn is_cancelled(&self) -> bool {
        false
    }
    fn proc_child_handle(&self) -> Option<&ChildHandle> {
        None
    }
    fn proc_cancel_flag(&self) -> Option<&CancelFlag> {
        None
    }
}

pub struct ProcHandles<'a> {
    local_child: ChildHandle,
    local_cancel: CancelFlag,
    sink: &'a dyn CommandLineSink,
}

impl<'a> ProcHandles<'a> {
    pub fn new(sink: &'a dyn CommandLineSink) -> Self {
        Self {
            local_child: ChildHandle::new(),
            local_cancel: CancelFlag::new(),
            sink,
        }
    }

    pub fn child(&self) -> &ChildHandle {
        self.sink.proc_child_handle().unwrap_or(&self.local_child)
    }

    pub fn cancel(&self) -> &CancelFlag {
        self.sink.proc_cancel_flag().unwrap_or(&self.local_cancel)
    }
}

#[derive(Clone)]
pub struct ChildHandle(pub Arc<Mutex<Option<Child>>>);

impl ChildHandle {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(None)))
    }

    pub fn kill(&self) {
        if let Ok(mut guard) = self.0.lock() {
            if let Some(child) = guard.as_mut() {
                let _ = child.kill();
            }
        }
    }
}

#[derive(Clone)]
pub struct CancelFlag(Arc<AtomicBool>);

impl CancelFlag {
    pub fn new() -> Self {
        Self(Arc::new(AtomicBool::new(false)))
    }

    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::Relaxed)
    }

    pub fn cancel(&self) {
        self.0.store(true, Ordering::Relaxed);
    }
}

pub fn strip_ansi(text: &str) -> String {
    static ANSI_RE: OnceLock<Regex> = OnceLock::new();
    let re = ANSI_RE.get_or_init(|| Regex::new(r"\x1b\[[?\d;]*[a-zA-Z]").expect("ansi regex"));
    re.replace_all(text, "").into_owned()
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
    thread::spawn(move || {
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

pub fn run_command_streaming_with_env(
    program: &str,
    args: &[&str],
    working_dir: &Path,
    envs: &BTreeMap<String, String>,
    timeout: Option<Duration>,
    child_handle: &ChildHandle,
    cancel: &CancelFlag,
    mut on_line: impl FnMut(OutputStream, &str),
) -> Result<CommandCapture> {
    let mut child = Command::new(program)
        .args(args)
        .current_dir(working_dir)
        .envs(envs)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .with_context(|| format!("failed to start command: {program}"))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    {
        let mut guard = child_handle.0.lock().expect("child handle lock poisoned");
        *guard = Some(child);
    }

    let (line_tx, line_rx) = std::sync::mpsc::channel::<(OutputStream, String)>();

    if let Some(stdout) = stdout {
        let tx = line_tx.clone();
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                let _ = tx.send((OutputStream::Stdout, line));
            }
        });
    }

    if let Some(stderr) = stderr {
        let tx = line_tx.clone();
        thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                let _ = tx.send((OutputStream::Stderr, line));
            }
        });
    }

    drop(line_tx);

    let started = Instant::now();
    let mut combined = String::new();

    loop {
        if cancel.is_cancelled() {
            child_handle.kill();
            break;
        }

        if let Some(limit) = timeout {
            if started.elapsed() >= limit {
                child_handle.kill();
                return Err(anyhow::anyhow!(
                    "command timed out after {} ms: {program}",
                    limit.as_millis()
                ));
            }
        }

        match line_rx.recv_timeout(Duration::from_millis(200)) {
            Ok((stream, line)) => {
                if !combined.is_empty() {
                    combined.push('\n');
                }
                combined.push_str(&line);
                on_line(stream, &line);
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                if child_finished(child_handle) {
                    drain_lines(&line_rx, &mut on_line, &mut combined);
                    break;
                }
            }
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                if child_finished(child_handle) {
                    drain_lines(&line_rx, &mut on_line, &mut combined);
                    break;
                }
            }
        }
    }

    let status = wait_child(child_handle)?;
    let success = status.success() && !cancel.is_cancelled();

    Ok(CommandCapture {
        success,
        output: combined,
    })
}

fn child_finished(child_handle: &ChildHandle) -> bool {
    let mut guard = child_handle.0.lock().expect("child handle lock poisoned");
    guard
        .as_mut()
        .and_then(|child| child.try_wait().ok().flatten())
        .is_some()
}

fn wait_child(child_handle: &ChildHandle) -> Result<std::process::ExitStatus> {
    let mut child = child_handle
        .0
        .lock()
        .expect("child handle lock poisoned")
        .take()
        .context("command child handle missing")?;
    child
        .wait()
        .context("failed to wait for command child process")
}

fn drain_lines(
    line_rx: &std::sync::mpsc::Receiver<(OutputStream, String)>,
    on_line: &mut impl FnMut(OutputStream, &str),
    combined: &mut String,
) {
    while let Ok((stream, line)) = line_rx.try_recv() {
        if !combined.is_empty() {
            combined.push('\n');
        }
        combined.push_str(&line);
        on_line(stream, &line);
    }
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
