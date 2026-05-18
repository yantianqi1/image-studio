"use client";

import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { notifyComicOwnerChanged } from "@/features/comic/comic-anonymous-session";
import { publicApi } from "@/lib/public-api";
import type { LoginResponse } from "@/lib/public-api";
import { type ResourceState, useApiResource } from "@/lib/use-api-resource";

import { renderLoginPage } from "./account-login-page";
import { renderAccountShell } from "./account-shell";
import { renderPersonalCenterPage } from "./account-personal-center";
import {
  EMPTY_QUOTA,
  EMPTY_WALLET,
  type AccountLogoutController,
  type AccountLogoutState,
  type AccountResources,
  type AccountSession,
  type AuthController,
  type AuthIntent,
  type AuthMode,
  type AuthState,
} from "./account-types";
import { isUnauthorizedState } from "./account-utils";

export function WalletDashboard() {
  const [refreshKey, setRefreshKey] = useState(0);
  const searchParams = useSearchParams();
  const refreshAccount = () => setRefreshKey((current) => current + 1);
  const userState = useApiResource(() => publicApi.getCurrentUser(), refreshKey);
  const resources = useAccountResources(userState, refreshKey);
  const logout = useAccountLogout({ onLoggedOut: refreshAccount });
  const auth = useAccountAuth({
    initialIntent: searchParams.get("mode") === "register" ? "register" : "login",
    onAuthenticated: refreshAccount,
  });

  if (userState.status === "ready") {
    const session: AccountSession = { user: userState.data };
    return renderAccountShell({
      children: (
        <>
          {logout.errorMessage ? renderLogoutError(logout.errorMessage) : null}
          {renderPersonalCenterPage({ resources, session })}
        </>
      ),
      logout,
      resources: { quotaState: resources.quotaState },
      session,
    });
  }

  if (userState.status === "error" && !isUnauthorizedState(userState)) {
    return renderAccountShell({
      children: renderAccountLoadError(userState),
      session: null,
    });
  }

  return renderAccountShell({
    children: renderLoginPage({ auth, loading: userState.status === "loading" }),
    session: null,
  });
}

function useAccountResources(userState: ResourceState<LoginResponse>, refreshKey: number): AccountResources {
  return {
    ledgerState: useAuthenticatedResource({
      loader: () => publicApi.getWalletLedger(),
      placeholder: [],
      refreshKey,
      userState,
    }),
    quotaState: useAuthenticatedResource({
      loader: () => publicApi.getPublicQuotaStatus(),
      placeholder: EMPTY_QUOTA,
      refreshKey,
      userState,
    }),
    tasksState: useAuthenticatedResource({
      loader: () => publicApi.getTasks(),
      placeholder: [],
      refreshKey,
      userState,
    }),
    walletState: useAuthenticatedResource({
      loader: () => publicApi.getWalletSummary(),
      placeholder: EMPTY_WALLET,
      refreshKey,
      userState,
    }),
  };
}

function useAccountLogout(input: Readonly<{ onLoggedOut: () => void }>): AccountLogoutController {
  const [state, setState] = useState<AccountLogoutState>({ status: "idle" });

  async function handleLogout() {
    if (state.status === "submitting") return;
    setState({ status: "submitting" });

    try {
      await publicApi.logout();
      notifyComicOwnerChanged();
      setState({ status: "idle" });
      input.onLoggedOut();
    } catch (error: unknown) {
      setState({ status: "error", message: error instanceof Error ? error.message : "退出登录失败" });
    }
  }

  return {
    errorMessage: state.status === "error" ? state.message : "",
    isLoggingOut: state.status === "submitting",
    onLogout: handleLogout,
  };
}

function useAuthenticatedResource<T>(input: Readonly<{
  loader: () => Promise<T>;
  placeholder: T;
  refreshKey: number;
  userState: ResourceState<LoginResponse>;
}>): ResourceState<T> {
  const scopedKey = input.userState.status === "ready" ? input.refreshKey : -1;
  const state = useApiResource(
    () => (input.userState.status === "ready" ? input.loader() : Promise.resolve(input.placeholder)),
    scopedKey,
  );

  if (input.userState.status === "ready") {
    return state;
  }
  if (input.userState.status === "loading") {
    return { status: "loading" };
  }
  return { status: "error", message: input.userState.message, statusCode: input.userState.statusCode };
}

function useAccountAuth(input: Readonly<{
  initialIntent: AuthIntent;
  onAuthenticated: () => void;
}>): AuthController {
  const [authMode, setAuthMode] = useState<AuthMode>("password");
  const [intent, setIntent] = useState<AuthIntent>(input.initialIntent);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [state, setState] = useState<AuthState>({ status: "idle" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "submitting" });

    try {
      const result = await submitAuth({ authMode, email, intent, password });
      setState({ status: "success", email: result.email });
      notifyComicOwnerChanged();
      input.onAuthenticated();
    } catch (error: unknown) {
      setState({ status: "error", message: error instanceof Error ? error.message : getAuthErrorMessage(intent) });
    }
  }

  return {
    authMode,
    email,
    intent,
    onAuthModeChange: setAuthMode,
    onEmailChange: setEmail,
    onIntentChange: setIntent,
    onPasswordChange: setPassword,
    onSubmit: handleSubmit,
    onVerificationCodeChange: setVerificationCode,
    password,
    state,
    verificationCode,
  };
}

async function submitAuth(input: Readonly<{ authMode: AuthMode; email: string; intent: AuthIntent; password: string }>) {
  if (input.authMode === "code") {
    throw new Error("验证码登录需要接入真实验证码接口");
  }
  const payload = { email: input.email, password: input.password };
  return input.intent === "register" ? publicApi.register(payload) : publicApi.login(payload);
}

function renderAccountLoadError(state: Extract<ResourceState<LoginResponse>, { status: "error" }>) {
  return (
    <div className="mx-auto max-w-xl rounded-[28px] border border-white/80 bg-white p-6 shadow-sm">
      <p className="text-lg font-bold text-slate-950">账户读取失败</p>
      <p className="mt-2 text-sm text-slate-500">{state.message}</p>
    </div>
  );
}

function renderLogoutError(message: string) {
  return (
    <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
      <p className="font-semibold">退出登录失败</p>
      <p className="mt-1">{message}</p>
    </div>
  );
}

function getAuthErrorMessage(intent: AuthIntent) {
  return intent === "register" ? "注册失败" : "登录失败";
}
