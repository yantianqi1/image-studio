"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ErrorMessage } from "@/features/ui/error-message";
import { isUnauthorizedApiError } from "@/lib/api-client";
import { publicApi } from "@/lib/public-api";

const WELCOME_DISMISSED_KEY = "commercial-studio:welcome-account-dismissed";

export function WelcomeAccountDialog() {
  const [state, setState] = useState<"checking" | "open" | "closed" | "submitting">("checking");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (localStorage.getItem(WELCOME_DISMISSED_KEY) === "1") {
      setState("closed");
      return;
    }
    publicApi.getCurrentUser()
      .then(() => dismiss())
      .catch((error: unknown) => {
        if (isUnauthorizedApiError(error)) {
          setState("open");
          return;
        }
        setState("open");
        setErrorMessage(error instanceof Error ? error.message : "账户状态读取失败");
      });
  }, []);

  if (state === "checking" || state === "closed") {
    return null;
  }

  async function continueAnonymously() {
    setState("submitting");
    setErrorMessage("");
    try {
      await publicApi.ensureAnonymousSession();
      dismiss();
    } catch (error: unknown) {
      setState("open");
      setErrorMessage(error instanceof Error ? error.message : "匿名会话创建失败");
    }
  }

  function dismiss() {
    localStorage.setItem(WELCOME_DISMISSED_KEY, "1");
    setState("closed");
  }

  return (
    <WelcomeDialogBody
      errorMessage={errorMessage}
      isSubmitting={state === "submitting"}
      onAnonymous={continueAnonymously}
      onDismiss={dismiss}
    />
  );
}

function WelcomeDialogBody(props: Readonly<{
  errorMessage: string;
  isSubmitting: boolean;
  onAnonymous: () => void;
  onDismiss: () => void;
}>) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-5 shadow-xl">
        <p className="text-xs font-semibold uppercase text-gray-400">WELCOME</p>
        <h2 className="mt-2 text-xl font-semibold text-gray-900">欢迎使用 Image Studio</h2>
        <p className="mt-2 text-sm leading-6 text-gray-500">
          你可以注册账户同步额度和任务记录，也可以登录已有账户，或先匿名使用网站。
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Link className="primary-button text-center" href="/login?mode=register" onClick={props.onDismiss}>注册</Link>
          <Link className="secondary-button text-center" href="/login" onClick={props.onDismiss}>登录</Link>
          <button className="secondary-button" type="button" onClick={props.onAnonymous} disabled={props.isSubmitting}>
            {props.isSubmitting ? "进入中..." : "匿名使用"}
          </button>
        </div>
        {props.errorMessage ? <div className="mt-3"><ErrorMessage message={props.errorMessage} /></div> : null}
      </div>
    </div>
  );
}
