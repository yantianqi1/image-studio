import { apiDownload, apiFetch, apiUpload, type ApiRequestOptions } from "@/lib/api-client";
import { rememberResolvedClientProviderBaseUrl } from "@/lib/client-provider-config";
import type {
  AnonymousSessionResponse,
  ComicCharacterReference,
  ComicCharacterReferenceImportResponse,
  ComicCharacterReferenceResponse,
  ComicProject,
  ComicTaskCreateRequest,
  ComicTaskImageResult,
  CreateComicProjectRequest,
  DeleteResult,
  ImageAssetVisibility,
  ImageGalleryItem,
  ImageGalleryScope,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageJobResult,
  LoginRequest,
  LoginResponse,
  PublicModelSummary,
  PublicQuotaStatus,
  PublicSiteSettings,
  RedeemCodeRequest,
  TaskItem,
  UploadedImageAsset,
  WalletLedgerItem,
  WalletSummary,
} from "@/lib/public-api.types";

export type * from "@/lib/public-api.types";

export const PUBLIC_QUOTA_REFRESH_EVENT = "commercial-studio:public-quota-refresh";

function notifyPublicQuotaRefresh() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(PUBLIC_QUOTA_REFRESH_EVENT));
}

function rememberImageJobClientProvider(job: ImageGenerationResponse): ImageGenerationResponse {
  rememberResolvedClientProviderBaseUrl(job.client_provider_base_url);
  return job;
}

function rememberImageJobsClientProvider(jobs: readonly ImageGenerationResponse[]) {
  jobs.forEach(rememberImageJobClientProvider);
  return jobs;
}

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
    }).then((task) => {
      notifyPublicQuotaRefresh();
      return task;
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
  downloadComicCharacterReferencePack(taskId: string) {
    return apiDownload(`/comic/tasks/${taskId}/character-references/export`);
  },
  importComicCharacterReferencePack(taskId: string, file: Blob) {
    const formData = new FormData();
    formData.append("file", file);
    return apiUpload<ComicCharacterReferenceImportResponse>(`/comic/tasks/${taskId}/character-references/import`, formData);
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
    }).then((job) => {
      rememberImageJobClientProvider(job);
      notifyPublicQuotaRefresh();
      return job;
    });
  },
  getImageJob(jobId: number, options: Pick<ApiRequestOptions, "signal"> = {}) {
    return apiFetch<ImageGenerationResponse>(`/image/jobs/${jobId}`, options).then(rememberImageJobClientProvider);
  },
  getImageJobResults(jobId: number, options: Pick<ApiRequestOptions, "signal"> = {}) {
    return apiFetch<readonly ImageJobResult[]>(`/image/jobs/${jobId}/results`, options);
  },
  getImageGallery(scope: ImageGalleryScope) {
    return apiFetch<readonly ImageGalleryItem[]>(`/image/gallery?scope=${scope}`);
  },
  updateImageAssetVisibility(assetId: number, visibility: ImageAssetVisibility) {
    return apiFetch<ImageGalleryItem>(`/image/assets/${assetId}/visibility`, {
      method: "PATCH",
      body: { visibility },
    });
  },
  deleteImageJob(jobId: number) {
    return apiFetch<DeleteResult>(`/image/jobs/${jobId}`, { method: "DELETE" });
  },
  deleteImageAsset(assetId: number) {
    return apiFetch<DeleteResult>(`/image/assets/${assetId}`, { method: "DELETE" });
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
  getPublicQuotaStatus() {
    return apiFetch<PublicQuotaStatus>("/quota");
  },
  getImageJobs() {
    return apiFetch<readonly ImageGenerationResponse[]>("/image/jobs").then(rememberImageJobsClientProvider);
  },
  getComicProjects() {
    return apiFetch<readonly ComicProject[]>("/comic/projects");
  },
  getComicTasks() {
    return apiFetch<readonly TaskItem[]>("/comic/tasks");
  },
  getTasks() {
    return apiFetch<readonly ImageGenerationResponse[]>("/image/jobs").then(rememberImageJobsClientProvider);
  },
  getWalletLedger() {
    return apiFetch<readonly WalletLedgerItem[]>("/billing/wallets/me/ledger");
  },
  getWalletSummary() {
    return apiFetch<WalletSummary>("/billing/wallets/me");
  },
  ensureAnonymousSession() {
    return apiFetch<AnonymousSessionResponse>("/auth/anonymous-session", {
      method: "POST",
    });
  },
  getCurrentUser() {
    return apiFetch<LoginResponse>("/auth/me");
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
