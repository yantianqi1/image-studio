import { EmptyState } from "@/features/ui/empty-state";
import { StatusPill } from "@/features/ui/status-pill";
import type { AdminUser } from "@/lib/admin-api";
import { formatDateTime } from "./user-format";

export function UsersTable({
  users,
  loading,
  onSelectUser,
}: Readonly<{
  users: readonly AdminUser[];
  loading: boolean;
  onSelectUser: (user: AdminUser) => void;
}>) {
  if (loading) {
    return <div className="users-table-state">正在读取用户...</div>;
  }
  if (users.length === 0) {
    return <EmptyState title="没有匹配用户" description="当前搜索和状态筛选没有返回用户记录。" />;
  }
  return (
    <div className="users-table-wrap">
      <table className="users-table">
        <thead>
          <tr>
            <th>用户</th>
            <th>状态</th>
            <th>创建时间</th>
            <th>ID</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <UserRow key={user.id} user={user} onSelectUser={onSelectUser} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserRow({ user, onSelectUser }: Readonly<{ user: AdminUser; onSelectUser: (user: AdminUser) => void }>) {
  return (
    <tr className="users-table-row" tabIndex={0} onClick={() => onSelectUser(user)} onKeyDown={(event) => selectByKey(event, user, onSelectUser)}>
      <td>
        <span className="users-primary-text">{user.display_name || user.email}</span>
        <span className="users-secondary-text">{user.email}</span>
      </td>
      <td>
        <StatusPill status={user.status} />
      </td>
      <td>{formatDateTime(user.created_at)}</td>
      <td>#{user.id}</td>
    </tr>
  );
}

function selectByKey(event: KeyboardEvent<HTMLTableRowElement>, user: AdminUser, onSelectUser: (user: AdminUser) => void) {
  if (event.key === "Enter") {
    onSelectUser(user);
  }
}
import type { KeyboardEvent } from "react";
