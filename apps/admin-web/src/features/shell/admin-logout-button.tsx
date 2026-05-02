"use client";

import { adminApi } from "@/lib/admin-api";

export function AdminLogoutButton() {
  return (
    <button
      className="admin-nav-link admin-nav-logout w-full text-left"
      type="button"
      onClick={async () => {
        await adminApi.logout();
        window.location.replace("/admin/login");
      }}
    >
      <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9.5 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3.5" />
        <path d="m16 8 4 4-4 4" />
        <path d="M20 12H9" />
      </svg>
      <span>退出登录</span>
    </button>
  );
}
