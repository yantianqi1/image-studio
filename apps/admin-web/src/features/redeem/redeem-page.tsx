"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "@/features/shell/admin-shell";
import { ErrorBox } from "@/features/ui/error-box";
import { Panel } from "@/features/ui/panel";
import { adminApi } from "@/lib/admin-api";

export function RedeemPage() {
  const [codes, setCodes] = useState<
    readonly {
      id: number;
      code: string;
      credit_amount_cents: number;
      status: string;
      redeemed_by_user_id: number | null;
    }[]
  >([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const nextCodes = await adminApi.redeemCodes();
      setCodes(nextCodes);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "读取兑换码失败",
      );
    }
  }

  useEffect(() => {
    const bootstrap = async () => {
      await refresh();
    };
    void bootstrap();
  }, []);

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
                setError("");
                const batch = await adminApi.createRedeemBatch({
                  name: String(formData.get("name") ?? ""),
                  credit_amount_cents: Number(formData.get("amount") ?? "0"),
                  codes: String(formData.get("codes") ?? "")
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                });
                setMessage(`批次 ${batch.name} 已创建`);
                await refresh();
              } catch (nextError) {
                setError(
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
              name="amount"
              placeholder="额度（cents）"
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
          <div className="mt-3 grid gap-2">
            {message ? <div className="admin-card text-emerald-700">{message}</div> : null}
            {error ? <ErrorBox message={error} /> : null}
          </div>
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
                  <span className="text-xs font-semibold">{code.credit_amount_cents} cents</span>
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
