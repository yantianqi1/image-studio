"use client";

import useSWR from "swr";

import { ApiError } from "@/lib/api-client";
import { publicApi, type PublicModelSummary } from "@/lib/public-api";
import type { ResourceState } from "@/lib/use-api-resource";

const PUBLIC_MODELS_CACHE_KEY = "public-models";
const PUBLIC_MODELS_DEDUPING_INTERVAL_MS = 60_000;

export function usePublicModels(): ResourceState<readonly PublicModelSummary[]> {
  const { data, error } = useSWR(PUBLIC_MODELS_CACHE_KEY, publicApi.getModels, {
    dedupingInterval: PUBLIC_MODELS_DEDUPING_INTERVAL_MS,
    keepPreviousData: true,
    revalidateIfStale: false,
    revalidateOnFocus: false,
  });

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
