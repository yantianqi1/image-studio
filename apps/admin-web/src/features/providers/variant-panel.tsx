"use client";

import { useEffect, useState } from "react";

import { Panel } from "@/features/ui/panel";
import { adminApi, type BatchVariantInput, type VariantMatrix, type VariantMatrixGroup } from "@/lib/admin-api";

type SellableModel = Awaited<ReturnType<typeof adminApi.models>>[number];
type Provider = Awaited<ReturnType<typeof adminApi.providers>>[number];
type UpstreamModel = { id: string; display_name: string };

type EditableSlot = {
  size: string;
  quality: string;
  upstream_provider_model: string | null;
  member_price_cents: number;
  anonymous_price_cents: number;
  status: string;
  dirty: boolean;
};

const TIER_LABELS: Record<string, string> = {
  standard: "标准",
  hd: "高清",
  "2k": "2K",
  "4k": "4K",
};

export function VariantPanel({
  model,
  providers,
  onMessage,
  onError,
}: {
  model: SellableModel;
  providers: readonly Provider[];
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [matrix, setMatrix] = useState<VariantMatrix | null>(null);
  const [slots, setSlots] = useState<Map<string, EditableSlot>>(new Map());
  const [upstreamModels, setUpstreamModels] = useState<readonly UpstreamModel[]>([]);
  const [saving, setSaving] = useState(false);

  const provider = providers.find((p) => p.id === model.provider_id);

  async function loadMatrix() {
    try {
      const data = await adminApi.variantMatrix(model.id);
      setMatrix(data);
      const map = new Map<string, EditableSlot>();
      for (const group of data.groups) {
        for (const tier of group.tiers) {
          for (const v of tier.variants) {
            const key = `${tier.size}|${v.quality}`;
            map.set(key, {
              size: tier.size,
              quality: v.quality,
              upstream_provider_model: v.upstream_provider_model,
              member_price_cents: v.member_price_cents ?? 0,
              anonymous_price_cents: v.anonymous_price_cents ?? 0,
              status: v.status ?? "disabled",
              dirty: false,
            });
          }
        }
      }
      setSlots(map);
    } catch (e) {
      onError(e instanceof Error ? e.message : "加载矩阵失败");
    }
  }

  async function loadUpstreamModels() {
    if (!provider?.base_url) return;
    try {
      const models = await adminApi.fetchUpstreamModels({
        url: provider.base_url,
        api_key_env: provider.api_key_env ?? undefined,
      });
      setUpstreamModels(models);
    } catch {
      // upstream fetch is optional
    }
  }

  useEffect(() => {
    if (open) {
      loadMatrix();
      loadUpstreamModels();
    }
  }, [open]);

  function updateSlot(key: string, patch: Partial<EditableSlot>) {
    setSlots((prev) => {
      const next = new Map(prev);
      const existing = next.get(key);
      if (existing) next.set(key, { ...existing, ...patch, dirty: true });
      return next;
    });
  }

  async function saveAll() {
    const dirtySlots = Array.from(slots.values()).filter((s) => s.dirty);
    if (dirtySlots.length === 0) {
      onMessage("没有修改");
      return;
    }
    setSaving(true);
    try {
      const variants: BatchVariantInput[] = dirtySlots.map((s) => ({
        size: s.size,
        quality: s.quality,
        upstream_provider_model: s.upstream_provider_model || undefined,
        member_price_cents: s.member_price_cents,
        anonymous_price_cents: s.anonymous_price_cents,
        status: s.status,
      }));
      await adminApi.batchUpsertVariants(model.id, { variants });
      onMessage(`已保存 ${variants.length} 个变体`);
      await loadMatrix();
    } catch (e) {
      onError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const dirtyCount = Array.from(slots.values()).filter((s) => s.dirty).length;

  return (
    <div className="mt-2">
      <button
        type="button"
        className="text-xs text-blue-600 hover:underline"
        onClick={() => setOpen(!open)}
      >
        {open ? "收起定价矩阵" : "管理定价矩阵"}
      </button>

      {open && matrix ? (
        <div className="mt-2 grid gap-3">
          <BatchToolbar
            slots={slots}
            upstreamModels={upstreamModels}
            onUpdate={(keys, patch) => {
              setSlots((prev) => {
                const next = new Map(prev);
                for (const key of keys) {
                  const existing = next.get(key);
                  if (existing) next.set(key, { ...existing, ...patch, dirty: true });
                }
                return next;
              });
            }}
          />

          {matrix.groups.map((group) => (
            <AspectRatioGroup
              key={group.aspect_ratio}
              group={group}
              slots={slots}
              upstreamModels={upstreamModels}
              onSlotChange={updateSlot}
            />
          ))}

          <button
            type="button"
            className="admin-button"
            disabled={saving || dirtyCount === 0}
            onClick={saveAll}
          >
            {saving ? "保存中..." : `保存全部${dirtyCount > 0 ? ` (${dirtyCount} 项修改)` : ""}`}
          </button>
        </div>
      ) : null}
    </div>
  );
}

// PLACEHOLDER_BATCH_TOOLBAR

function BatchToolbar({
  slots,
  upstreamModels,
  onUpdate,
}: {
  slots: Map<string, EditableSlot>;
  upstreamModels: readonly UpstreamModel[];
  onUpdate: (keys: string[], patch: Partial<EditableSlot>) => void;
}) {
  const [batchPrice, setBatchPrice] = useState("");
  const [batchQuality, setBatchQuality] = useState("all");
  const [batchTier, setBatchTier] = useState("all");

  function getFilteredKeys(): string[] {
    return Array.from(slots.entries())
      .filter(([, s]) => {
        if (batchQuality !== "all" && s.quality !== batchQuality) return false;
        const tier = getTierForSize(s.size);
        if (batchTier !== "all" && tier !== batchTier) return false;
        return true;
      })
      .map(([key]) => key);
  }

  return (
    <Panel title="批量操作" description="按条件批量设置价格、上游模型或状态">
      <div className="grid gap-2">
        <div className="grid grid-cols-3 gap-2">
          <select className="admin-input text-xs" value={batchQuality} onChange={(e) => setBatchQuality(e.target.value)}>
            <option value="all">全部 quality</option>
            <option value="low">低 (low)</option>
            <option value="medium">中 (medium)</option>
            <option value="high">高 (high)</option>
          </select>
          <select className="admin-input text-xs" value={batchTier} onChange={(e) => setBatchTier(e.target.value)}>
            <option value="all">全部档位</option>
            <option value="standard">标准</option>
            <option value="hd">高清</option>
            <option value="2k">2K</option>
            <option value="4k">4K</option>
          </select>
          <span className="text-xs text-gray-400 self-center">
            匹配 {getFilteredKeys().length} 项
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <input
            className="admin-input text-xs"
            type="number"
            min="0"
            placeholder="会员价（分）"
            value={batchPrice}
            onChange={(e) => setBatchPrice(e.target.value)}
          />
          <button
            type="button"
            className="admin-button text-xs"
            onClick={() => {
              const keys = getFilteredKeys();
              if (keys.length === 0 || !batchPrice) return;
              onUpdate(keys, { member_price_cents: Number(batchPrice) });
            }}
          >
            批量设会员价
          </button>
          <button
            type="button"
            className="admin-button text-xs"
            onClick={() => {
              const keys = getFilteredKeys();
              if (keys.length === 0 || !batchPrice) return;
              onUpdate(keys, { anonymous_price_cents: Number(batchPrice) });
            }}
          >
            批量设匿名价
          </button>
          <button
            type="button"
            className="admin-button text-xs"
            onClick={() => {
              const keys = getFilteredKeys();
              if (keys.length === 0) return;
              onUpdate(keys, { status: "active" });
            }}
          >
            批量启用
          </button>
        </div>
        {upstreamModels.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            <select
              className="admin-input text-xs"
              id="batch-upstream"
              defaultValue=""
            >
              <option value="">不绑定</option>
              {upstreamModels.map((m) => (
                <option key={m.id} value={m.id}>{m.display_name || m.id}</option>
              ))}
            </select>
            <button
              type="button"
              className="admin-button text-xs"
              onClick={() => {
                const el = document.getElementById("batch-upstream") as HTMLSelectElement;
                const keys = getFilteredKeys();
                if (keys.length === 0) return;
                onUpdate(keys, { upstream_provider_model: el.value || null });
              }}
            >
              批量绑定上游模型
            </button>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

// PLACEHOLDER_ASPECT_GROUP

function AspectRatioGroup({
  group,
  slots,
  upstreamModels,
  onSlotChange,
}: {
  group: VariantMatrixGroup;
  slots: Map<string, EditableSlot>;
  upstreamModels: readonly UpstreamModel[];
  onSlotChange: (key: string, patch: Partial<EditableSlot>) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const configuredCount = group.tiers.reduce((acc, tier) => {
    return acc + tier.variants.filter((v) => v.id !== null).length;
  }, 0);
  const totalCount = group.tiers.length * 3;

  return (
    <div className="admin-card">
      <button
        type="button"
        className="w-full flex items-center justify-between text-sm font-semibold"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span>{group.aspect_ratio}</span>
        <span className="text-xs text-gray-400 font-normal">
          {configuredCount}/{totalCount} 已配置 {collapsed ? "▸" : "▾"}
        </span>
      </button>
      {!collapsed ? (
        <div className="mt-2 grid gap-1">
          <div className="grid grid-cols-[100px_1fr_1fr_1fr] gap-1 text-xs text-gray-400 px-1">
            <span>分辨率</span>
            <span>低 (low)</span>
            <span>中 (medium)</span>
            <span>高 (high)</span>
          </div>
          {group.tiers.map((tier) => (
            <TierRow
              key={tier.size}
              tier={tier}
              slots={slots}
              upstreamModels={upstreamModels}
              onSlotChange={onSlotChange}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TierRow({
  tier,
  slots,
  upstreamModels,
  onSlotChange,
}: {
  tier: { tier: string; size: string; variants: readonly { quality: string; id: number | null }[] };
  slots: Map<string, EditableSlot>;
  upstreamModels: readonly UpstreamModel[];
  onSlotChange: (key: string, patch: Partial<EditableSlot>) => void;
}) {
  return (
    <div className="grid grid-cols-[100px_1fr_1fr_1fr] gap-1 items-start">
      <div className="text-xs py-1">
        <div className="font-medium">{tier.size}</div>
        <div className="text-gray-400">{TIER_LABELS[tier.tier] ?? tier.tier}</div>
      </div>
      {(["low", "medium", "high"] as const).map((q) => {
        const key = `${tier.size}|${q}`;
        const slot = slots.get(key);
        if (!slot) return <div key={q} />;
        return (
          <VariantCell
            key={q}
            slotKey={key}
            slot={slot}
            upstreamModels={upstreamModels}
            onChange={onSlotChange}
          />
        );
      })}
    </div>
  );
}

// PLACEHOLDER_CELL

function VariantCell({
  slotKey,
  slot,
  upstreamModels,
  onChange,
}: {
  slotKey: string;
  slot: EditableSlot;
  upstreamModels: readonly UpstreamModel[];
  onChange: (key: string, patch: Partial<EditableSlot>) => void;
}) {
  const active = slot.status === "active";
  const bg = slot.dirty ? "bg-yellow-50 border-yellow-200" : active ? "bg-white border-gray-200" : "bg-gray-50 border-gray-100";

  return (
    <div className={`border rounded p-1 text-xs grid gap-0.5 ${bg}`}>
      <div className="flex items-center gap-1">
        <label className="flex items-center gap-0.5 cursor-pointer">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => onChange(slotKey, { status: e.target.checked ? "active" : "disabled" })}
          />
          <span className={active ? "text-emerald-600" : "text-gray-400"}>
            {active ? "启用" : "禁用"}
          </span>
        </label>
      </div>
      <input
        className="w-full border rounded px-1 py-0.5 text-xs"
        type="number"
        min="0"
        placeholder="会员价"
        value={slot.member_price_cents || ""}
        onChange={(e) => onChange(slotKey, { member_price_cents: Number(e.target.value) || 0 })}
      />
      <input
        className="w-full border rounded px-1 py-0.5 text-xs"
        type="number"
        min="0"
        placeholder="匿名价"
        value={slot.anonymous_price_cents || ""}
        onChange={(e) => onChange(slotKey, { anonymous_price_cents: Number(e.target.value) || 0 })}
      />
      {upstreamModels.length > 0 ? (
        <select
          className="w-full border rounded px-1 py-0.5 text-xs"
          value={slot.upstream_provider_model ?? ""}
          onChange={(e) => onChange(slotKey, { upstream_provider_model: e.target.value || null })}
        >
          <option value="">默认模型</option>
          {upstreamModels.map((m) => (
            <option key={m.id} value={m.id}>{m.display_name || m.id}</option>
          ))}
        </select>
      ) : slot.upstream_provider_model ? (
        <div className="text-blue-500 truncate">→ {slot.upstream_provider_model}</div>
      ) : null}
    </div>
  );
}

function getTierForSize(size: string): string {
  const TIER_MAP: Record<string, string> = {
    "1024x1024": "standard", "1536x1536": "hd", "2048x2048": "2k", "4096x4096": "4k",
    "1152x768": "standard", "1728x1152": "hd", "2304x1536": "2k", "4096x2736": "4k",
    "1280x720": "standard", "1920x1080": "hd", "2560x1440": "2k", "3840x2160": "4k",
    "1344x576": "standard", "2016x864": "hd", "2688x1152": "2k", "3840x1644": "4k",
    "720x1280": "standard", "1080x1920": "hd", "1440x2560": "2k", "2160x3840": "4k",
    "1024x768": "standard", "1600x1200": "hd", "2048x1536": "2k", "4096x3072": "4k",
    "768x1024": "standard", "1200x1600": "hd", "1536x2048": "2k", "3072x4096": "4k",
  };
  return TIER_MAP[size] ?? "standard";
}





