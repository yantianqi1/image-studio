export type AdminImageJobResult = Readonly<{
  id: number;
  job_id: number;
  result_index: number;
  asset_id: number;
  asset_url: string;
  thumbnail_url: string;
  revised_prompt: string | null;
  provider_request_id: string | null;
}>;

export type AdminImageJob = Readonly<{
  id: number;
  user_id: number | null;
  source: string;
  mode: string;
  prompt: string;
  model_code: string;
  provider_model: string | null;
  size: string | null;
  quality: string | null;
  visibility: string;
  status: string;
  requested_count: number;
  attempt_count: number;
  max_attempts: number;
  provider_input_tokens: number | null;
  provider_output_tokens: number | null;
  provider_total_tokens: number | null;
  raw_provider_cost_cents: number | null;
  provider_fee_cents: number | null;
  internal_cost_cents: number | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  results: readonly AdminImageJobResult[];
}>;

export type ImageJobStats = Readonly<{
  overview: {
    total: number;
    succeeded: number;
    failed: number;
    success_rate: number;
  };
  costs: {
    total_cents: number;
    today_cents: number;
    week_cents: number;
  };
  performance: {
    avg_duration_seconds: number | null;
  };
  distribution: {
    model: readonly DistributionItem[];
    source: readonly DistributionItem[];
    size: readonly DistributionItem[];
    quality: readonly DistributionItem[];
  };
  channel_costs: readonly ChannelCostItem[];
  daily_trend: readonly DailyTrendItem[];
}>;

export type DistributionItem = Readonly<{ key: string; count: number }>;
export type ChannelCostItem = Readonly<{
  key: string;
  count: number;
  raw_provider_cost_cents: number;
  provider_fee_cents: number;
  internal_cost_cents: number;
}>;
export type DailyTrendItem = Readonly<{ date: string; count: number; internal_cost_cents: number; succeeded: number }>;
