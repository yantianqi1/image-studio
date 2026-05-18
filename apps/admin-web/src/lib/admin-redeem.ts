export type AdminRedeemBatch = Readonly<{
  id: number;
  name: string;
  credit_amount_cents: number;
  credit_amount_credits: number;
  quantity: number;
  codes: readonly string[];
  status: string;
  expires_at: string | null;
  note: string;
  created_at: string;
}>;

export type AdminRedeemBatchSummary = Readonly<{
  id: number;
  name: string;
  credit_amount_cents: number;
  credit_amount_credits: number;
  quantity: number;
  redeemed_quantity: number;
  disabled_quantity: number;
  expired_quantity: number;
  unused_quantity: number;
  status: string;
  expires_at: string | null;
  note: string;
  created_at: string;
}>;

export type AdminRedeemBatchDetail = AdminRedeemBatchSummary;

export type AdminRedeemBatchCode = Readonly<{
  id: number;
  code: string;
  credit_amount_cents: number;
  credit_amount_credits: number;
  status: string;
  redeemed_by_user_id: number | null;
  redeemed_at: string | null;
  expires_at: string | null;
  created_at: string;
}>;

export type AdminRedeemCode = Readonly<{
  id: number;
  code: string;
  credit_amount_cents: number;
  credit_amount_credits: number;
  status: string;
  redeemed_by_user_id: number | null;
  redeemed_at: string | null;
  expires_at: string | null;
  created_at: string;
}>;

export type CreateRedeemBatchInput = Readonly<{
  name: string;
  credit_amount_cents: number;
  quantity: number;
  prefix?: string | null;
  expires_at?: string | null;
  note?: string;
  reason: string;
}>;

export type DisableRedeemBatchInput = Readonly<{
  reason: string;
}>;

export type DisableRedeemCodeInput = DisableRedeemBatchInput;

export function normalizeRedeemBatchExpiresAt(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}
