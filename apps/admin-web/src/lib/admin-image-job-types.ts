export type AdminImageJobResult = Readonly<{
  id: number;
  job_id: number;
  result_index: number;
  asset_id: number;
  asset_url: string;
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
  status: string;
  requested_count: number;
  attempt_count: number;
  max_attempts: number;
  charge_cents: number;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  finished_at: string | null;
  results: readonly AdminImageJobResult[];
}>;
