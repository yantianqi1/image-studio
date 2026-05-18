type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

const toneClassNames: Record<StatusTone, string> = {
  neutral: "admin-status-pill admin-status-neutral",
  success: "admin-status-pill admin-status-success",
  warning: "admin-status-pill admin-status-warning",
  danger: "admin-status-pill admin-status-danger",
  info: "admin-status-pill admin-status-info",
};

const statusToneMap: Record<string, StatusTone> = {
  active: "success",
  enabled: "success",
  succeeded: "success",
  completed: "success",
  queued: "info",
  running: "info",
  pending: "warning",
  suspended: "warning",
  disabled: "neutral",
  deleted: "danger",
  soft_deleted: "danger",
  failed: "danger",
  error: "danger",
};

export function StatusPill({
  status,
  label = status,
  tone,
}: Readonly<{
  status: string;
  label?: string;
  tone?: StatusTone;
}>) {
  const resolvedTone = tone ?? statusToneMap[status.toLowerCase()] ?? "neutral";
  return <span className={toneClassNames[resolvedTone]}>{label}</span>;
}
