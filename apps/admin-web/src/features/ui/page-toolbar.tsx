import type { ReactNode } from "react";

export function PageToolbar({
  title,
  description,
  actions,
}: Readonly<{
  title: string;
  description: string;
  actions?: ReactNode;
}>) {
  return (
    <header className="admin-page-toolbar">
      <div className="admin-page-heading">
        <h1 className="admin-title">{title}</h1>
        <p className="admin-description">{description}</p>
      </div>
      {actions ? <div className="admin-toolbar-actions">{actions}</div> : null}
    </header>
  );
}
