import type { FormEvent } from "react";

import type {
  ImageGenerationResponse,
  LoginResponse,
  PublicQuotaStatus,
  WalletLedgerItem,
  WalletSummary,
} from "@/lib/public-api";
import type { ResourceState } from "@/lib/use-api-resource";

export const UNAUTHORIZED_STATUS = 401;
export const RECENT_TASK_LIMIT = 4;
export const MONTH_KEY_LENGTH = 7;
export const EMPTY_WALLET: WalletSummary = {
  balance_cents: 0,
  balance_credits: 0,
  locked_cents: 0,
  locked_credits: 0,
  currency: "CNY",
};
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
  ledgerState: ResourceState<readonly WalletLedgerItem[]>;
  quotaState: ResourceState<PublicQuotaStatus>;
  tasksState: ResourceState<readonly ImageGenerationResponse[]>;
  walletState: ResourceState<WalletSummary>;
}>;
