import { apiFetch, apiUpload } from "@/lib/api-client";

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

export type ImageGenerationRequest = Readonly<{
  prompt: string;
  model_code: string;
  requested_count: number;
  mode?: "generate" | "edit";
  source_asset_id?: number;
}>;

export type ImageGenerationResponse = Readonly<{
  id: number;
  status: string;
  prompt: string;
  model_code: string;
  charge_cents: number;
  error_message?: string | null;
  source_asset_id?: number | null;
  created_at?: string;
}>;

export type UploadedImageAsset = Readonly<{
  id: number;
  asset_url: string;
  mime_type: string;
  created_at: string;
}>;

export type ImageJobResult = Readonly<{
  id: number;
  job_id: number;
  result_index: number;
  asset_id: number;
  asset_url: string;
  revised_prompt: string;
  provider_request_id: string | null;
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
  updated_at: string;
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

export const publicApi = {
  createComicProject(input: CreateComicProjectRequest) {
    return apiFetch<ComicProject>("/comic/projects", {
      method: "POST",
      body: { title: input.title, description: input.sourceText, genre: input.stylePrompt },
    });
  },
  createComicTask(input: ComicTaskCreateRequest) {
    return apiFetch<TaskItem>("/comic/tasks", {
      method: "POST",
      body: input,
    });
  },
  getComicTask(taskId: string) {
    return apiFetch<TaskItem>(`/comic/tasks/${taskId}`);
  },
  approveComicCharacterReferences(taskId: string) {
    return apiFetch<ComicCharacterReferenceResponse>(`/comic/tasks/${taskId}/character-references`, { method: "POST" });
  },
  getComicCharacterReferences(taskId: string) {
    return apiFetch<readonly ComicCharacterReference[]>(`/comic/tasks/${taskId}/character-references`);
  },
  syncComicCharacterReferences(taskId: string) {
    return apiFetch<ComicCharacterReferenceResponse>(`/comic/tasks/${taskId}/character-references/sync`, { method: "POST" });
  },
  approveComicTaskImageGeneration(taskId: string) {
    return apiFetch<{ created_count: number; reused_count: number; prompts: readonly ComicTaskImageResult[] }>(`/comic/tasks/${taskId}/approve-and-generate-images`, { method: "POST" });
  },
  getComicTaskImageResults(taskId: string) {
    return apiFetch<readonly ComicTaskImageResult[]>(`/comic/tasks/${taskId}/image-results`);
  },
  generateImage(input: ImageGenerationRequest) {
    return apiFetch<ImageGenerationResponse>("/image/jobs", {
      method: "POST",
      body: input,
    });
  },
  getImageJob(jobId: number) {
    return apiFetch<ImageGenerationResponse>(`/image/jobs/${jobId}`);
  },
  getImageJobResults(jobId: number) {
    return apiFetch<readonly ImageJobResult[]>(`/image/jobs/${jobId}/results`);
  },
  deleteImageJob(jobId: number) {
    return apiFetch<DeleteResult>(`/image/jobs/${jobId}`, { method: "DELETE" });
  },
  uploadImageAsset(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    return apiUpload<UploadedImageAsset>("/image/uploads", formData);
  },
  getModels() {
    return apiFetch<readonly PublicModelSummary[]>("/models");
  },
  getSiteSettings() {
    return apiFetch<PublicSiteSettings>("/settings");
  },
  getImageJobs() {
    return apiFetch<readonly ImageGenerationResponse[]>("/image/jobs");
  },
  getComicProjects() {
    return apiFetch<readonly ComicProject[]>("/comic/projects");
  },
  getComicTasks() {
    return apiFetch<readonly TaskItem[]>("/comic/tasks");
  },
  getTasks() {
    return apiFetch<readonly ImageGenerationResponse[]>("/image/jobs");
  },
  getWalletLedger() {
    return apiFetch<readonly WalletLedgerItem[]>("/billing/wallets/me/ledger");
  },
  getWalletSummary() {
    return apiFetch<WalletSummary>("/billing/wallets/me");
  },
  login(input: LoginRequest) {
    return apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      body: input,
    });
  },
  register(input: LoginRequest) {
    return apiFetch<LoginResponse>("/auth/register", {
      method: "POST",
      body: input,
    });
  },
  redeemCode(input: RedeemCodeRequest) {
    return apiFetch<WalletSummary>("/redeem/redeem", {
      method: "POST",
      body: input,
    });
  },
} as const;

export type PublicApiClient = typeof publicApi;
