"use client";

import { useEffect } from "react";
import useSWR from "swr";

import { ApiError } from "@/lib/api-client";
import { PUBLIC_QUOTA_REFRESH_EVENT, publicApi, type PublicQuotaStatus } from "@/lib/public-api";
import type { ResourceState } from "@/lib/use-api-resource";

const PUBLIC_QUOTA_CACHE_KEY = "public-quota-status";
const PUBLIC_QUOTA_DEDUPING_INTERVAL_MS = 60_000;

export function usePublicQuotaStatus(): ResourceState<PublicQuotaStatus> {
  const { data, error, mutate } = useSWR(PUBLIC_QUOTA_CACHE_KEY, publicApi.getPublicQuotaStatus, {
    dedupingInterval: PUBLIC_QUOTA_DEDUPING_INTERVAL_MS,
    keepPreviousData: true,
    revalidateIfStale: false,
    revalidateOnFocus: false,
  });

  useEffect(() => {
    const refresh = () => {
      void mutate();
    };
    window.addEventListener(PUBLIC_QUOTA_REFRESH_EVENT, refresh);
    return () => window.removeEventListener(PUBLIC_QUOTA_REFRESH_EVENT, refresh);
  }, [mutate]);

  if (data) {
    return { status: "ready", data };
  }

  if (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "未知请求错误",
      statusCode: error instanceof ApiError ? error.status : undefined,
    };
  }

  return { status: "loading" };
}
