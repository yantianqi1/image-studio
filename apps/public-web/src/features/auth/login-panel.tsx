"use client";

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

export function LoginPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<LoginState>({ status: "idle" });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "submitting" });

    try {
      const result = await publicApi.login({ email, password });
      notifyComicOwnerChanged();
      setState({
        status: "success",
        email: result.email,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "登录失败";
      setState({ status: "error", message });
    }
  }

  return (
    <AppShell activeHref="/login" title="登录">
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="grid gap-4 content-start">
          <SectionPanel title="登录账户">
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
                autoComplete="current-password"
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
                {state.status === "submitting" ? "登录中..." : "登录"}
              </button>
            </form>
          </SectionPanel>
        </div>

        <div className="grid gap-4 content-start">
          <SectionPanel title="状态">
            <div className="grid gap-2">
              {state.status === "idle" ? (
                <StatusCard title="待提交" description="请输入账号密码后点击登录" />
              ) : null}
              {state.status === "submitting" ? (
                <StatusCard
                  title="验证中"
                  description="正在验证登录信息..."
                  tone="loading"
                />
              ) : null}
              {state.status === "error" ? (
                <ErrorMessage message={state.message} />
              ) : null}
              {state.status === "success" ? (
                <div className="list-card border-emerald-200 bg-emerald-50/50">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">登录成功</p>
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
