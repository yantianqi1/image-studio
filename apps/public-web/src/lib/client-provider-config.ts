export type ClientProviderDraft = Readonly<{
  baseUrl: string;
  apiKey: string;
}>;

export type StoredClientProviderConfig = Readonly<ClientProviderDraft & {
  clientId: string;
}>;

const BASE_URL_STORAGE_KEY = "commercial-studio.clientProvider.baseUrl";
const API_KEY_STORAGE_KEY = "commercial-studio.clientProvider.apiKey";
const CLIENT_ID_STORAGE_KEY = "commercial-studio.clientProvider.clientId";
const CLIENT_ID_PREFIX = "cs-client";

export function readStoredClientProviderConfig(): StoredClientProviderConfig {
  if (!isBrowser()) {
    return { baseUrl: "", apiKey: "", clientId: "" };
  }
  return {
    baseUrl: window.localStorage.getItem(BASE_URL_STORAGE_KEY) ?? "",
    apiKey: window.localStorage.getItem(API_KEY_STORAGE_KEY) ?? "",
    clientId: window.localStorage.getItem(CLIENT_ID_STORAGE_KEY) ?? "",
  };
}

export function saveClientProviderDraft(draft: ClientProviderDraft): StoredClientProviderConfig {
  if (!isBrowser()) {
    return { ...draft, clientId: "" };
  }
  const next = {
    baseUrl: draft.baseUrl.trim(),
    apiKey: draft.apiKey.trim(),
    clientId: ensureClientId(),
  };
  window.localStorage.setItem(BASE_URL_STORAGE_KEY, next.baseUrl);
  window.localStorage.setItem(API_KEY_STORAGE_KEY, next.apiKey);
  return next;
}

export function clearClientProviderConfig(): StoredClientProviderConfig {
  if (!isBrowser()) {
    return { baseUrl: "", apiKey: "", clientId: "" };
  }
  window.localStorage.removeItem(BASE_URL_STORAGE_KEY);
  window.localStorage.removeItem(API_KEY_STORAGE_KEY);
  return { baseUrl: "", apiKey: "", clientId: ensureClientId() };
}

export function getClientProviderRequestHeaders(): Record<string, string> {
  const config = readStoredClientProviderConfig();
  if (!hasCompleteClientProviderConfig(config)) {
    return {};
  }
  return {
    "x-client-id": config.clientId || ensureClientId(),
    "x-client-provider-base-url": config.baseUrl,
    "x-client-provider-api-key": config.apiKey,
  };
}

export function hasCompleteClientProviderConfig(config: ClientProviderDraft): boolean {
  return Boolean(config.baseUrl.trim() && config.apiKey.trim());
}

function ensureClientId(): string {
  const existing = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }
  const generated = buildClientId();
  window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, generated);
  return generated;
}

function buildClientId(): string {
  if (window.crypto?.randomUUID) {
    return `${CLIENT_ID_PREFIX}-${window.crypto.randomUUID()}`;
  }
  return `${CLIENT_ID_PREFIX}-${Date.now().toString(36)}`;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}
