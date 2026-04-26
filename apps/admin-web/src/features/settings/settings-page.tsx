"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "@/features/shell/admin-shell";
import { ErrorBox } from "@/features/ui/error-box";
import { Panel } from "@/features/ui/panel";
import { adminApi } from "@/lib/admin-api";

const DEFAULT_SETTINGS = {
  site_title: "Commercial Studio",
  allow_public_signup: true,
  allow_anonymous_image: true,
  uploads_enabled: true,
};

export function SettingsPage() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    adminApi
      .settings()
      .then(setSettings)
      .catch((nextError) =>
        setError(
          nextError instanceof Error ? nextError.message : "读取设置失败",
        ),
      );
  }, []);

  return (
    <AdminShell
      title="站点设置"
      description="公开注册与匿名生图开关已经在 API 入口真实生效；上传开关保留给后续上传入口消费。"
    >
      <div className="col-span-12 lg:col-span-5">
        <Panel
          title="运行时开关"
          description="提交 /api/admin/settings"
        >
          <form
            className="grid gap-3"
            action={async (formData) => {
              try {
                setError("");
                const nextSettings = await adminApi.updateSettings({
                  site_title: String(formData.get("site_title") ?? ""),
                  allow_public_signup:
                    formData.get("allow_public_signup") === "on",
                  allow_anonymous_image:
                    formData.get("allow_anonymous_image") === "on",
                  uploads_enabled: formData.get("uploads_enabled") === "on",
                });
                setSettings(nextSettings);
                setMessage("设置已保存并立即影响新请求");
              } catch (nextError) {
                setError(
                  nextError instanceof Error ? nextError.message : "保存设置失败",
                );
              }
            }}
          >
            <label className="grid gap-1.5 text-sm font-semibold text-gray-700">
              站点标题
              <input
                className="admin-input"
                name="site_title"
                defaultValue={settings.site_title}
              />
            </label>

            <label className="admin-checkbox-card">
              <input
                name="allow_public_signup"
                type="checkbox"
                defaultChecked={settings.allow_public_signup}
              />
              <div>
                <span className="font-medium">允许公开注册</span>
                <span className="admin-hint">关闭后 /api/public/auth/register 返回 public_signup_disabled</span>
              </div>
            </label>

            <label className="admin-checkbox-card">
              <input
                name="allow_anonymous_image"
                type="checkbox"
                defaultChecked={settings.allow_anonymous_image}
              />
              <div>
                <span className="font-medium">允许匿名生图</span>
                <span className="admin-hint">关闭后匿名 /api/public/image/jobs 返回 anonymous_image_disabled</span>
              </div>
            </label>

            <label className="admin-checkbox-card">
              <input
                name="uploads_enabled"
                type="checkbox"
                defaultChecked={settings.uploads_enabled}
              />
              <div>
                <span className="font-medium">允许上传</span>
                <span className="admin-hint">当前上传入口尚未接入，该字段会保存并等待上传域消费</span>
              </div>
            </label>

            <button className="admin-button" type="submit">
              保存设置
            </button>
          </form>
          <div className="mt-3 grid gap-2">
            {message ? <div className="admin-card text-emerald-700">{message}</div> : null}
            {error ? <ErrorBox message={error} /> : null}
          </div>
        </Panel>
      </div>
    </AdminShell>
  );
}
