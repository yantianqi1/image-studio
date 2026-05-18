"use client";

import { useState } from "react";

import { ConfirmDialog } from "@/features/ui/confirm-dialog";
import { StatusPill } from "@/features/ui/status-pill";
import { adminApi, type AdminUser } from "@/lib/admin-api";
import { useToast } from "@/lib/toast-context";
import { errorMessage } from "./user-format";

const STATUS_ACTIONS = [
  { status: "active", label: "恢复为 active", confirm: "确认将该用户恢复为 active？" },
  { status: "disabled", label: "禁用用户", confirm: "确认将该用户禁用？" },
  { status: "deleted", label: "软删除用户", confirm: "确认将该用户标记为删除？" },
] as const;

export function UserStatusManagementPanel({
  user,
  onStatusChanged,
}: Readonly<{
  user: AdminUser;
  onStatusChanged: (user: AdminUser) => Promise<void> | void;
}>) {
  const [reason, setReason] = useState("");
  const [submittingStatus, setSubmittingStatus] = useState<string>("");
  const [pendingAction, setPendingAction] = useState<StatusAction | null>(null);
  const [error, setError] = useState("");
  const toast = useToast();

  return (
    <section className="users-detail-panel users-danger-panel">
      <div className="users-panel-heading">
        <div>
          <h3>用户状态管理</h3>
          <p>所有敏感操作都需要 reason 和确认。</p>
        </div>
        <StatusPill status={user.status} />
      </div>
      <textarea
        className="admin-input users-reason-input"
        placeholder="操作原因，必填"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      {error ? <p className="users-inline-error">{error}</p> : null}
      <StatusActionButtons
        submittingStatus={submittingStatus}
        onOpenAction={(action) => prepareStatusAction({ action, reason, setError, setPendingAction })}
      />
      <StatusActionConfirm
        action={pendingAction}
        reason={reason}
        user={user}
        onStatusChanged={onStatusChanged}
        setError={setError}
        setSubmittingStatus={setSubmittingStatus}
        submittingStatus={submittingStatus}
        onClose={() => setPendingAction(null)}
        toast={toast}
      />
    </section>
  );
}

type StatusAction = (typeof STATUS_ACTIONS)[number];

type HandleStatusActionOptions = Readonly<{
  action: StatusAction;
  reason: string;
  user: AdminUser;
  onStatusChanged: (user: AdminUser) => Promise<void> | void;
  setError: (error: string) => void;
  setSubmittingStatus: (status: string) => void;
  toast: ReturnType<typeof useToast>;
}>;

function StatusActionButtons({
  submittingStatus,
  onOpenAction,
}: Readonly<{
  submittingStatus: string;
  onOpenAction: (action: StatusAction) => void;
}>) {
  return (
    <div className="users-danger-actions">
      {STATUS_ACTIONS.map((action) => (
        <button
          key={action.status}
          className={action.status === "deleted" ? "admin-button users-danger-button" : "admin-button users-secondary-button"}
          type="button"
          disabled={Boolean(submittingStatus)}
          onClick={() => onOpenAction(action)}
        >
          {submittingStatus === action.status ? "提交中..." : action.label}
        </button>
      ))}
    </div>
  );
}

function StatusActionConfirm({
  action,
  reason,
  user,
  onStatusChanged,
  setError,
  setSubmittingStatus,
  submittingStatus,
  onClose,
  toast,
}: Readonly<{
  action: StatusAction | null;
  reason: string;
  user: AdminUser;
  onStatusChanged: (user: AdminUser) => Promise<void> | void;
  setError: (error: string) => void;
  setSubmittingStatus: (status: string) => void;
  submittingStatus: string;
  onClose: () => void;
  toast: ReturnType<typeof useToast>;
}>) {
  return (
    <ConfirmDialog
      open={Boolean(action)}
      title="确认用户状态操作"
      description={action?.confirm}
      confirmLabel={action?.label}
      danger={action?.status === "deleted"}
      busy={Boolean(submittingStatus)}
      onCancel={onClose}
      onConfirm={async () => {
        if (!action) {
          return;
        }
        const changed = await handleStatusAction({
          action,
          reason,
          user,
          onStatusChanged,
          setError,
          setSubmittingStatus,
          toast,
        });
        if (changed) {
          onClose();
        }
      }}
    />
  );
}

function prepareStatusAction(options: Readonly<{
  action: StatusAction;
  reason: string;
  setError: (error: string) => void;
  setPendingAction: (action: StatusAction | null) => void;
}>) {
  const trimmedReason = options.reason.trim();
  if (!trimmedReason) {
    options.setError("操作原因不能为空");
    return;
  }
  options.setError("");
  options.setPendingAction(options.action);
}

async function handleStatusAction(options: HandleStatusActionOptions) {
  const { action, reason, user, onStatusChanged, setError, setSubmittingStatus, toast } = options;
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    setError("操作原因不能为空");
    return false;
  }
  try {
    setSubmittingStatus(action.status);
    setError("");
    const nextUser = await adminApi.updateUserStatus(user.id, {
      status: action.status,
      reason: trimmedReason,
    });
    await onStatusChanged(nextUser);
    toast.success("用户状态已更新");
    return true;
  } catch (nextError) {
    setError(errorMessage(nextError, "用户状态更新失败"));
    return false;
  } finally {
    setSubmittingStatus("");
  }
}
