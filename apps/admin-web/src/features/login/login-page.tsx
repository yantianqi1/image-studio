"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ErrorBox } from "@/features/ui/error-box";
import { Panel } from "@/features/ui/panel";
import { BrandMark } from "@/features/shell/brand-mark";
import { adminApi } from "@/lib/admin-api";

export function LoginPage({ redirectTo = "/admin" }: { redirectTo?: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#f8f5ef,_#efe6d9_40%,_#e2d3bf_100%)] px-4 py-10 text-gray-900">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center lg:grid-cols-[1.1fr_0.9fr] gap-8">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[0.875rem] border border-black/10 bg-white/85 shadow-sm">
              <BrandMark />
            </span>
            <p className="text-xs font-semibold uppercase text-amber-800/70">Admin Web</p>
          </div>
          <h1 className="text-4xl font-semibold lg:text-6xl">后台登录</h1>
          <p className="max-w-xl text-sm leading-6 text-gray-700/90">
            管理员登录采用独立 cookie，与用户端登录态完全分离。登录后进入受保护的后台控制台。
          </p>
        </div>

        <Panel title="登录" description="提交后会请求 /api/admin/auth/login">
          <form
            className="grid gap-3"
            action={async (formData) => {
              try {
                setError("");
                setMessage("");
                const result = await adminApi.login({
                  username: String(formData.get("username") ?? ""),
                  password: String(formData.get("password") ?? ""),
                });
                setMessage(`登录成功：${result.username}`);
                router.replace(redirectTo);
                router.refresh();
              } catch (nextError) {
                setError(nextError instanceof Error ? nextError.message : "登录失败");
              }
            }}
          >
            <input className="admin-input" name="username" placeholder="管理员用户名" />
            <input className="admin-input" name="password" placeholder="管理员密码" type="password" />
            <button className="admin-button" type="submit">
              登录
            </button>
          </form>
          <div className="mt-3 grid gap-3">
            {message ? <div className="admin-card text-emerald-700">{message}</div> : null}
            {error ? <ErrorBox message={error} /> : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}
