"use client";

import { AdminShell } from "@/features/shell/admin-shell";
import { ErrorBox } from "@/features/ui/error-box";
import { Panel } from "@/features/ui/panel";
import { adminApi } from "@/lib/admin-api";
import { useRedeemCodes } from "@/lib/use-admin-data";
import { useToast } from "@/lib/toast-context";

export function RedeemPage() {
  const { data: codes = [], error: loadError, mutate } = useRedeemCodes();
  const toast = useToast();

  return (
    <AdminShell
      title="激活码与批次"
      description="后台可以创建批次、查看兑换码状态和兑换用户。"
    >
      <div className="col-span-12 lg:col-span-5">
        <Panel
          title="创建激活码批次"
          description="提交 /api/admin/redeem/batches"
        >
          <form
            className="grid gap-3"
            action={async (formData) => {
              try {
                const batch = await adminApi.createRedeemBatch({
                  name: String(formData.get("name") ?? ""),
                  credit_amount_cents: Number(formData.get("amount_credits") ?? "0") * 10,
                  codes: String(formData.get("codes") ?? "")
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                });
                toast.success(`批次 ${batch.name} 已创建`);
                mutate();
              } catch (nextError) {
                toast.error(
                  nextError instanceof Error
                    ? nextError.message
                    : "创建批次失败",
                );
              }
            }}
          >
            <input className="admin-input" name="name" placeholder="批次名称" />
            <input
              className="admin-input"
              name="amount_credits"
              placeholder="额度（10 额度 = 1 元）"
              type="number"
              min="1"
            />
            <textarea
              className="admin-input min-h-24 resize-y"
              name="codes"
              placeholder="逗号分隔多个兑换码"
            />
            <button className="admin-button" type="submit">
              创建批次
            </button>
          </form>
          {loadError ? <div className="mt-3"><ErrorBox message={loadError instanceof Error ? loadError.message : "读取兑换码失败"} /></div> : null}
        </Panel>
      </div>

      <div className="col-span-12 lg:col-span-7">
        <Panel
          title="兑换码列表"
          description="读取 /api/admin/redeem/codes"
        >
          <div className="grid gap-2">
            {codes.map((code) => (
              <div key={code.id} className="admin-card flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-sm truncate">{code.code}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {code.redeemed_by_user_id
                      ? `已兑换 · user #${code.redeemed_by_user_id}`
                      : "未兑换"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-semibold">{code.credit_amount_credits} 额度</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${code.status === "redeemed" ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>
                    {code.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </AdminShell>
  );
}
