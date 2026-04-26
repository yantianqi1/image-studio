import type { Metadata } from "next";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:7800";
const SITE_SETTINGS_PATH = "/api/public/settings";

type SiteSettingsEnvelope = Readonly<{
  data: Readonly<{ site_title: string }> | null;
  meta: Record<string, unknown>;
  error: null | Readonly<{ code: string; message: string }>;
}>;

export async function buildPublicMetadata(): Promise<Metadata> {
  const siteTitle = await fetchSiteTitle();
  return {
    title: siteTitle,
    description: "用户端生图与漫画创作工作台",
  };
}

async function fetchSiteTitle() {
  const response = await fetch(buildSiteSettingsUrl(), { cache: "no-store" });
  const payload = (await response.json()) as SiteSettingsEnvelope;
  if (!response.ok || payload.error || !payload.data?.site_title) {
    throw new Error(payload.error?.message ?? "failed to load site title");
  }
  return payload.data.site_title;
}

function buildSiteSettingsUrl() {
  const baseUrl = process.env.API_BASE_URL ?? DEFAULT_API_BASE_URL;
  return new URL(SITE_SETTINGS_PATH, baseUrl).toString();
}
