"use client";

import { useState } from "react";

import { AdminShell } from "@/features/shell/admin-shell";
import { ErrorBox } from "@/features/ui/error-box";
import { Panel } from "@/features/ui/panel";
import { SubmitButton } from "@/features/ui/submit-button";
import { adminApi } from "@/lib/admin-api";
import { useAdminSettings } from "@/lib/use-admin-data";
import { useToast } from "@/lib/toast-context";

type SettingsState = Readonly<{
  site_title: string;
  allow_public_signup: boolean;
  allow_anonymous_image: boolean;
  uploads_enabled: boolean;
  public_quota_mode: "daily_global" | "per_ip";
  public_quota_daily_global_limit: number;
  public_quota_per_ip_limit: number;
  client_provider_url_pool: string;
}>;

export function SettingsPage() {
  const { data: settings, error: loadError, mutate } = useAdminSettings();
  const [error, setError] = useState("");
  const toast = useToast();

  async function handleSave(formData: FormData) {
    if (!settings) return;
    try {
      setError("");
      const nextSettings = await adminApi.updateSettings(buildSettingsPayload(formData, settings));
      mutate(nextSettings, false);
      toast.success("设置已保存并立即影响新请求");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "保存设置失败");
    }
  }

  return (
    <AdminShell
      title="站点设置"
      description="公开注册、匿名生图和公开共享额度已经在 API 入口真实生效。"
    >
      {loadError ? <div className="col-span-12"><ErrorBox message={loadError instanceof Error ? loadError.message : "读取设置失败"} /></div> : null}
      {settings ? <SettingsPanel error={error} onSave={handleSave} settings={settings} /> : null}
    </AdminShell>
  );
}

type SettingsPanelProps = Readonly<{
  error: string;
  onSave: (formData: FormData) => Promise<void>;
  settings: SettingsState;
}>;

function SettingsPanel({ error, onSave, settings }: SettingsPanelProps) {
  return (
    <div className="col-span-12 lg:col-span-7">
      <Panel title="公开体验设置" description="提交 /api/admin/settings">
        <form key={settingsFormKey(settings)} className="grid gap-3" action={onSave}>
          <SiteTitleField siteTitle={settings.site_title} />
          <RuntimeSwitches settings={settings} />
          <ClientProviderUrlPoolField value={settings.client_provider_url_pool} />
          <PublicQuotaModeSelector mode={settings.public_quota_mode} />
          <PublicQuotaLimitInputs settings={settings} />
          <SubmitButton pendingText="保存中...">保存设置</SubmitButton>
        </form>
        {error ? <div className="mt-3"><ErrorBox message={error} /></div> : null}
      </Panel>
    </div>
  );
}

function SiteTitleField({ siteTitle }: Readonly<{ siteTitle: string }>) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-gray-700">
      站点标题
      <input className="admin-input" name="site_title" defaultValue={siteTitle} />
    </label>
  );
}

function RuntimeSwitches({ settings }: Readonly<{ settings: SettingsState }>) {
  return (
    <>
      <SwitchCard checked={settings.allow_public_signup} name="allow_public_signup" title="允许公开注册" hint="关闭后 /api/public/auth/register 返回 public_signup_disabled" />
      <SwitchCard checked={settings.allow_anonymous_image} name="allow_anonymous_image" title="允许匿名生图" hint="关闭后匿名 /api/public/image/jobs 返回 anonymous_image_disabled" />
      <SwitchCard checked={settings.uploads_enabled} name="uploads_enabled" title="允许上传" hint="当前上传入口尚未接入，该字段会保存并等待上传域消费" />
    </>
  );
}

function SwitchCard(props: Readonly<{ checked: boolean; hint: string; name: string; title: string }>) {
  return (
    <label className="admin-checkbox-card">
      <input name={props.name} type="checkbox" defaultChecked={props.checked} />
      <div>
        <span className="font-medium">{props.title}</span>
        <span className="admin-hint">{props.hint}</span>
      </div>
    </label>
  );
}

function ClientProviderUrlPoolField({ value }: Readonly<{ value: string }>) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-gray-700">
      自有通道 URL 池
      <textarea
        className="admin-input min-h-32"
        name="client_provider_url_pool"
        defaultValue={value}
        placeholder={"https://api.example.com/v1\nhttps://api.openai.com/v1"}
      />
      <span className="admin-hint">一行一个 URL；用户只填 Key 时按顺序自动识别。</span>
    </label>
  );
}

function PublicQuotaModeSelector({ mode }: Readonly<{ mode: PublicQuotaMode }>) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-semibold text-gray-700">公开共享额度模式</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <QuotaModeCard currentMode={mode} mode="daily_global" title="每日全站共享" hint="生图、漫画和应用共用一个每日次数池，北京时间 00:00 刷新。" />
        <QuotaModeCard currentMode={mode} mode="per_ip" title="按 IP 限制" hint="每个访问 IP 拥有固定体验次数，不占用每日全站次数池。" />
      </div>
    </fieldset>
  );
}

function QuotaModeCard(props: Readonly<{ currentMode: PublicQuotaMode; hint: string; mode: PublicQuotaMode; title: string }>) {
  return (
    <label className="admin-checkbox-card">
      <input name="public_quota_mode" type="radio" value={props.mode} defaultChecked={props.currentMode === props.mode} required />
      <div>
        <span className="font-medium">{props.title}</span>
        <span className="admin-hint">{props.hint}</span>
      </div>
    </label>
  );
}

function PublicQuotaLimitInputs({ settings }: Readonly<{ settings: SettingsState }>) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <QuotaLimitInput hint="仅在“每日全站共享”模式生效。" label="每日全站次数" name="public_quota_daily_global_limit" value={settings.public_quota_daily_global_limit} />
      <QuotaLimitInput hint="仅在“按 IP 限制”模式生效。" label="每 IP 次数" name="public_quota_per_ip_limit" value={settings.public_quota_per_ip_limit} />
    </div>
  );
}

function QuotaLimitInput(props: Readonly<{ hint: string; label: string; name: string; value: number }>) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-gray-700">
      {props.label}
      <input className="admin-input" name={props.name} type="number" min="1" step="1" defaultValue={props.value} required />
      <span className="admin-hint">{props.hint}</span>
    </label>
  );
}

type PublicQuotaMode = SettingsState["public_quota_mode"];

function buildSettingsPayload(formData: FormData, settings: SettingsState): SettingsState {
  return {
    site_title: String(formData.get("site_title") ?? ""),
    allow_public_signup: formData.get("allow_public_signup") === "on",
    allow_anonymous_image: formData.get("allow_anonymous_image") === "on",
    uploads_enabled: formData.get("uploads_enabled") === "on",
    public_quota_mode: readQuotaMode(formData),
    public_quota_daily_global_limit: readQuotaLimit(formData, "public_quota_daily_global_limit", settings.public_quota_daily_global_limit),
    public_quota_per_ip_limit: readQuotaLimit(formData, "public_quota_per_ip_limit", settings.public_quota_per_ip_limit),
    client_provider_url_pool: String(formData.get("client_provider_url_pool") ?? ""),
  };
}

function readQuotaMode(formData: FormData): PublicQuotaMode {
  return formData.get("public_quota_mode") === "per_ip" ? "per_ip" : "daily_global";
}

function readQuotaLimit(formData: FormData, key: string, fallback: number): number {
  const parsed = Number.parseInt(String(formData.get(key) ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function settingsFormKey(settings: SettingsState): string {
  return [
    settings.site_title,
    String(settings.allow_public_signup),
    String(settings.allow_anonymous_image),
    String(settings.uploads_enabled),
    settings.public_quota_mode,
    String(settings.public_quota_daily_global_limit),
    String(settings.public_quota_per_ip_limit),
    settings.client_provider_url_pool,
  ].join(":");
}
