import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CommandJobConflictError, openCommandJobStream, startCommandJob } from "../commandJobApi";
import {
  initialCommandJobState,
  type CommandJobStartResponse,
  type CommandJobState,
} from "../commandJobTypes";

type CommandJobContextValue = {
  job: CommandJobState;
  runJob: (
    path: string,
    init?: RequestInit,
    options?: {
      onDone?: (success: boolean, result?: unknown) => void;
    },
  ) => Promise<CommandJobStartResponse>;
  cancelJob: () => Promise<void>;
  clearJob: () => void;
};

const CommandJobContext = createContext<CommandJobContextValue | null>(null);

type CommandJobProviderProps = {
  children: ReactNode;
  onNotify: (kind: "info" | "success" | "error", text: string) => void;
};

export function CommandJobProvider({ children, onNotify }: CommandJobProviderProps) {
  const [job, setJob] = useState<CommandJobState>(initialCommandJobState);
  const closeStreamRef = useRef<(() => void) | null>(null);
  const onDoneRef = useRef<((success: boolean, result?: unknown) => void) | undefined>(undefined);

  const clearJob = useCallback(() => {
    closeStreamRef.current?.();
    closeStreamRef.current = null;
    setJob(initialCommandJobState);
  }, []);

  const subscribeJob = useCallback((start: CommandJobStartResponse) => {
    closeStreamRef.current?.();
    setJob({
      jobId: start.job_id,
      label: start.label,
      phase: "running",
      message: "任务已启动…",
      lines: [],
      active: true,
    });

    closeStreamRef.current = openCommandJobStream(start.job_id, {
      onPhase: (phase, message) => {
        setJob((current) => ({
          ...current,
          phase,
          message,
        }));
      },
      onLine: (text) => {
        setJob((current) => ({
          ...current,
          lines: [...current.lines, text],
        }));
      },
      onDone: (success, message, result) => {
        setJob((current) => ({
          ...current,
          active: false,
          phase: success ? "success" : "failed",
          message,
        }));
        onNotify(success ? "success" : "error", message);
        onDoneRef.current?.(success, result);
        onDoneRef.current = undefined;
        closeStreamRef.current = null;
      },
      onError: (message) => {
        setJob((current) => ({
          ...current,
          message,
        }));
        onNotify("error", message);
      },
    });
  }, [onNotify]);

  const runJob = useCallback(
    async (
      path: string,
      init?: RequestInit,
      options?: { onDone?: (success: boolean, result?: unknown) => void },
    ) => {
      onDoneRef.current = options?.onDone;
      try {
        const start = await startCommandJob(path, init);
        subscribeJob(start);
        return start;
      } catch (error) {
        onDoneRef.current = undefined;
        if (error instanceof CommandJobConflictError) {
          onNotify(
            "info",
            `${error.busy.error}（${error.busy.label}）`,
          );
          if (error.busy.active_job_id) {
            subscribeJob({
              job_id: error.busy.active_job_id,
              kind: error.busy.kind,
              label: error.busy.label,
            });
          }
        }
        throw error;
      }
    },
    [onNotify, subscribeJob],
  );

  const cancelJob = useCallback(async () => {
    if (!job.jobId || !job.active) {
      return;
    }

    await fetch(`/api/jobs/${encodeURIComponent(job.jobId)}/cancel`, {
      method: "POST",
      credentials: "include",
    });
  }, [job.active, job.jobId]);

  const value = useMemo(
    () => ({
      job,
      runJob,
      cancelJob,
      clearJob,
    }),
    [cancelJob, clearJob, job, runJob],
  );

  return <CommandJobContext.Provider value={value}>{children}</CommandJobContext.Provider>;
}

export function useCommandJob() {
  const context = useContext(CommandJobContext);
  if (!context) {
    throw new Error("useCommandJob must be used within CommandJobProvider");
  }
  return context;
}
