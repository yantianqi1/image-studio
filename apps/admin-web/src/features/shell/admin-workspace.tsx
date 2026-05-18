"use client";

import type { ReactNode } from "react";

import { AdminSidebar } from "@/features/shell/admin-sidebar";
import { AdminTopbar } from "@/features/shell/admin-topbar";

export function AdminWorkspace({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="admin-root">
      <AdminSidebar />
      <main className="admin-main">
        <AdminTopbar />
        {children}
      </main>
    </div>
  );
}
