use anyhow::{anyhow, Result};
use host_model::{
    CommandJobBusyResponse, CommandJobCurrentResponse, CommandJobSnapshot, CommandJobStartResponse,
};
use host_proc::{strip_ansi, CancelFlag, ChildHandle, CommandLineSink, OutputStream};
use serde::Serialize;
use serde_json::Value;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tokio::sync::broadcast;
use tracing::info;
use uuid::Uuid;

pub struct JobOutcome {
    pub success: bool,
    pub message: String,
    pub result: Option<Value>,
}

#[derive(Clone)]
pub struct JobContext {
    record: Arc<JobRecord>,
    cancel: CancelFlag,
    child: ChildHandle,
}

impl JobContext {
    pub fn set_phase(&self, phase: impl Into<String>, message: impl Into<String>) {
        let phase = phase.into();
        let message = message.into();
        {
            let mut state = self.record.state.lock().expect("job state lock poisoned");
            state.phase = phase.clone();
            state.message = message.clone();
        }
        self.push_event(JobEvent::Phase {
            phase,
            message: message.clone(),
        });
    }

    pub fn append_line(&self, stream: OutputStream, text: &str) {
        let text = strip_ansi(text);
        if text.is_empty() {
            return;
        }
        {
            let mut state = self.record.state.lock().expect("job state lock poisoned");
            state.line_count += 1;
        }
        self.push_event(JobEvent::Line {
            stream: stream.as_str().to_string(),
            text,
        });
    }

    pub fn emit_error(&self, message: impl Into<String>) {
        let message = message.into();
        self.push_event(JobEvent::Error { message });
    }

    pub fn child_handle(&self) -> &ChildHandle {
        &self.child
    }

    pub fn cancel_flag(&self) -> &CancelFlag {
        &self.cancel
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancel.is_cancelled()
    }

    fn push_event(&self, event: JobEvent) {
        {
            let mut state = self.record.state.lock().expect("job state lock poisoned");
            state.events.push(event.clone());
        }
        let _ = self.record.sender.send(event);
    }
}

impl CommandLineSink for JobContext {
    fn on_line(&self, stream: OutputStream, line: &str) {
        self.append_line(stream, line);
    }

    fn is_cancelled(&self) -> bool {
        self.cancel.is_cancelled()
    }

    fn proc_child_handle(&self) -> Option<&ChildHandle> {
        Some(&self.child)
    }

    fn proc_cancel_flag(&self) -> Option<&CancelFlag> {
        Some(&self.cancel)
    }
}

#[derive(Debug, Clone)]
pub struct JobStreamEvent {
    pub name: String,
    pub data: String,
}

#[derive(Debug, Clone)]
enum JobEvent {
    Phase {
        phase: String,
        message: String,
    },
    Line {
        stream: String,
        text: String,
    },
    Error {
        message: String,
    },
    Done {
        success: bool,
        message: String,
        result: Option<Value>,
    },
}

impl JobEvent {
    fn event_name(&self) -> &'static str {
        match self {
            Self::Phase { .. } => "phase",
            Self::Line { .. } => "line",
            Self::Error { .. } => "error",
            Self::Done { .. } => "done",
        }
    }

    fn to_stream_event(&self) -> Result<JobStreamEvent> {
        #[derive(Serialize)]
        #[serde(untagged)]
        enum Payload<'a> {
            Phase { phase: &'a str, message: &'a str },
            Line { stream: &'a str, text: &'a str },
            Error { message: &'a str },
            Done {
                success: bool,
                message: &'a str,
                #[serde(skip_serializing_if = "Option::is_none")]
                result: Option<&'a Value>,
            },
        }

        let payload = match self {
            Self::Phase { phase, message } => Payload::Phase { phase, message },
            Self::Line { stream, text } => Payload::Line { stream, text },
            Self::Error { message } => Payload::Error { message },
            Self::Done {
                success,
                message,
                result,
            } => Payload::Done {
                success: *success,
                message,
                result: result.as_ref(),
            },
        };

        Ok(JobStreamEvent {
            name: self.event_name().to_string(),
            data: serde_json::to_string(&payload)?,
        })
    }
}

#[derive(Clone)]
struct JobState {
    job_id: String,
    kind: String,
    label: String,
    active: bool,
    phase: String,
    message: String,
    line_count: u32,
    events: Vec<JobEvent>,
}

struct JobRecord {
    state: Mutex<JobState>,
    sender: broadcast::Sender<JobEvent>,
    cancel: CancelFlag,
    child: ChildHandle,
}

pub struct JobRegistry {
    slot: Mutex<Option<Arc<JobRecord>>>,
}

impl Default for JobRegistry {
    fn default() -> Self {
        Self {
            slot: Mutex::new(None),
        }
    }
}

impl JobRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn timeout_for_kind(kind: &str) -> Duration {
        match kind {
            "agent_install" => Duration::from_secs(300),
            _ => Duration::from_secs(120),
        }
    }

    pub fn try_start<F>(
        self: &Arc<Self>,
        kind: impl Into<String>,
        label: impl Into<String>,
        worker: F,
    ) -> Result<CommandJobStartResponse, CommandJobBusyResponse>
    where
        F: FnOnce(JobContext) -> Result<JobOutcome> + Send + 'static,
    {
        let kind = kind.into();
        let label = label.into();
        let job_id = Uuid::new_v4().to_string();

        let (sender, _) = broadcast::channel(1024);
        let record = Arc::new(JobRecord {
            state: Mutex::new(JobState {
                job_id: job_id.clone(),
                kind: kind.clone(),
                label: label.clone(),
                active: true,
                phase: "starting".to_string(),
                message: "任务启动中…".to_string(),
                line_count: 0,
                events: Vec::new(),
            }),
            sender,
            cancel: CancelFlag::new(),
            child: ChildHandle::new(),
        });

        {
            let mut slot = self.slot.lock().expect("job registry lock poisoned");
            if let Some(active) = slot.as_ref() {
                let state = active.state.lock().expect("job state lock poisoned");
                if state.active {
                    return Err(CommandJobBusyResponse {
                        error: "另一个命令任务正在进行".to_string(),
                        active_job_id: state.job_id.clone(),
                        kind: state.kind.clone(),
                        label: state.label.clone(),
                    });
                }
            }
            *slot = Some(record.clone());
        }

        let ctx = JobContext {
            record: record.clone(),
            cancel: record.cancel.clone(),
            child: record.child.clone(),
        };
        ctx.set_phase("running", "正在执行命令…");

        let registry = Arc::clone(self);
        let job_id_for_log = job_id.clone();
        let kind_for_log = kind.clone();

        thread::spawn(move || {
            let started = Instant::now();
            let outcome = match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| worker(ctx))) {
                Ok(Ok(outcome)) => outcome,
                Ok(Err(error)) => JobOutcome {
                    success: false,
                    message: error.to_string(),
                    result: None,
                },
                Err(_) => JobOutcome {
                    success: false,
                    message: "任务执行线程异常退出".to_string(),
                    result: None,
                },
            };

            if record.cancel.is_cancelled() && outcome.success {
                return;
            }

            {
                let mut state = record.state.lock().expect("job state lock poisoned");
                state.active = false;
                state.phase = if outcome.success {
                    "success".to_string()
                } else {
                    "failed".to_string()
                };
                state.message = outcome.message.clone();
            }

            let done = JobEvent::Done {
                success: outcome.success,
                message: outcome.message.clone(),
                result: outcome.result.clone(),
            };
            {
                let mut state = record.state.lock().expect("job state lock poisoned");
                state.events.push(done.clone());
            }
            let _ = record.sender.send(done);

            info!(
                job_id = %job_id_for_log,
                kind = %kind_for_log,
                elapsed_ms = started.elapsed().as_millis(),
                success = outcome.success,
                "command job completed"
            );

            let mut slot = registry.slot.lock().expect("job registry lock poisoned");
            if let Some(current) = slot.as_ref() {
                if Arc::ptr_eq(current, &record) {
                    *slot = None;
                }
            }
        });

        Ok(CommandJobStartResponse {
            job_id,
            kind,
            label,
        })
    }

    pub fn current(&self) -> CommandJobCurrentResponse {
        let slot = self.slot.lock().expect("job registry lock poisoned");
        let Some(record) = slot.as_ref() else {
            return CommandJobCurrentResponse {
                active: false,
                job_id: None,
                kind: None,
                label: None,
                phase: None,
                message: None,
            };
        };

        let state = record.state.lock().expect("job state lock poisoned");
        CommandJobCurrentResponse {
            active: state.active,
            job_id: Some(state.job_id.clone()),
            kind: Some(state.kind.clone()),
            label: Some(state.label.clone()),
            phase: Some(state.phase.clone()),
            message: Some(state.message.clone()),
        }
    }

    pub fn snapshot(&self, job_id: &str) -> Result<CommandJobSnapshot> {
        let record = self.find_record(job_id)?;
        let state = record.state.lock().expect("job state lock poisoned");
        Ok(CommandJobSnapshot {
            job_id: state.job_id.clone(),
            kind: state.kind.clone(),
            label: state.label.clone(),
            active: state.active,
            phase: state.phase.clone(),
            message: state.message.clone(),
            line_count: state.line_count,
        })
    }

    pub fn cancel(&self, job_id: &str) -> Result<()> {
        let record = self.find_record(job_id)?;
        let active = {
            let state = record.state.lock().expect("job state lock poisoned");
            state.active
        };
        if !active {
            return Err(anyhow!("任务已结束"));
        }

        record.cancel.cancel();
        record.child.kill();

        let error = JobEvent::Error {
            message: "任务已取消".to_string(),
        };
        let done = JobEvent::Done {
            success: false,
            message: "任务已取消".to_string(),
            result: None,
        };

        {
            let mut state = record.state.lock().expect("job state lock poisoned");
            state.active = false;
            state.phase = "failed".to_string();
            state.message = "任务已取消".to_string();
            state.events.push(error.clone());
            state.events.push(done.clone());
        }
        let _ = record.sender.send(error);
        let _ = record.sender.send(done);

        let mut slot = self.slot.lock().expect("job registry lock poisoned");
        if let Some(current) = slot.as_ref() {
            if Arc::ptr_eq(current, &record) {
                *slot = None;
            }
        }
        Ok(())
    }

    pub fn replay_events(&self, job_id: &str) -> Result<Vec<JobStreamEvent>> {
        let record = self.find_record(job_id)?;
        let state = record.state.lock().expect("job state lock poisoned");
        state
            .events
            .iter()
            .map(|event| event.to_stream_event())
            .collect()
    }

    fn find_record(&self, job_id: &str) -> Result<Arc<JobRecord>> {
        let slot = self.slot.lock().expect("job registry lock poisoned");
        let record = slot
            .as_ref()
            .ok_or_else(|| anyhow!("未找到任务: {job_id}"))?;
        let state = record.state.lock().expect("job state lock poisoned");
        if state.job_id != job_id {
            return Err(anyhow!("未找到任务: {job_id}"));
        }
        Ok(record.clone())
    }

    fn subscribe(&self, job_id: &str) -> Result<broadcast::Receiver<JobEvent>> {
        let record = self.find_record(job_id)?;
        Ok(record.sender.subscribe())
    }

    pub fn subscribe_stream(
        self: Arc<Self>,
        job_id: String,
    ) -> impl futures_core::stream::Stream<Item = JobStreamEvent> + Send {
        async_stream::stream! {
            if let Ok(events) = self.replay_events(&job_id) {
                let mut finished = false;
                for event in events {
                    finished = event.name == "done";
                    yield event;
                }
                if finished {
                    return;
                }
            }

            let Ok(mut receiver) = self.subscribe(&job_id) else {
                return;
            };

            loop {
                match receiver.recv().await {
                    Ok(event) => {
                        let is_done = matches!(event, JobEvent::Done { .. });
                        if let Ok(stream_event) = event.to_stream_event() {
                            yield stream_event;
                        }
                        if is_done {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        }
    }
}
