"use client";

import { useState, type ReactNode } from "react";

type ConfirmDialogProps = Readonly<{
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
  children?: ReactNode;
}>;

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const [submitting, setSubmitting] = useState(false);

  if (!open) {
    return null;
  }

  async function handleConfirm() {
    try {
      setSubmitting(true);
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  }

  const resolvedBusy = busy || submitting;

  return (
    <div className="admin-confirm-backdrop" onClick={onCancel} role="presentation">
      <div className="admin-confirm-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <h3 className="admin-confirm-title">{title}</h3>
        {description ? <p className="admin-confirm-description">{description}</p> : null}
        {children ? <div className="admin-confirm-body">{children}</div> : null}
        <div className="admin-confirm-actions">
          <button className="admin-button admin-button-secondary" type="button" onClick={onCancel} disabled={resolvedBusy}>
            {cancelLabel}
          </button>
          <button className={danger ? "admin-button admin-button-danger" : "admin-button"} type="button" onClick={() => void handleConfirm()} disabled={resolvedBusy}>
            {resolvedBusy ? "处理中..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
