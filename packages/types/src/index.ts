export type ApiErrorCode =
  | "INTERNAL_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "NOT_FOUND";

export interface ApiError {
  code: ApiErrorCode | string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  data: T | null;
  meta: Record<string, unknown>;
  error: ApiError | null;
}

export interface HealthPayload {
  status: "ok";
  service: "api";
  version: string;
  environment: string;
}

export interface RuntimePort {
  name: string;
  port: number;
}

export type UserStatus = "active" | "disabled";
export type TaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type ImageJobMode = "generate" | "edit";
export type ImageJobSource = "anonymous" | "member" | "admin" | "client_provider";
export type ModelCapability = "text" | "image" | "chat";

export interface PublicUser {
  id: number;
  username: string;
  displayName: string;
  status: UserStatus;
}

export interface AuthSession {
  user: PublicUser;
}

export interface SellableModel {
  id: number;
  code: string;
  displayName: string;
  capability: ModelCapability;
  providerId: number;
  providerModel: string;
  publicEnabled: boolean;
}

export interface ImageJob {
  id: number;
  userId: number | null;
  source: ImageJobSource;
  mode: ImageJobMode;
  prompt: string;
  modelCode: string;
  providerId: number | null;
  providerModel: string | null;
  clientProviderBaseUrl?: string | null;
  status: TaskStatus;
  requestedCount: number;
  attemptCount: number;
  maxAttempts: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  availableAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ImageJobResult {
  id: number;
  jobId: number;
  resultIndex: number;
  assetId: number;
  assetUrl: string;
  revisedPrompt: string | null;
  providerRequestId: string | null;
}

export interface ComicProject {
  id: number;
  userId: number;
  title: string;
  sourceText: string;
  stylePrompt: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComicCharacter {
  id: number;
  projectId: number;
  name: string;
  description: string;
  appearance: string;
  personality: string;
}

export interface ComicChapter {
  id: number;
  projectId: number;
  title: string;
  sourceText: string;
  summary: string;
  sortOrder: number;
}

export interface ComicScene {
  id: number;
  projectId: number;
  chapterId: number;
  title: string;
  description: string;
  prompt: string;
  sortOrder: number;
  status: string;
}

export interface ComicTask {
  id: number;
  userId: number;
  projectId: number;
  kind: string;
  targetType: string;
  targetId: number;
  status: TaskStatus;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}
