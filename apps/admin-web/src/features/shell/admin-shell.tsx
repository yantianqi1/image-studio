import type { ReactNode } from "react";

import { AdminNav } from "@/features/shell/admin-nav";
import { BrandMark } from "@/features/shell/brand-mark";
import { PageToolbar } from "@/features/ui/page-toolbar";

type AdminShellProps = Readonly<{
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}>;

export function AdminShell({ title, description, actions, children }: AdminShellProps) {
  return (
    <div className="admin-root">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <span className="admin-brand-mark">
            <BrandMark />
          </span>
          <div>
            <p className="admin-brand">CS Admin</p>
            <p className="admin-caption">image Studio operations</p>
          </div>
        </div>
        <AdminNav />
      </aside>
      <main className="admin-main">
        <PageToolbar title={title} description={description} actions={actions} />
        <section className="admin-content">{children}</section>
      </main>
    </div>
  );
}
