"use client";

import { useState, type FormEvent } from "react";

import { ConfirmDialog } from "@/features/ui/confirm-dialog";
import { adminApi, type AdminWallet } from "@/lib/admin-api";
import { useToast } from "@/lib/toast-context";
import { errorMessage, formatCredits } from "./user-format";

const SITE_CREDIT_CENTS = 10;
type ToastApi = ReturnType<typeof useToast>;

export function UserCreditAdjustmentForm({
  userId,
  wallet,
  onAdjusted,
}: Readonly<{
  userId: number;
  wallet: AdminWallet;
  onAdjusted: () => Promise<void>;
}>) {
  const [amountCredits, setAmountCredits] = useState("");
  const [reason, setReason] = useState("");
  const [pendingAdjustment, setPendingAdjustment] = useState<PendingAdjustment | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const amountCents = parseAmountCents(amountCredits);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateInput(amountCents, reason);
    if (validation) {
      setError(validation);
      return;
    }
    if (amountCents < 0) {
      setPendingAdjustment({ amountCents, reason: reason.trim() });
      return;
    }
    const adjusted = await submitAdjustment({ userId, amountCents, reason, setSubmitting, setError });
    if (adjusted) {
      await refreshAfterAdjustment(onAdjusted, setAmountCredits, setReason, setError, toast);
    }
  }

  return (
    <form className="users-adjustment-form" onSubmit={handleSubmit}>
      <AdjustmentPreview wallet={wallet} amountCents={amountCents} />
      <AdjustmentInputs
        amountCredits={amountCredits}
        reason={reason}
        onAmountCreditsChange={setAmountCredits}
        onReasonChange={setReason}
      />
      {error ? <p className="users-inline-error">{error}</p> : null}
      <button className="admin-button" type="submit" disabled={submitting}>
        {submitting ? "提交中..." : "提交额度调整"}
      </button>
      <AdjustmentConfirmDialog
        pendingAdjustment={pendingAdjustment}
        submitting={submitting}
        userId={userId}
        onAdjusted={onAdjusted}
        setPendingAdjustment={setPendingAdjustment}
        setAmountCredits={setAmountCredits}
        setReason={setReason}
        setSubmitting={setSubmitting}
        setError={setError}
        toast={toast}
      />
    </form>
  );
}

function AdjustmentPreview({ wallet, amountCents }: Readonly<{ wallet: AdminWallet; amountCents: number }>) {
  const amountCredits = Math.abs(amountCents / SITE_CREDIT_CENTS);
  return (
    <div className="users-adjustment-preview">
      <span>当前余额：{formatCredits(wallet.balance_credits)}</span>
      <strong>本次{amountCents >= 0 ? "增加" : "扣减"}：{formatCredits(amountCredits)}</strong>
    </div>
  );
}

function AdjustmentInputs({
  amountCredits,
  reason,
  onAmountCreditsChange,
  onReasonChange,
}: Readonly<{
  amountCredits: string;
  reason: string;
  onAmountCreditsChange: (value: string) => void;
  onReasonChange: (value: string) => void;
}>) {
  return (
    <>
      <input
        className="admin-input"
        name="amount_credits"
        placeholder="调整额度，正数增加，负数扣减"
        type="number"
        step="0.1"
        value={amountCredits}
        onChange={(event) => onAmountCreditsChange(event.target.value)}
      />
      <textarea
        className="admin-input users-reason-input"
        name="reason"
        placeholder="操作原因，必填"
        value={reason}
        onChange={(event) => onReasonChange(event.target.value)}
      />
    </>
  );
}

function AdjustmentConfirmDialog({
  pendingAdjustment,
  submitting,
  userId,
  onAdjusted,
  setPendingAdjustment,
  setAmountCredits,
  setReason,
  setSubmitting,
  setError,
  toast,
}: Readonly<{
  pendingAdjustment: PendingAdjustment | null;
  submitting: boolean;
  userId: number;
  onAdjusted: () => Promise<void>;
  setPendingAdjustment: (adjustment: PendingAdjustment | null) => void;
  setAmountCredits: (value: string) => void;
  setReason: (value: string) => void;
  setSubmitting: (submitting: boolean) => void;
  setError: (error: string) => void;
  toast: ToastApi;
}>) {
  return (
    <ConfirmDialog
      open={Boolean(pendingAdjustment)}
      title="确认额度扣减"
      description={`确认扣减 ${formatCredits(Math.abs(pendingAdjustment?.amountCents ?? 0) / SITE_CREDIT_CENTS)} 并写入账本？`}
      confirmLabel="确认扣减"
      danger
      busy={submitting}
      onCancel={() => setPendingAdjustment(null)}
      onConfirm={() => confirmPendingAdjustment({
        pendingAdjustment,
        userId,
        onAdjusted,
        setPendingAdjustment,
        setAmountCredits,
        setReason,
        setSubmitting,
        setError,
        toast,
      })}
    />
  );
}

type SubmitOptions = Readonly<{
  userId: number;
  amountCents: number;
  reason: string;
  setSubmitting: (submitting: boolean) => void;
  setError: (error: string) => void;
}>;

async function submitAdjustment(options: SubmitOptions) {
  const { userId, amountCents, reason, setSubmitting, setError } = options;
  try {
    setSubmitting(true);
    setError("");
    await adminApi.adjustUserWallet(userId, { amount_cents: amountCents, reason: reason.trim() });
    return true;
  } catch (nextError) {
    setError(errorMessage(nextError, "额度调整失败"));
    return false;
  } finally {
    setSubmitting(false);
  }
}

async function confirmPendingAdjustment(options: Readonly<{
  pendingAdjustment: PendingAdjustment | null;
  userId: number;
  onAdjusted: () => Promise<void>;
  setPendingAdjustment: (adjustment: PendingAdjustment | null) => void;
  setAmountCredits: (value: string) => void;
  setReason: (value: string) => void;
  setSubmitting: (submitting: boolean) => void;
  setError: (error: string) => void;
  toast: ToastApi;
}>) {
  const { pendingAdjustment, userId, onAdjusted, setPendingAdjustment, setAmountCredits, setReason, setSubmitting, setError, toast } = options;
  if (!pendingAdjustment) {
    return;
  }
  const adjusted = await submitAdjustment({
    userId,
    amountCents: pendingAdjustment.amountCents,
    reason: pendingAdjustment.reason,
    setSubmitting,
    setError,
  });
  if (adjusted) {
    setPendingAdjustment(null);
    await refreshAfterAdjustment(onAdjusted, setAmountCredits, setReason, setError, toast);
  }
}

function validateInput(amountCents: number, reason: string) {
  if (amountCents === 0) {
    return "调整额度不能为 0";
  }
  if (!reason.trim()) {
    return "操作原因不能为空";
  }
  return "";
}

function parseAmountCents(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return Math.round(amount * SITE_CREDIT_CENTS);
}

type PendingAdjustment = Readonly<{
  amountCents: number;
  reason: string;
}>;

async function refreshAfterAdjustment(
  onAdjusted: () => Promise<void>,
  setAmountCredits: (value: string) => void,
  setReason: (value: string) => void,
  setError: (error: string) => void,
  toast: ToastApi,
) {
  try {
    await onAdjusted();
    setAmountCredits("");
    setReason("");
    toast.success("额度调整已写入账本");
  } catch (nextError) {
    setError(errorMessage(nextError, "刷新钱包失败"));
  }
}
