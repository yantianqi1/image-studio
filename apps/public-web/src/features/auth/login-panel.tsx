"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { AppShell } from "@/features/shell/app-shell";
import { notifyComicOwnerChanged } from "@/features/comic/comic-anonymous-session";
import { ErrorMessage } from "@/features/ui/error-message";
import { FormField } from "@/features/ui/form-field";
import { SectionPanel } from "@/features/ui/section-panel";
import { StatusCard } from "@/features/ui/status-card";
import { publicApi } from "@/lib/public-api";

type LoginState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "submitting" }>
  | Readonly<{ status: "error"; message: string }>
  | Readonly<{ status: "success"; email: string }>;

type AuthMode = "login" | "register";

export function LoginPanel() {
  const searchParams = useSearchParams();
  const initialMode = searchParams.get("mode") === "register" ? "register" : "login";
  const [authMode, setAuthMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<LoginState>({ status: "idle" });
  const isRegisterMode = authMode === "register";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "submitting" });

    try {
      const result = await submitAuth({ authMode, email, password });
      notifyComicOwnerChanged();
      setState({
        status: "success",
        email: result.email,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : getAuthErrorMessage(authMode);
      setState({ status: "error", message });
    }
  }

  return (
    <AppShell activeHref="/wallet" title={isRegisterMode ? "注册账户" : "登录"}>
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="grid gap-4 content-start">
          <SectionPanel title={isRegisterMode ? "注册账户" : "登录账户"}>
            <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1">
              <button
                className={authMode === "login" ? "primary-button" : "secondary-button"}
                type="button"
                onClick={() => setAuthMode("login")}
              >
                登录
              </button>
              <button
                className={authMode === "register" ? "primary-button" : "secondary-button"}
                type="button"
                onClick={() => setAuthMode("register")}
              >
                注册
              </button>
            </div>
            <form className="grid gap-3" onSubmit={handleSubmit}>
              <FormField
                label="邮箱"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@company.com"
                required
              />
              <FormField
                label="密码"
                type="password"
                autoComplete={isRegisterMode ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="输入登录密码"
                required
              />
              <button
                className="primary-button"
                type="submit"
                disabled={state.status === "submitting"}
              >
                {getSubmitButtonLabel({ authMode, state })}
              </button>
            </form>
          </SectionPanel>
        </div>

        <div className="grid gap-4 content-start">
          <SectionPanel title="状态">
            <div className="grid gap-2">
              {state.status === "idle" ? (
                <StatusCard title="待提交" description={isRegisterMode ? "请输入邮箱和密码后注册" : "请输入账号密码后点击登录"} />
              ) : null}
              {state.status === "submitting" ? (
                <StatusCard
                  title="验证中"
                  description={isRegisterMode ? "正在创建账户..." : "正在验证登录信息..."}
                  tone="loading"
                />
              ) : null}
              {state.status === "error" ? (
                <ErrorMessage message={state.message} />
              ) : null}
              {state.status === "success" ? (
                <div className="list-card border-emerald-200 bg-emerald-50/50">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
                    {isRegisterMode ? "注册成功" : "登录成功"}
                  </p>
                  <p className="text-sm font-medium mt-1">欢迎，{state.email}</p>
                </div>
              ) : null}
            </div>
          </SectionPanel>
        </div>
      </div>
    </AppShell>
  );
}

async function submitAuth(input: Readonly<{ authMode: AuthMode; email: string; password: string }>) {
  if (input.authMode === "register") {
    return publicApi.register({ email: input.email, password: input.password });
  }
  return publicApi.login({ email: input.email, password: input.password });
}

function getAuthErrorMessage(authMode: AuthMode) {
  return authMode === "register" ? "注册失败" : "登录失败";
}

function getSubmitButtonLabel(input: Readonly<{ authMode: AuthMode; state: LoginState }>) {
  if (input.state.status === "submitting") {
    return input.authMode === "register" ? "注册中..." : "登录中...";
  }
  return input.authMode === "register" ? "注册账户" : "登录";
}
