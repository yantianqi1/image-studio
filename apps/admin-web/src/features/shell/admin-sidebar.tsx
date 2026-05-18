"use client";

import { BrandMark } from "@/features/shell/brand-mark";
import { AdminNav } from "@/features/shell/admin-nav";

export function AdminSidebar() {
  return (
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
  );
}
