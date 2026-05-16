export type UpstreamModel = Readonly<{ id: string; display_name: string }>;

export type EditableSlot = Readonly<{
  size: string;
  quality: string;
  upstream_provider_model: string | null;
  upstream_cost_credits: number | null;
  upstream_cost_cents: number | null;
  profit_margin_basis_points: number;
  member_price_cents: number;
  member_price_credits: number | null;
  anonymous_price_cents: number;
  status: string;
  dirty: boolean;
}>;

export type SlotsState = Record<string, EditableSlot>;
