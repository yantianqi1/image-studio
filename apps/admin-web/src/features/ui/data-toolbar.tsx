import type { ReactNode } from "react";

export function DataToolbar({
  title,
  description,
  actions,
  children,
}: Readonly<{
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
}>) {
  return (
    <header className="admin-data-toolbar">
      <div className="admin-data-toolbar-heading">
        <div className="min-w-0">
          <h2 className="admin-data-toolbar-title">{title}</h2>
          {description ? <p className="admin-data-toolbar-description">{description}</p> : null}
        </div>
        {actions ? <div className="admin-data-toolbar-actions">{actions}</div> : null}
      </div>
      {children ? <div className="admin-data-toolbar-filters">{children}</div> : null}
    </header>
  );
}
