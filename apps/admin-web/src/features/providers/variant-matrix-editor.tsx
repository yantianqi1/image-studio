"use client";

import { memo, useState } from "react";

import { Panel } from "@/features/ui/panel";
import type { VariantMatrixGroup } from "@/lib/admin-api";

import type { EditableSlot, SlotsState, UpstreamModel } from "./variant-editor-types";

type SlotPatchHandler = (key: string, patch: Partial<EditableSlot>) => void;
type BatchPatchHandler = (keys: string[], patch: Partial<EditableSlot>) => void;

const TIER_LABELS: Record<string, string> = {
  standard: "标准",
  hd: "高清",
  "2k": "2K",
  "4k": "4K",
};

export function BatchToolbar({
  slots,
  upstreamModels,
  onUpdate,
}: Readonly<{
  slots: SlotsState;
  upstreamModels: readonly UpstreamModel[];
  onUpdate: BatchPatchHandler;
}>) {
  const [batchPrice, setBatchPrice] = useState("");
  const [batchQuality, setBatchQuality] = useState("all");
  const [batchTier, setBatchTier] = useState("all");
  const [batchUpstream, setBatchUpstream] = useState("");
  const filteredKeys = getFilteredKeys(slots, batchQuality, batchTier);

  return (
    <Panel title="批量操作" description="按条件批量设置价格、上游模型或状态">
      <div className="grid gap-2">
        <BatchFilters
          matchedCount={filteredKeys.length}
          quality={batchQuality}
          tier={batchTier}
          onQualityChange={setBatchQuality}
          onTierChange={setBatchTier}
        />
        <PriceActions keysToUpdate={filteredKeys} price={batchPrice} onPriceChange={setBatchPrice} onUpdate={onUpdate} />
        {upstreamModels.length > 0 ? (
          <UpstreamAction
            keysToUpdate={filteredKeys}
            upstream={batchUpstream}
            upstreamModels={upstreamModels}
            onUpdate={onUpdate}
            onUpstreamChange={setBatchUpstream}
          />
        ) : null}
      </div>
    </Panel>
  );
}

export const MemoAspectRatioGroup = memo(AspectRatioGroup);

function BatchFilters(props: Readonly<{
  matchedCount: number;
  quality: string;
  tier: string;
  onQualityChange: (value: string) => void;
  onTierChange: (value: string) => void;
}>) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <select className="admin-input text-xs" value={props.quality} onChange={(event) => props.onQualityChange(event.target.value)}>
        <option value="all">全部 quality</option>
        <option value="low">低 (low)</option>
        <option value="medium">中 (medium)</option>
        <option value="high">高 (high)</option>
      </select>
      <select className="admin-input text-xs" value={props.tier} onChange={(event) => props.onTierChange(event.target.value)}>
        <option value="all">全部档位</option>
        <option value="standard">标准</option>
        <option value="hd">高清</option>
        <option value="2k">2K</option>
        <option value="4k">4K</option>
      </select>
      <span className="self-center text-xs text-gray-400">匹配 {props.matchedCount} 项</span>
    </div>
  );
}

function PriceActions(props: Readonly<{
  keysToUpdate: string[];
  price: string;
  onPriceChange: (value: string) => void;
  onUpdate: BatchPatchHandler;
}>) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <input className="admin-input text-xs" type="number" min="0" placeholder="价格（分）" value={props.price} onChange={(event) => props.onPriceChange(event.target.value)} />
      <button type="button" className="admin-button text-xs" onClick={() => updatePrice(props, "member_price_cents")}>批量设会员价</button>
      <button type="button" className="admin-button text-xs" onClick={() => updatePrice(props, "anonymous_price_cents")}>批量设匿名价</button>
      <button type="button" className="admin-button text-xs" onClick={() => updateStatus(props.keysToUpdate, props.onUpdate)}>批量启用</button>
    </div>
  );
}

function UpstreamAction(props: Readonly<{
  keysToUpdate: string[];
  upstream: string;
  upstreamModels: readonly UpstreamModel[];
  onUpdate: BatchPatchHandler;
  onUpstreamChange: (value: string) => void;
}>) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <select className="admin-input text-xs" value={props.upstream} onChange={(event) => props.onUpstreamChange(event.target.value)}>
        <option value="">不绑定</option>
        {props.upstreamModels.map((model) => (
          <option key={model.id} value={model.id}>{model.display_name || model.id}</option>
        ))}
      </select>
      <button type="button" className="admin-button text-xs" onClick={() => updateUpstream(props)}>批量绑定上游模型</button>
    </div>
  );
}

function AspectRatioGroup({
  group,
  slots,
  upstreamModels,
  onSlotChange,
  defaultCollapsed = false,
}: Readonly<{
  group: VariantMatrixGroup;
  slots: SlotsState;
  upstreamModels: readonly UpstreamModel[];
  onSlotChange: SlotPatchHandler;
  defaultCollapsed?: boolean;
}>) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const configuredCount = group.tiers.reduce((count, tier) => count + tier.variants.filter((variant) => variant.id !== null).length, 0);
  const totalCount = group.tiers.length * 3;

  return (
    <div className="admin-card">
      <button type="button" className="flex w-full items-center justify-between text-sm font-semibold" onClick={() => setCollapsed(!collapsed)}>
        <span>{group.aspect_ratio}</span>
        <span className="text-xs font-normal text-gray-400">{configuredCount}/{totalCount} 已配置 {collapsed ? "▸" : "▾"}</span>
      </button>
      {!collapsed ? <TierGrid group={group} slots={slots} upstreamModels={upstreamModels} onSlotChange={onSlotChange} /> : null}
    </div>
  );
}

function TierGrid(props: Readonly<{
  group: VariantMatrixGroup;
  slots: SlotsState;
  upstreamModels: readonly UpstreamModel[];
  onSlotChange: SlotPatchHandler;
}>) {
  return (
    <div className="mt-2 grid gap-1">
      <div className="hidden grid-cols-[100px_1fr_1fr_1fr] gap-1 px-1 text-xs text-gray-400 sm:grid">
        <span>分辨率</span>
        <span>低 (low)</span>
        <span>中 (medium)</span>
        <span>高 (high)</span>
      </div>
      {props.group.tiers.map((tier) => (
        <MemoTierRow key={tier.size} tier={tier} slots={props.slots} upstreamModels={props.upstreamModels} onSlotChange={props.onSlotChange} />
      ))}
    </div>
  );
}

const MemoTierRow = memo(TierRow);

function TierRow(props: Readonly<{
  tier: { tier: string; size: string; variants: readonly { quality: string; id: number | null }[] };
  slots: SlotsState;
  upstreamModels: readonly UpstreamModel[];
  onSlotChange: SlotPatchHandler;
}>) {
  return (
    <div className="grid grid-cols-1 items-start gap-1 sm:grid-cols-[100px_1fr_1fr_1fr]">
      <div className="py-1 text-xs">
        <div className="font-medium">{props.tier.size}</div>
        <div className="text-gray-400">{TIER_LABELS[props.tier.tier] ?? props.tier.tier}</div>
      </div>
      {(["low", "medium", "high"] as const).map((quality) => renderVariantCell(props, quality))}
    </div>
  );
}

const MemoVariantCell = memo(VariantCell);

function VariantCell(props: Readonly<{
  slotKey: string;
  slot: EditableSlot;
  upstreamModels: readonly UpstreamModel[];
  onChange: SlotPatchHandler;
}>) {
  const active = props.slot.status === "active";
  const bg = props.slot.dirty ? "bg-yellow-50 border-yellow-200" : active ? "bg-white border-gray-200" : "bg-gray-50 border-gray-100";
  return (
    <div className={`grid gap-0.5 rounded border p-1 text-xs ${bg}`}>
      <VariantActiveToggle active={active} slotKey={props.slotKey} onChange={props.onChange} />
      {active ? <VariantInputs {...props} /> : null}
    </div>
  );
}

function VariantActiveToggle(props: Readonly<{ active: boolean; slotKey: string; onChange: SlotPatchHandler }>) {
  return (
    <label className="flex cursor-pointer items-center gap-0.5">
      <input type="checkbox" checked={props.active} onChange={(event) => props.onChange(props.slotKey, { status: event.target.checked ? "active" : "disabled" })} />
      <span className={props.active ? "text-emerald-600" : "text-gray-400"}>{props.active ? "启用" : "禁用"}</span>
    </label>
  );
}

function VariantInputs(props: Readonly<{
  slotKey: string;
  slot: EditableSlot;
  upstreamModels: readonly UpstreamModel[];
  onChange: SlotPatchHandler;
}>) {
  return (
    <>
      <input className="w-full rounded border px-1 py-0.5 text-xs" type="number" min="0" placeholder="会员价" value={props.slot.member_price_cents || ""} onChange={(event) => props.onChange(props.slotKey, { member_price_cents: Number(event.target.value) || 0 })} />
      <input className="w-full rounded border px-1 py-0.5 text-xs" type="number" min="0" placeholder="匿名价" value={props.slot.anonymous_price_cents || ""} onChange={(event) => props.onChange(props.slotKey, { anonymous_price_cents: Number(event.target.value) || 0 })} />
      <VariantUpstreamSelect {...props} />
    </>
  );
}

function VariantUpstreamSelect(props: Readonly<{
  slotKey: string;
  slot: EditableSlot;
  upstreamModels: readonly UpstreamModel[];
  onChange: SlotPatchHandler;
}>) {
  if (props.upstreamModels.length === 0) {
    return props.slot.upstream_provider_model ? <div className="truncate text-blue-500">→ {props.slot.upstream_provider_model}</div> : null;
  }
  return (
    <select className="w-full rounded border px-1 py-0.5 text-xs" value={props.slot.upstream_provider_model ?? ""} onChange={(event) => props.onChange(props.slotKey, { upstream_provider_model: event.target.value || null })}>
      <option value="">默认模型</option>
      {props.upstreamModels.map((model) => (
        <option key={model.id} value={model.id}>{model.display_name || model.id}</option>
      ))}
    </select>
  );
}

function renderVariantCell(props: Parameters<typeof TierRow>[0], quality: "low" | "medium" | "high") {
  const key = `${props.tier.size}|${quality}`;
  const slot = props.slots[key];
  if (!slot) return <div key={quality} />;
  return <MemoVariantCell key={quality} slotKey={key} slot={slot} upstreamModels={props.upstreamModels} onChange={props.onSlotChange} />;
}

function getFilteredKeys(slots: SlotsState, quality: string, tier: string): string[] {
  return Object.entries(slots)
    .filter(([, slot]) => shouldIncludeSlot(slot, quality, tier))
    .map(([key]) => key);
}

function shouldIncludeSlot(slot: EditableSlot, quality: string, tier: string) {
  if (quality !== "all" && slot.quality !== quality) return false;
  return tier === "all" || getTierForSize(slot.size) === tier;
}

function updatePrice(props: Parameters<typeof PriceActions>[0], field: "member_price_cents" | "anonymous_price_cents") {
  if (props.keysToUpdate.length > 0 && props.price) {
    props.onUpdate(props.keysToUpdate, { [field]: Number(props.price) });
  }
}

function updateStatus(keysToUpdate: string[], onUpdate: BatchPatchHandler) {
  if (keysToUpdate.length > 0) onUpdate(keysToUpdate, { status: "active" });
}

function updateUpstream(props: Parameters<typeof UpstreamAction>[0]) {
  if (props.keysToUpdate.length > 0) {
    props.onUpdate(props.keysToUpdate, { upstream_provider_model: props.upstream || null });
  }
}

function getTierForSize(size: string): string {
  return TIER_MAP[size] ?? "standard";
}

const TIER_MAP: Record<string, string> = {
  "1024x1024": "standard", "1536x1536": "hd", "2048x2048": "2k", "4096x4096": "4k",
  "1152x768": "standard", "1728x1152": "hd", "2304x1536": "2k", "4096x2736": "4k",
  "1280x720": "standard", "1920x1080": "hd", "2560x1440": "2k", "3840x2160": "4k",
  "1344x576": "standard", "2016x864": "hd", "2688x1152": "2k", "3840x1644": "4k",
  "720x1280": "standard", "1080x1920": "hd", "1440x2560": "2k", "2160x3840": "4k",
  "1024x768": "standard", "1600x1200": "hd", "2048x1536": "2k", "4096x3072": "4k",
  "768x1024": "standard", "1200x1600": "hd", "1536x2048": "2k", "3072x4096": "4k",
};
