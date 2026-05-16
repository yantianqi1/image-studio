"use client";

import { useState } from "react";

import { adminApi } from "@/lib/admin-api";

type SellableModel = Awaited<ReturnType<typeof adminApi.models>>[number];

export function VariantQuickActions({
  model,
  onError,
  onMessage,
}: Readonly<{
  model: SellableModel;
  onError: (message: string) => void;
  onMessage: (message: string) => void;
}>) {
  const [pending, setPending] = useState<"default" | "force" | null>(null);
  return (
    <div className="grid gap-2 rounded border border-gray-200 bg-gray-50 p-2 text-xs sm:grid-cols-[1fr_auto_auto]">
      <p className="self-center text-gray-500">
        推荐定价会按尺寸和质量生成完整矩阵；手动价格默认保留。
      </p>
      <button className="admin-button text-xs" disabled={pending !== null} type="button" onClick={() => applyPricing(false)}>
        {pending === "default" ? "应用中..." : "应用推荐价"}
      </button>
      <button className="admin-button text-xs" disabled={pending !== null} type="button" onClick={() => applyPricing(true)}>
        {pending === "force" ? "重算中..." : "强制重算"}
      </button>
    </div>
  );

  async function applyPricing(force: boolean) {
    setPending(force ? "force" : "default");
    try {
      const result = await adminApi.applyDefaultPricing(model.id, { force });
      onMessage(`定价已更新 ${result.updated} 项，跳过 ${result.skipped} 项`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "应用推荐定价失败");
    } finally {
      setPending(null);
    }
  }
}
