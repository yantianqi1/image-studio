import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  hint,
}: Readonly<{
  label: string;
  value: string;
  hint?: ReactNode;
}>) {
  return (
    <div className="admin-stat-card">
      <p className="admin-stat-label">{label}</p>
      <p className="admin-stat-value">{value}</p>
      {hint ? <div className="admin-stat-hint">{hint}</div> : null}
    </div>
  );
}
