"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import "@/features/users/users.css";
import { AdminShell } from "@/features/shell/admin-shell";
import { ErrorBox } from "@/features/ui/error-box";
import { Panel } from "@/features/ui/panel";
import { adminApi, type AdminUser, type AdminUserList } from "@/lib/admin-api";
import { PaginationControls } from "./pagination-controls";
import { errorMessage } from "./user-format";
import { UserDetailDrawer } from "./user-detail-drawer";
import { UsersTable } from "./users-table";
import { UsersToolbar, type UsersToolbarDraft } from "./users-toolbar";

const FIRST_PAGE = 1;
const USERS_PAGE_SIZE = 10;
const initialUsers: AdminUserList = { items: [], total: 0, page: FIRST_PAGE, page_size: USERS_PAGE_SIZE };

type UserFilters = Readonly<{
  q?: string;
  status?: string;
  page: number;
  pageSize: number;
}>;

export function UsersPage() {
  const [draft, setDraft] = useState<UsersToolbarDraft>({ q: "", status: "" });
  const [filters, setFilters] = useState<UserFilters>({ page: FIRST_PAGE, pageSize: USERS_PAGE_SIZE });
  const [refreshToken, setRefreshToken] = useState(0);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [users, setUsers] = useState<AdminUserList>(initialUsers);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    adminApi.users(filters)
      .then((result) => setUsers(result))
      .catch((nextError) => setError(errorMessage(nextError, "读取用户失败")))
      .finally(() => setLoading(false));
  }, [filters, refreshToken]);

  return (
    <AdminShell title="用户管理" description="搜索真实用户记录，检查状态、钱包余额和账本。">
      <div className="col-span-12">
        <Panel title="用户列表" description="读取后台用户接口。">
          <UsersToolbar
            draft={draft}
            loading={loading}
            resultLabel={buildResultLabel(users.total, loading)}
            onDraftChange={setDraft}
            onRefresh={() => refreshUsers({ setLoading, setError, setRefreshToken })}
            onSubmit={() => submitFilters({ draft, setLoading, setError, setFilters })}
          />
          {error ? <ErrorBox message={error} /> : null}
          <UsersTable users={users.items} loading={loading} onSelectUser={setSelectedUser} />
          <PaginationControls
            loading={loading}
            page={users.page}
            pageSize={users.page_size}
            total={users.total}
            onPageChange={(page) => changePage({ page, setLoading, setError, setFilters })}
          />
        </Panel>
      </div>
      <UserDetailDrawer
        user={selectedUser}
        onUsersRefresh={() => refreshUsers({ setLoading, setError, setRefreshToken })}
        onClose={() => setSelectedUser(null)}
      />
    </AdminShell>
  );
}

function buildFilters(draft: UsersToolbarDraft): UserFilters {
  return {
    q: draft.q.trim() || undefined,
    status: draft.status || undefined,
    page: FIRST_PAGE,
    pageSize: USERS_PAGE_SIZE,
  };
}

function buildResultLabel(total: number, loading: boolean) {
  if (loading) {
    return "正在刷新用户...";
  }
  return `共 ${total} 个用户`;
}

function refreshUsers(options: Readonly<{
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
  setRefreshToken: Dispatch<SetStateAction<number>>;
}>) {
  const { setLoading, setError, setRefreshToken } = options;
  setLoading(true);
  setError("");
  setRefreshToken((value) => value + FIRST_PAGE);
}

function submitFilters(options: Readonly<{
  draft: UsersToolbarDraft;
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
  setFilters: Dispatch<SetStateAction<UserFilters>>;
}>) {
  const { draft, setLoading, setError, setFilters } = options;
  setLoading(true);
  setError("");
  setFilters(buildFilters(draft));
}

function changePage(options: Readonly<{
  page: number;
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
  setFilters: Dispatch<SetStateAction<UserFilters>>;
}>) {
  const { page, setLoading, setError, setFilters } = options;
  setLoading(true);
  setError("");
  setFilters((current) => ({ ...current, page }));
}
