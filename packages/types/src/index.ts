export type ApiErrorCode =
  | "INTERNAL_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "BALANCE_NOT_ENOUGH";

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

