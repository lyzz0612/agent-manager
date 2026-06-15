import { useEffect, useRef } from "react";
import { useCommandJob } from "../context/CommandJobContext";

export function CommandJobPanel() {
  const { job, cancelJob, clearJob } = useCommandJob();
  const logRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [job.lines]);

  if (!job.jobId) {
    return null;
  }

  return (
    <section className="command-job-panel">
      <div className="command-job-panel__header">
        <div>
          <p className="command-job-panel__title">{job.label}</p>
          <p className="command-job-panel__meta muted">
            {job.phase} · {job.message}
          </p>
        </div>
        <div className="actions command-job-panel__actions">
          {job.active ? (
            <button className="secondary" onClick={() => void cancelJob()} type="button">
              取消
            </button>
          ) : (
            <button className="ghost" onClick={clearJob} type="button">
              关闭
            </button>
          )}
        </div>
      </div>
      <pre ref={logRef} className="command-job-panel__log">
        {job.lines.length > 0 ? job.lines.join("\n") : "等待命令输出…"}
      </pre>
    </section>
  );
}
