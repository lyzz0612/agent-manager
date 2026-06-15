import { useEffect } from "react";
import type { MessageKind } from "../types";

export function Panel(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h2>{props.title}</h2>
      {props.children}
    </section>
  );
}

export function InfoRow(props: { label: string; value: string }) {
  return (
    <div className="info-row">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

const STATUS_BANNER_AUTO_DISMISS_MS: Record<MessageKind, number> = {
  success: 4000,
  info: 4000,
  error: 8000,
};

export function StatusBanner(props: { kind: MessageKind; text: string; onDismiss: () => void }) {
  const { kind, text, onDismiss } = props;

  useEffect(() => {
    const timer = window.setTimeout(onDismiss, STATUS_BANNER_AUTO_DISMISS_MS[kind]);
    return () => window.clearTimeout(timer);
  }, [kind, text, onDismiss]);

  return (
    <div className={`status-banner ${kind}`} role="status">
      <span className="status-banner__text">{text}</span>
      <button
        aria-label="关闭通知"
        className="status-banner__close"
        onClick={onDismiss}
        type="button"
      >
        ×
      </button>
    </div>
  );
}

export function PageLoading(props: { label?: string }) {
  return <div className="screen-message">{props.label ?? "正在加载..."}</div>;
}
