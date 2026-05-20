import type { FormEvent } from "react";

import type {
  ImageGenerationResponse,
  LoginResponse,
  PublicQuotaStatus,
} from "@/lib/public-api";
import type { ResourceState } from "@/lib/use-api-resource";

export const UNAUTHORIZED_STATUS = 401;
export const RECENT_TASK_LIMIT = 4;
export const MONTH_KEY_LENGTH = 7;
export const EMPTY_QUOTA: PublicQuotaStatus = {
  exhausted: false,
  limit_count: 0,
  mode: "daily_global",
  remaining_count: 0,
  used_count: 0,
};

export type AuthMode = "password" | "code";
export type AuthIntent = "login" | "register";
export type AccountSession = Readonly<{ user: LoginResponse }>;
export type AccountLogoutState = Readonly<
  | { status: "idle" }
  | { status: "submitting" }
  | { message: string; status: "error" }
>;

export type AuthState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "submitting" }>
  | Readonly<{ status: "error"; message: string }>
  | Readonly<{ status: "success"; email: string }>;

export type AuthController = Readonly<{
  authMode: AuthMode;
  email: string;
  intent: AuthIntent;
  password: string;
  state: AuthState;
  verificationCode: string;
  onAuthModeChange: (mode: AuthMode) => void;
  onEmailChange: (value: string) => void;
  onIntentChange: (intent: AuthIntent) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onVerificationCodeChange: (value: string) => void;
}>;

export type AccountResources = Readonly<{
  quotaState: ResourceState<PublicQuotaStatus>;
  tasksState: ResourceState<readonly ImageGenerationResponse[]>;
}>;

export type AccountLogoutController = Readonly<{
  isLoggingOut: boolean;
  onLogout: () => void;
  errorMessage: string;
}>;
