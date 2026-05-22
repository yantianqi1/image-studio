import type { ImageQueueSummary, RunningImageItem, WorkerNode, WorkerSummary } from "@/lib/admin-api";

type RuntimePanelProps = Readonly<{
  queueSummary: ImageQueueSummary | null;
  queueSummaryError: unknown;
  runningItems: readonly RunningImageItem[];
  runningItemsError: unknown;
  summary: WorkerSummary | null;
  summaryError: unknown;
  workers: readonly WorkerNode[];
  workersError: unknown;
  onDrain: (workerId: string) => void;
  onResume: (workerId: string) => void;
}>;

type CountItem = Readonly<{
  label: string;
  value: number | string;
  tone?: "danger";
}>;

export function ImageWorkerRuntimePanel(props: RuntimePanelProps) {
  const errorMessage = formatError(
    props.summaryError,
    props.workersError,
    props.queueSummaryError,
    props.runningItemsError,
  );
  return (
    <section className="admin-panel image-worker-runtime-panel">
      <div className="image-worker-runtime-header">
        <div>
          <h2>Worker runtime</h2>
          <p>{props.queueSummary ? "Go image item queue summary" : "queue summary API 正在读取"}</p>
        </div>
        <span className="image-worker-runtime-unavailable">{props.workers.length} workers</span>
      </div>
      {errorMessage ? <p className="image-worker-runtime-error">{errorMessage}</p> : null}
      <RuntimeCounts items={buildCountItems(props.queueSummary)} />
      <WorkerRows workers={props.workers} onDrain={props.onDrain} onResume={props.onResume} />
      <RunningItems items={props.runningItems} />
      <RuntimeAlerts summary={props.summary} />
    </section>
  );
}

function RuntimeCounts({ items }: Readonly<{ items: readonly CountItem[] }>) {
  return (
    <div className="image-worker-runtime-counts">
      {items.map((item) => (
        <div data-tone={item.tone} key={item.label}>
          <span>{item.value}</span>
          <strong>{item.label}</strong>
        </div>
      ))}
    </div>
  );
}

function RunningItems({ items }: Readonly<{ items: readonly RunningImageItem[] }>) {
  if (items.length === 0) {
    return <p className="image-worker-runtime-note">暂无运行中的 image item。</p>;
  }
  return (
    <div className="image-worker-runtime-running">
      {items.map((item) => (
        <div key={item.item_id}>
          <strong>#{item.item_id} / job #{item.job_id} / result {item.result_index}</strong>
          <span>{item.locked_by ?? "unknown worker"} / {item.model_code}</span>
          <small>lease: {item.lease_expires_at ?? "-"}</small>
        </div>
      ))}
    </div>
  );
}

function RuntimeAlerts({ summary }: Readonly<{ summary: WorkerSummary | null }>) {
  if (!summary?.alerts.length) {
    return <p className="image-worker-runtime-note">当前 summary 未报告告警。</p>;
  }
  return (
    <div className="image-worker-runtime-alerts">
      {summary.alerts.map((alert) => (
        <span key={alert.code}>{alert.level}: {alert.message}</span>
      ))}
    </div>
  );
}

function WorkerRows({
  workers,
  onDrain,
  onResume,
}: Readonly<{
  workers: readonly WorkerNode[];
  onDrain: (workerId: string) => void;
  onResume: (workerId: string) => void;
}>) {
  if (workers.length === 0) {
    return <p className="image-worker-runtime-note">暂无 worker 节点。</p>;
  }
  return (
    <div className="image-worker-runtime-workers">
      {workers.map((worker) => (
        <div key={worker.id} className="image-worker-runtime-worker">
          <div>
            <strong>{worker.worker_name}</strong>
            <span>{worker.status} / {worker.mode} / {worker.concurrency}</span>
            <small>{worker.id}</small>
          </div>
          <div className="image-worker-runtime-actions">
            <button className="admin-button" disabled={worker.status === "draining"} type="button" onClick={() => onDrain(worker.id)}>
              Drain
            </button>
            <button className="admin-button" disabled={worker.status === "running"} type="button" onClick={() => onResume(worker.id)}>
              Resume
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function buildCountItems(queueSummary: ImageQueueSummary | null): readonly CountItem[] {
  const items = queueSummary?.items;
  return [
    { label: "queued", value: items?.queued ?? "-" },
    { label: "running", value: items?.running ?? "-" },
    { label: "succeeded", value: items?.succeeded ?? "-" },
    { label: "failed", value: items?.failed ?? "-", tone: items?.failed ? "danger" : undefined },
    { label: "dead letter", value: items?.dead_letter ?? "-", tone: items?.dead_letter ? "danger" : undefined },
    {
      label: "stale",
      value: queueSummary?.stale_running ?? "-",
      tone: queueSummary?.stale_running ? "danger" : undefined,
    },
  ];
}

function formatError(...errors: readonly unknown[]): string {
  const error = errors.find(Boolean);
  if (!error) return "";
  if (error instanceof Error) return `worker runtime API 不可用：${error.message}`;
  return "worker runtime API 不可用";
}
