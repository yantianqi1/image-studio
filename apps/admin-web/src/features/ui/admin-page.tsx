import type { ReactNode } from "react";

import { PageToolbar } from "@/features/ui/page-toolbar";

export function AdminPage({
  title,
  description,
  actions,
  children,
}: Readonly<{
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}>) {
  return (
    <section className="admin-page">
      <PageToolbar title={title} description={description} actions={actions} />
      <section className="admin-content">{children}</section>
    </section>
  );
}

export function AdminSection({
  title,
  description,
  actions,
  children,
}: Readonly<{
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}>) {
  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <div className="min-w-0">
          <h2 className="admin-section-title">{title}</h2>
          {description ? <p className="admin-section-description">{description}</p> : null}
        </div>
        {actions ? <div className="admin-section-actions">{actions}</div> : null}
      </div>
      <div className="admin-section-body">{children}</div>
    </section>
  );
}
