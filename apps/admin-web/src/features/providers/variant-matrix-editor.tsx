"use client";

import { memo, useState } from "react";

import type { VariantMatrixGroup } from "@/lib/admin-api";

import type { EditableSlot, SlotsState, UpstreamModel } from "./variant-editor-types";

type SlotPatchHandler = (key: string, patch: Partial<EditableSlot>) => void;

const TIER_LABELS: Record<string, string> = {
  standard: "标准",
  hd: "高清",
  "2k": "2K",
  "4k": "4K",
};

export const MemoAspectRatioGroup = memo(AspectRatioGroup);

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
      <input
        className="w-full rounded border px-1 py-0.5 text-xs"
        type="number"
        min="0"
        placeholder="成本（分）"
        value={props.slot.upstream_cost_cents ?? ""}
        onChange={(event) => props.onChange(props.slotKey, { upstream_cost_cents: parseOptionalNumber(event.target.value) })}
      />
      <input
        className="w-full rounded border px-1 py-0.5 text-xs"
        type="number"
        min="0"
        placeholder="利润率 bps"
        value={props.slot.profit_margin_basis_points}
        onChange={(event) => props.onChange(props.slotKey, { profit_margin_basis_points: Number(event.target.value) || 0 })}
      />
      <input className="w-full rounded border px-1 py-0.5 text-xs" type="number" min="0" placeholder="会员价" value={props.slot.member_price_cents || ""} onChange={(event) => props.onChange(props.slotKey, { member_price_cents: Number(event.target.value) || 0 })} />
      <input className="w-full rounded border px-1 py-0.5 text-xs" type="number" min="0" placeholder="匿名价" value={props.slot.anonymous_price_cents || ""} onChange={(event) => props.onChange(props.slotKey, { anonymous_price_cents: Number(event.target.value) || 0 })} />
      <div className="truncate text-[11px] text-gray-400">
        会员额度 {props.slot.member_price_credits ?? "保存后计算"}
      </div>
      <VariantUpstreamSelect {...props} />
    </>
  );
}

function parseOptionalNumber(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
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
