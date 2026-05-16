"use client";

import { useState } from "react";

import { Panel } from "@/features/ui/panel";

import type { EditableSlot, SlotsState, UpstreamModel } from "./variant-editor-types";

type BatchPatchHandler = (keys: string[], patch: Partial<EditableSlot>) => void;

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
