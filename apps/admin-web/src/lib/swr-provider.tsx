"use client";

import { SWRConfig } from "swr";
import type { ReactNode } from "react";

import { apiFetch } from "@/lib/api-client";

function swrFetcher<T>(path: string): Promise<T> {
  return apiFetch<T>(path);
}

export function SwrProvider({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <SWRConfig
      value={{
        fetcher: swrFetcher,
        revalidateOnFocus: false,
        dedupingInterval: 5000,
        errorRetryCount: 2,
      }}
    >
      {children}
    </SWRConfig>
  );
}
