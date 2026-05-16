export type UpstreamModel = Readonly<{ id: string; display_name: string }>;

export type EditableSlot = Readonly<{
  size: string;
  quality: string;
  upstream_provider_model: string | null;
  member_price_cents: number;
  anonymous_price_cents: number;
  status: string;
  dirty: boolean;
}>;

export type SlotsState = Record<string, EditableSlot>;
