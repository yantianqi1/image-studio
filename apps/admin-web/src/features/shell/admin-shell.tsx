import type { ReactNode } from "react";

import { AdminPage } from "@/features/ui/admin-page";

type AdminShellProps = Readonly<{
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}>;

export function AdminShell({ title, description, actions, children }: AdminShellProps) {
  return <AdminPage title={title} description={description} actions={actions}>{children}</AdminPage>;
}
