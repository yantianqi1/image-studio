"use client";

import { usePathname } from "next/navigation";

import { AdminLogoutButton } from "@/features/shell/admin-logout-button";
import { findAdminNavLocation } from "@/features/shell/admin-navigation";

export function AdminTopbar() {
  const pathname = usePathname();
  const location = findAdminNavLocation(pathname);

  return (
    <header className="admin-topbar">
      <div className="admin-topbar-location">
        <p className="admin-topbar-kicker">{location?.group.label ?? "Dashboard"}</p>
        <div className="admin-topbar-title-row">
          <h1 className="admin-topbar-title">{location?.item.label ?? "后台工作台"}</h1>
          <span className="admin-topbar-token">{location?.item.token ?? "admin"}</span>
        </div>
        <p className="admin-topbar-description">{location?.item.detail ?? location?.group.description ?? "后台操作入口"}</p>
      </div>
      <div className="admin-topbar-actions">
        <AdminLogoutButton />
      </div>
    </header>
  );
}
