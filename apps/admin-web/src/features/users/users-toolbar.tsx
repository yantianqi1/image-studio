import type { FormEvent } from "react";

import { formatStatusLabel } from "@/features/ui/admin-labels";

const statusOptions = [
  { value: "", label: "全部状态" },
  { value: "active", label: formatStatusLabel("active") },
  { value: "disabled", label: formatStatusLabel("disabled") },
  { value: "deleted", label: formatStatusLabel("deleted") },
  { value: "suspended", label: formatStatusLabel("suspended") },
] as const;

export type UsersToolbarDraft = Readonly<{
  q: string;
  status: string;
}>;

export function UsersToolbar({
  draft,
  loading,
  resultLabel,
  onDraftChange,
  onRefresh,
  onSubmit,
}: Readonly<{
  draft: UsersToolbarDraft;
  loading: boolean;
  resultLabel: string;
  onDraftChange: (draft: UsersToolbarDraft) => void;
  onRefresh: () => void;
  onSubmit: () => void;
}>) {
  return (
    <form className="users-toolbar" onSubmit={(event) => handleSubmit(event, onSubmit)}>
      <input
        className="admin-input users-search-input"
        value={draft.q}
        placeholder="搜索邮箱或名称"
        onChange={(event) => onDraftChange({ ...draft, q: event.target.value })}
      />
      <select
        className="admin-input users-status-select"
        value={draft.status}
        onChange={(event) => onDraftChange({ ...draft, status: event.target.value })}
      >
        {statusOptions.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
      <button className="admin-button" type="submit" disabled={loading}>
        搜索
      </button>
      <button className="admin-button users-secondary-button" type="button" onClick={onRefresh} disabled={loading}>
        刷新
      </button>
      <span className="users-result-count" aria-live="polite">
        {resultLabel}
      </span>
    </form>
  );
}

function handleSubmit(event: FormEvent<HTMLFormElement>, onSubmit: () => void) {
  event.preventDefault();
  onSubmit();
}
