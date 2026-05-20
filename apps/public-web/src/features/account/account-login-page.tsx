import Link from "next/link";

import { ErrorMessage } from "@/features/ui/error-message";

import type { AuthController } from "./account-types";

const LOGIN_FEATURES = ["同步创作记录", "管理账户资料", "继续未完成任务"] as const;

export function renderLoginPage(props: Readonly<{
  auth: AuthController;
  loading: boolean;
}>) {
  const title = props.auth.intent === "register" ? "注册 Image Studio" : "登录 Image Studio";

  return (
    <div className="grid min-h-[calc(100dvh-88px)] items-start gap-4 lg:min-h-[calc(100vh-136px)] lg:grid-cols-[1fr_440px] lg:items-center lg:gap-8">
      <section className="relative hidden overflow-hidden rounded-[24px] border border-white/80 bg-white/70 p-8 shadow-[0_24px_70px_rgba(15,23,42,0.10)] lg:block lg:p-12">
        <p className="text-sm font-bold text-blue-700">AI SaaS Account</p>
        <h1 className="mt-5 max-w-2xl text-4xl font-bold leading-tight text-slate-950 lg:text-6xl">欢迎来到 Image Studio</h1>
        <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">AI 创作与账户管理的一站式平台</p>
        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          {LOGIN_FEATURES.map((item) => <div className="rounded-3xl border border-slate-200/80 bg-white/80 p-4 text-sm font-semibold text-slate-700 shadow-sm" key={item}>{item}</div>)}
        </div>
      </section>

      <section className="mx-auto w-full max-w-md rounded-2xl border border-white/80 bg-white p-4 shadow-sm sm:p-6 lg:max-w-none lg:rounded-[24px] lg:shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
        <div className="mb-4 lg:hidden">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">账户中心</p>
          <h1 className="mt-2 text-2xl font-bold leading-tight text-slate-950">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">登录后查看创作历史、资产归属与账户资料</p>
        </div>
        <LoginTabs auth={props.auth} />
        <LoginForm auth={props.auth} loading={props.loading} />
      </section>
    </div>
  );
}

function LoginTabs({ auth }: Readonly<{ auth: AuthController }>) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
      <button className={getTabClass(auth.authMode === "password")} type="button" onClick={() => auth.onAuthModeChange("password")}>
        密码登录
      </button>
      <button className={getTabClass(auth.authMode === "code")} type="button" onClick={() => auth.onAuthModeChange("code")}>
        验证码登录
      </button>
    </div>
  );
}

function LoginForm({ auth, loading }: Readonly<{ auth: AuthController; loading: boolean }>) {
  const isRegister = auth.intent === "register";
  const submitting = auth.state.status === "submitting" || loading;

  return (
    <form className="mt-5 grid gap-3 sm:mt-6 sm:gap-4" onSubmit={auth.onSubmit}>
      <AccountInput label="邮箱 / 手机号" onChange={auth.onEmailChange} type="text" value={auth.email} />
      {auth.authMode === "password" ? <AccountInput label="密码" onChange={auth.onPasswordChange} type="password" value={auth.password} /> : null}
      {auth.authMode === "code" ? <AccountInput label="验证码" onChange={auth.onVerificationCodeChange} type="text" value={auth.verificationCode} /> : null}
      <div className="flex items-center justify-between gap-3 text-sm text-slate-500">
        <label className="inline-flex items-center gap-2">
          <input className="size-4 rounded border-slate-300" type="checkbox" />
          记住我
        </label>
        <Link className="font-semibold text-blue-700" href="/login">
          忘记密码?
        </Link>
      </div>
      <button
        className="rounded-xl bg-blue-700 px-5 py-3 font-bold text-white shadow-sm disabled:bg-slate-200 disabled:shadow-none sm:rounded-2xl"
        disabled={submitting}
        type="submit"
      >
        {submitting ? "处理中..." : isRegister ? "注册账户" : "登录"}
      </button>
      <button
        className="rounded-xl border border-slate-200 bg-white px-5 py-3 font-bold text-slate-800 sm:rounded-2xl"
        type="button"
        onClick={() => auth.onIntentChange(isRegister ? "login" : "register")}
      >
        {isRegister ? "返回登录" : "注册账户"}
      </button>
      <AuthStateMessage state={auth.state} />
      <p className="text-center text-sm leading-6 text-slate-500">登录后可查看创作历史、资产归属与账户资料</p>
    </form>
  );
}

function AccountInput(props: Readonly<{ label: string; onChange: (value: string) => void; type: string; value: string }>) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700">
      {props.label}
      <input
        className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-medium outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 sm:rounded-2xl"
        onChange={(event) => props.onChange(event.target.value)}
        type={props.type}
        value={props.value}
      />
    </label>
  );
}

function AuthStateMessage({ state }: Readonly<{ state: AuthController["state"] }>) {
  if (state.status === "error") {
    return <ErrorMessage message={state.message} />;
  }
  if (state.status === "success") {
    return (
      <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/70 p-3 text-sm text-emerald-900 backdrop-blur-md">
        <p className="font-semibold">登录成功</p>
        <p className="mt-0.5">欢迎，{state.email}</p>
      </div>
    );
  }
  return null;
}

function getTabClass(active: boolean) {
  return active ? "rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-950 shadow-sm" : "rounded-xl px-4 py-2 text-sm font-bold text-slate-500";
}
