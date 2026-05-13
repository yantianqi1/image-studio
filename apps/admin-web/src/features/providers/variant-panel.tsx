"use client";

import { useEffect, useState } from "react";

import { Panel } from "@/features/ui/panel";
import { adminApi, type ModelVariant } from "@/lib/admin-api";

type SellableModel = Awaited<ReturnType<typeof adminApi.models>>[number];

export function VariantPanel({
  model,
  onMessage,
  onError,
}: {
  model: SellableModel;
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [variants, setVariants] = useState<readonly ModelVariant[]>([]);
  const [open, setOpen] = useState(false);

  async function refresh() {
    const data = await adminApi.modelVariants(model.id);
    setVariants(data);
  }

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  return (
    <div className="mt-2">
      <button
        type="button"
        className="text-xs text-blue-600 hover:underline"
        onClick={() => setOpen(!open)}
      >
        {open ? "收起定价变体" : `管理定价变体`}
      </button>

      {open ? (
        <div className="mt-2 grid gap-3">
          <Panel title="定价变体" description={`${model.code} 的 size×quality 组合定价`}>
            <div className="grid gap-2">
              {variants.map((v) => (
                <VariantRow
                  key={v.id}
                  variant={v}
                  modelId={model.id}
                  onUpdated={(msg) => { onMessage(msg); refresh(); }}
                  onError={onError}
                />
              ))}
              {variants.length === 0 ? (
                <div className="text-sm text-gray-400">暂无变体，请添加</div>
              ) : null}
            </div>
          </Panel>

          <Panel title="新增变体" description="为该模型添加 size+quality 定价组合">
            <form
              className="grid gap-2"
              action={async (formData) => {
                try {
                  await adminApi.createModelVariant(model.id, {
                    size: String(formData.get("size") ?? ""),
                    quality: String(formData.get("quality") ?? "medium"),
                    upstream_provider_model: String(formData.get("upstream_provider_model") ?? "") || undefined,
                    member_price_cents: Number(formData.get("member_price_cents") ?? "0"),
                    anonymous_price_cents: Number(formData.get("anonymous_price_cents") ?? "0"),
                  });
                  onMessage("变体已创建");
                  refresh();
                } catch (e) {
                  onError(e instanceof Error ? e.message : "创建失败");
                }
              }}
            >
              <input className="admin-input" name="size" placeholder="分辨率 如 1024x1024" required />
              <select className="admin-input" name="quality" defaultValue="medium">
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
              <input className="admin-input" name="upstream_provider_model" placeholder="上游模型名（可选，覆盖父模型）" />
              <div className="grid grid-cols-2 gap-2">
                <input className="admin-input" name="member_price_cents" type="number" min="0" placeholder="会员价（分）" required />
                <input className="admin-input" name="anonymous_price_cents" type="number" min="0" placeholder="匿名价（分）" />
              </div>
              <button className="admin-button" type="submit">添加变体</button>
            </form>
          </Panel>
        </div>
      ) : null}
    </div>
  );
}

function VariantRow({
  variant,
  modelId,
  onUpdated,
  onError,
}: {
  variant: ModelVariant;
  modelId: number;
  onUpdated: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  return (
    <form
      className="admin-card grid gap-2"
      action={async (formData) => {
        try {
          await adminApi.updateModelVariant(modelId, variant.id, {
            upstream_provider_model: String(formData.get("upstream_provider_model") ?? "") || null,
            member_price_cents: Number(formData.get("member_price_cents") ?? "0"),
            anonymous_price_cents: Number(formData.get("anonymous_price_cents") ?? "0"),
            status: String(formData.get("status") ?? "active"),
          });
          onUpdated("变体已更新");
        } catch (e) {
          onError(e instanceof Error ? e.message : "更新失败");
        }
      }}
    >
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold">{variant.size}</span>
        <span className="text-gray-400">×</span>
        <span className="font-semibold">{variant.quality}</span>
        {variant.upstream_provider_model ? (
          <span className="text-xs text-blue-500 ml-auto">→ {variant.upstream_provider_model}</span>
        ) : null}
      </div>
      <input className="admin-input" name="upstream_provider_model" defaultValue={variant.upstream_provider_model ?? ""} placeholder="上游模型（可选）" />
      <div className="grid grid-cols-2 gap-2">
        <input className="admin-input" name="member_price_cents" type="number" min="0" defaultValue={variant.member_price_cents} />
        <input className="admin-input" name="anonymous_price_cents" type="number" min="0" defaultValue={variant.anonymous_price_cents} />
      </div>
      <div className="flex gap-2">
        <select className="admin-input" name="status" defaultValue={variant.status}>
          <option value="active">启用</option>
          <option value="disabled">禁用</option>
        </select>
        <button className="admin-button" type="submit">保存</button>
        <button
          className="admin-button border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
          type="button"
          onClick={async () => {
            if (!window.confirm("确认删除此变体？")) return;
            try {
              await adminApi.deleteModelVariant(modelId, variant.id);
              onUpdated("变体已删除");
            } catch (e) {
              onError(e instanceof Error ? e.message : "删除失败");
            }
          }}
        >
          删除
        </button>
      </div>
    </form>
  );
}
