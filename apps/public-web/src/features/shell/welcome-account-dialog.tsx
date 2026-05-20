"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ErrorMessage } from "@/features/ui/error-message";
import { isUnauthorizedApiError } from "@/lib/api-client";
import { publicApi } from "@/lib/public-api";

const WELCOME_ACCOUNT_GATE_KEY = "commercial-studio:welcome-account-gate-accepted";

type WelcomeAccountDialogProps = Readonly<{
  errorMessage?: string;
  onAnonymousReady?: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}>;

export async function shouldShowWelcomeAccountDialog() {
  if (hasWelcomeAccountGateAccepted()) return false;

  try {
    await publicApi.getCurrentUser();
    markWelcomeAccountGateAccepted();
    return false;
  } catch (error: unknown) {
    if (isUnauthorizedApiError(error)) {
      return true;
    }
    throw error;
  }
}

export function markWelcomeAccountGateAccepted() {
  if (typeof window === "undefined") return;
  localStorage.setItem(WELCOME_ACCOUNT_GATE_KEY, "1");
}

function hasWelcomeAccountGateAccepted() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(WELCOME_ACCOUNT_GATE_KEY) === "1";
}

export function WelcomeAccountDialog(props: WelcomeAccountDialogProps) {
  const [isSubmitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!props.open) {
      setSubmitting(false);
      setErrorMessage("");
      return;
    }
    setErrorMessage(props.errorMessage ?? "");
  }, [props.errorMessage, props.open]);

  if (!props.open) return null;

  async function continueAnonymously() {
    setSubmitting(true);
    setErrorMessage("");
    try {
      await publicApi.ensureAnonymousSession();
      markWelcomeAccountGateAccepted();
      props.onAnonymousReady?.();
      props.onOpenChange(false);
    } catch (error: unknown) {
      setSubmitting(false);
      setErrorMessage(error instanceof Error ? error.message : "匿名会话创建失败");
    }
  }

  return (
    <WelcomeDialogBody
      errorMessage={errorMessage}
      isSubmitting={isSubmitting}
      onAnonymous={continueAnonymously}
      onNavigate={() => props.onOpenChange(false)}
    />
  );
}

function WelcomeDialogBody(props: Readonly<{
  errorMessage: string;
  isSubmitting: boolean;
  onAnonymous: () => void;
  onNavigate: () => void;
}>) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-5 shadow-xl">
        <p className="text-xs font-semibold uppercase text-gray-400">WELCOME</p>
        <h2 className="mt-2 text-xl font-semibold text-gray-900">欢迎使用 Image Studio</h2>
        <p className="mt-2 text-sm leading-6 text-gray-500">
          你可以注册账户同步任务记录，也可以登录已有账户，或先匿名使用网站。
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Link className="primary-button text-center" href="/login?mode=register" onClick={props.onNavigate}>注册</Link>
          <Link className="secondary-button text-center" href="/login" onClick={props.onNavigate}>登录</Link>
          <button className="secondary-button" type="button" onClick={props.onAnonymous} disabled={props.isSubmitting}>
            {props.isSubmitting ? "进入中..." : "匿名使用"}
          </button>
        </div>
        {props.errorMessage ? <div className="mt-3"><ErrorMessage message={props.errorMessage} /></div> : null}
      </div>
    </div>
  );
}
