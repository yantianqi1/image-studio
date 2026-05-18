"use client";

import { useState, type FormEvent } from "react";

import { ErrorBox } from "@/features/ui/error-box";
import { AdminSection } from "@/features/ui/admin-page";
import { adminApi, type AdminRedeemBatch } from "@/lib/admin-api";
import { normalizeRedeemBatchExpiresAt } from "@/lib/admin-redeem";
import { creditsToCents, errorText, normalizeOptionalString } from "./redeem-utils";

export function RedeemCreateBatchPanel({
  onCreated,
}: Readonly<{
  onCreated: (batch: AdminRedeemBatch) => Promise<void>;
}>) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      setLoading(true);
      setError("");
      const batch = await createBatchFromForm(new FormData(form));
      await onCreated(batch);
      form.reset();
    } catch (nextError) {
      setError(errorText(nextError, "创建批次失败"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminSection title="创建激活码批次" description="前端输入 credits，提交时转换为后端 cents；批次创建会写入审计日志。">
      <form className="grid gap-3" onSubmit={handleSubmit}>
        <input className="admin-input" name="name" placeholder="批次名称" required />
        <input className="admin-input" name="credit_amount_credits" placeholder="单码额度（credits）" type="number" min="0.1" step="0.1" required />
        <input className="admin-input" name="quantity" placeholder="生成数量" type="number" min="1" required />
        <input className="admin-input" name="prefix" placeholder="可选前缀，例如 COMP" />
        <input className="admin-input" name="expires_at" type="datetime-local" />
        <textarea className="admin-input min-h-20 resize-y" name="note" placeholder="可选备注" />
        <textarea className="admin-input min-h-20 resize-y" name="reason" placeholder="创建原因，必填" required />
        <button className="admin-button" type="submit" disabled={loading}>
          {loading ? "创建中..." : "创建批次"}
        </button>
      </form>
      {error ? <div className="mt-3"><ErrorBox message={error} /></div> : null}
    </AdminSection>
  );
}

function createBatchFromForm(formData: FormData) {
  return adminApi.createRedeemBatch({
    name: String(formData.get("name") ?? ""),
    credit_amount_cents: creditsToCents(formData.get("credit_amount_credits")),
    quantity: Number(formData.get("quantity") ?? "0"),
    prefix: normalizeOptionalString(formData.get("prefix")),
    expires_at: normalizeRedeemBatchExpiresAt(formData.get("expires_at")),
    note: String(formData.get("note") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
}
