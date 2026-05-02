import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: Readonly<{
  title: string;
  description: string;
  action?: ReactNode;
}>) {
  return (
    <div className="admin-empty-state">
      <div>
        <p className="admin-empty-title">{title}</p>
        <p className="admin-empty-description">{description}</p>
      </div>
      {action ? <div className="admin-empty-action">{action}</div> : null}
    </div>
  );
}
