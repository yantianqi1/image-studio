export type LoginRequest = Readonly<{
  email: string;
  password: string;
}>;

export type LoginResponse = Readonly<{
  id: number;
  email: string;
  display_name: string;
  status: string;
}>;

export type AnonymousSessionResponse = Readonly<{
  anonymous_session_id: number;
}>;

export type ImageGenerationRequest = Readonly<{
  prompt: string;
  model_code: string;
  requested_count: number;
  mode?: "generate" | "edit";
  source_asset_id?: number;
  reference_asset_ids?: readonly number[];
  visibility?: ImageAssetVisibility;
}>;

export type ImageAssetVisibility = "private" | "public";
export type ImageGalleryScope = "mine" | "public";

export type ImageGenerationResponse = Readonly<{
  id: number;
  status: string;
  prompt: string;
  model_code: string;
  visibility?: ImageAssetVisibility;
  charge_cents: number;
  error_message?: string | null;
  source_asset_id?: number | null;
  created_at?: string;
}>;

export type UploadedImageAsset = Readonly<{
  id: number;
  asset_url: string;
  thumbnail_url?: string;
  mime_type: string;
  created_at: string;
}>;

export type ImageJobResult = Readonly<{
  id: number;
  job_id: number;
  result_index: number;
  asset_id: number;
  asset_url: string;
  thumbnail_url?: string;
  visibility?: ImageAssetVisibility;
  published_at?: string | null;
  created_at?: string;
  revised_prompt: string;
  provider_request_id: string | null;
}>;

export type ImageGalleryItem = Readonly<{
  asset_id: number;
  asset_url: string;
  thumbnail_url: string;
  visibility: ImageAssetVisibility;
  published_at: string | null;
  created_at: string;
  job_id: number;
  result_index: number;
  prompt: string;
  revised_prompt: string | null;
}>;

export type PublicModelSummary = Readonly<{
  id: number;
  code: string;
  display_name: string;
  capability: string;
  member_price_cents: number;
  anonymous_price_cents: number;
}>;

export type PublicSiteSettings = Readonly<{
  site_title: string;
  allow_public_signup: boolean;
  allow_anonymous_image: boolean;
  uploads_enabled: boolean;
  public_quota_mode: "daily_global" | "per_ip";
  public_quota_daily_global_limit: number;
  public_quota_per_ip_limit: number;
  updated_at: string;
}>;

export type PublicQuotaStatus = Readonly<{
  mode: "daily_global" | "per_ip";
  limit_count: number;
  used_count: number;
  remaining_count: number;
  exhausted: boolean;
}>;

export type WalletSummary = Readonly<{
  balance_cents: number;
  locked_cents: number;
  currency: string;
}>;

export type WalletLedgerItem = Readonly<{
  id: number;
  amount_cents: number;
  reason: string;
  created_at: string;
}>;

export type RedeemCodeRequest = Readonly<{
  code: string;
}>;

export type ComicProject = Readonly<{
  id: string;
  title: string;
  description?: string;
  genre?: string;
  status: string;
  updated_at: string;
}>;

export type CreateComicProjectRequest = Readonly<{
  title: string;
  sourceText: string;
  stylePrompt: string;
}>;

export type TaskItem = Readonly<{
  id: string | number;
  project_id?: string;
  type?: string;
  task_type?: string;
  status: string;
  stage?: string | null;
  progress_percent?: number;
  title?: string;
  output_payload?: unknown;
  error_message?: string | null;
  created_at?: string;
}>;

export type ComicTaskCreateRequest = Readonly<{
  project_id: string;
  task_type: string;
  input_payload: Record<string, unknown>;
}>;

export type ComicCharacterReference = Readonly<{
  id: number;
  character_code: string;
  name: string;
  reference_image_job_id: number | null;
  reference_asset_id: number | null;
  image_status: string | null;
  error_message: string | null;
}>;

export type ComicCharacterReferenceResponse = Readonly<{
  character_count: number;
  created_count: number;
  reused_count: number;
  ready: boolean;
  characters: readonly ComicCharacterReference[];
}>;

export type ComicCharacterReferenceImportResponse = Readonly<{
  character_count: number;
  imported_count: number;
  ready: boolean;
  characters: readonly ComicCharacterReference[];
}>;

export type ComicTaskImageResult = Readonly<{
  id: number;
  task_id: string;
  image_index: number;
  image_job_id: number | null;
  asset_id: number | null;
  prompt: string;
  image_status: string | null;
  error_message: string | null;
  result: ImageJobResult | null;
}>;

export type DeleteResult = Readonly<{
  deleted: boolean;
  id: string;
}>;
