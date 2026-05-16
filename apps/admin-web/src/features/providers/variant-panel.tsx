"use client";

import { useCallback, useReducer, useState } from "react";

import { BatchToolbar } from "@/features/providers/variant-matrix-batch-toolbar";
import { MemoAspectRatioGroup } from "@/features/providers/variant-matrix-editor";
import { adminApi, type BatchVariantInput, type VariantMatrix } from "@/lib/admin-api";

import type { EditableSlot, SlotsState, UpstreamModel } from "./variant-editor-types";

type SellableModel = Awaited<ReturnType<typeof adminApi.models>>[number];
type Provider = Awaited<ReturnType<typeof adminApi.providers>>[number];
const DEFAULT_PROFIT_MARGIN_BASIS_POINTS = 3000;

type SlotsAction =
  | { type: "load"; slots: SlotsState }
  | { type: "update"; key: string; patch: Partial<EditableSlot> }
  | { type: "batch_update"; keys: string[]; patch: Partial<EditableSlot> };

type VariantPanelProps = Readonly<{
  model: SellableModel;
  providers: readonly Provider[];
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
}>;

function slotsReducer(state: SlotsState, action: SlotsAction): SlotsState {
  switch (action.type) {
    case "load":
      return action.slots;
    case "update": {
      const existing = state[action.key];
      if (!existing) return state;
      return { ...state, [action.key]: { ...existing, ...action.patch, dirty: true } };
    }
    case "batch_update": {
      const next = { ...state };
      for (const key of action.keys) {
        const existing = next[key];
        if (existing) next[key] = { ...existing, ...action.patch, dirty: true };
      }
      return next;
    }
  }
}

export function VariantPanel({ model, providers, onMessage, onError }: VariantPanelProps) {
  const [open, setOpen] = useState(false);
  const [matrix, setMatrix] = useState<VariantMatrix | null>(null);
  const [slots, dispatch] = useReducer(slotsReducer, {});
  const [upstreamModels, setUpstreamModels] = useState<readonly UpstreamModel[]>([]);
  const [saving, setSaving] = useState(false);
  const provider = providers.find((p) => p.id === model.provider_id);

  async function openMatrix() {
    setOpen(true);
    await Promise.all([
      loadMatrixState({ dispatch, modelId: model.id, onError, setMatrix }),
      loadUpstreamState({ onError, provider, setUpstreamModels }),
    ]);
  }

  const handleSlotChange = useCallback((key: string, patch: Partial<EditableSlot>) => {
    dispatch({ type: "update", key, patch });
  }, []);

  const handleBatchUpdate = useCallback((keys: string[], patch: Partial<EditableSlot>) => {
    dispatch({ type: "batch_update", keys, patch });
  }, []);

  async function saveAll() {
    await saveDirtyVariants({
      modelId: model.id,
      onError,
      onMessage,
      reload: () => loadMatrixState({ dispatch, modelId: model.id, onError, setMatrix }),
      setSaving,
      slots,
    });
  }

  const dirtyCount = Object.values(slots).filter((s) => s.dirty).length;

  return (
    <div className="mt-2">
      <button
        type="button"
        className="text-xs text-blue-600 hover:underline"
        onClick={() => { if (open) setOpen(false); else void openMatrix(); }}
      >
        {open ? "收起定价矩阵" : "管理定价矩阵"}
      </button>

      {open && matrix ? (
        <VariantMatrixBody
          dirtyCount={dirtyCount}
          matrix={matrix}
          onBatchUpdate={handleBatchUpdate}
          onSave={saveAll}
          onSlotChange={handleSlotChange}
          saving={saving}
          slots={slots}
          upstreamModels={upstreamModels}
        />
      ) : null}
    </div>
  );
}

async function loadMatrixState(props: Readonly<{
  dispatch: (action: SlotsAction) => void;
  modelId: number;
  onError: (msg: string) => void;
  setMatrix: (matrix: VariantMatrix) => void;
}>) {
  try {
    const data = await adminApi.variantMatrix(props.modelId);
    props.setMatrix(data);
    props.dispatch({ type: "load", slots: buildSlots(data) });
  } catch (error) {
    props.onError(error instanceof Error ? error.message : "加载矩阵失败");
  }
}

async function loadUpstreamState(props: Readonly<{
  onError: (msg: string) => void;
  provider: Provider | undefined;
  setUpstreamModels: (models: readonly UpstreamModel[]) => void;
}>) {
  if (!props.provider?.base_url) return;
  try {
    const models = await adminApi.fetchUpstreamModels({
      url: props.provider.base_url,
      api_key_env: props.provider.api_key_env ?? undefined,
    });
    props.setUpstreamModels(models);
  } catch (error) {
    props.onError(error instanceof Error ? error.message : "加载上游模型失败");
  }
}

function buildSlots(matrix: VariantMatrix): SlotsState {
  const slots: SlotsState = {};
  for (const group of matrix.groups) {
    for (const tier of group.tiers) {
      for (const variant of tier.variants) {
        slots[`${tier.size}|${variant.quality}`] = buildSlot(tier.size, variant);
      }
    }
  }
  return slots;
}

function buildSlot(size: string, variant: VariantMatrix["groups"][number]["tiers"][number]["variants"][number]): EditableSlot {
  return {
    size,
    quality: variant.quality,
    upstream_provider_model: variant.upstream_provider_model,
    upstream_cost_credits: variant.upstream_cost_credits,
    upstream_cost_cents: variant.upstream_cost_cents,
    profit_margin_basis_points: variant.profit_margin_basis_points ?? DEFAULT_PROFIT_MARGIN_BASIS_POINTS,
    member_price_cents: variant.member_price_cents ?? 0,
    member_price_credits: variant.member_price_credits,
    anonymous_price_cents: variant.anonymous_price_cents ?? 0,
    status: variant.status ?? "disabled",
    dirty: false,
  };
}

async function saveDirtyVariants(props: Readonly<{
  modelId: number;
  onError: (msg: string) => void;
  onMessage: (msg: string) => void;
  reload: () => Promise<void>;
  setSaving: (saving: boolean) => void;
  slots: SlotsState;
}>) {
  const dirtySlots = Object.values(props.slots).filter((slot) => slot.dirty);
  if (dirtySlots.length === 0) {
    props.onMessage("没有修改");
    return;
  }
  props.setSaving(true);
  try {
    const variants = dirtySlots.map(buildVariantInput);
    await adminApi.batchUpsertVariants(props.modelId, { variants });
    props.onMessage(`已保存 ${variants.length} 个变体`);
    await props.reload();
  } catch (error) {
    props.onError(error instanceof Error ? error.message : "保存失败");
  } finally {
    props.setSaving(false);
  }
}

function buildVariantInput(slot: EditableSlot): BatchVariantInput {
  return {
    size: slot.size,
    quality: slot.quality,
    upstream_provider_model: slot.upstream_provider_model || undefined,
    upstream_cost_credits: slot.upstream_cost_credits,
    upstream_cost_cents: slot.upstream_cost_cents,
    profit_margin_basis_points: slot.profit_margin_basis_points,
    member_price_cents: slot.member_price_cents,
    anonymous_price_cents: slot.anonymous_price_cents,
    status: slot.status,
  };
}

function VariantMatrixBody(props: Readonly<{
  dirtyCount: number;
  matrix: VariantMatrix;
  onBatchUpdate: (keys: string[], patch: Partial<EditableSlot>) => void;
  onSave: () => void;
  onSlotChange: (key: string, patch: Partial<EditableSlot>) => void;
  saving: boolean;
  slots: SlotsState;
  upstreamModels: readonly UpstreamModel[];
}>) {
  return (
    <div className="mt-2 grid gap-3">
      <BatchToolbar slots={props.slots} upstreamModels={props.upstreamModels} onUpdate={props.onBatchUpdate} />
      {props.matrix.groups.map((group, index) => (
        <MemoAspectRatioGroup
          key={group.aspect_ratio}
          group={group}
          slots={props.slots}
          upstreamModels={props.upstreamModels}
          onSlotChange={props.onSlotChange}
          defaultCollapsed={index > 0}
        />
      ))}
      <button type="button" className="admin-button" disabled={props.saving || props.dirtyCount === 0} onClick={props.onSave}>
        {props.saving ? "保存中..." : `保存全部${props.dirtyCount > 0 ? ` (${props.dirtyCount} 项修改)` : ""}`}
      </button>
    </div>
  );
}
