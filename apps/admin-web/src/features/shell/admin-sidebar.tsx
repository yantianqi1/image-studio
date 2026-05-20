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
          <p className="admin-brand">商业影像后台</p>
          <p className="admin-caption">运营管理中心</p>
        </div>
      </div>
      <AdminNav />
    </aside>
  );
}
