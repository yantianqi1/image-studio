"use client";

import { AdminShell } from "@/features/shell/admin-shell";
import { ErrorBox } from "@/features/ui/error-box";
import { Panel } from "@/features/ui/panel";
import { adminApi } from "@/lib/admin-api";
import { useEffect, useState } from "react";

export function UsersPage() {
  const [users, setUsers] = useState<
    readonly {
      id: number;
      email: string;
      display_name: string;
      status: string;
    }[]
  >([]);
  const [error, setError] = useState("");

  useEffect(() => {
    adminApi
      .users()
      .then(setUsers)
      .catch((nextError) => {
        setError(
          nextError instanceof Error ? nextError.message : "读取用户失败",
        );
      });
  }, []);

  return (
    <AdminShell
      title="用户目录"
      description="当前展示注册用户基础信息，后续可继续扩展钱包、风控和活跃度。"
    >
      <div className="col-span-12">
        <Panel title="用户列表" description="读取 /api/admin/auth/users">
          {error ? <ErrorBox message={error} /> : null}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {users.map((user) => (
              <div key={user.id} className="admin-card">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm truncate">{user.display_name || user.email}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">{user.status}</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">#{user.id} · {user.email}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </AdminShell>
  );
}
