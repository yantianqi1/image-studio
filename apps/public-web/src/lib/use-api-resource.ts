"use client";

import { useEffect, useEffectEvent, useState } from "react";

import { ApiError } from "@/lib/api-client";

export type ResourceState<T> =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "error"; message: string; statusCode?: number }>
  | Readonly<{ status: "ready"; data: T }>;

type Loader<T> = () => Promise<T>;

type ResourceSnapshot<T> = Readonly<{
  refreshKey: number;
  state: ResourceState<T>;
}>;

export function startResourceRefresh<T>(current: ResourceState<T>): ResourceState<T> {
  if (current.status === "ready") {
    return current;
  }
  return { status: "loading" };
}

export function resolveResourceSnapshot<T>(snapshot: ResourceSnapshot<T>, refreshKey: number): ResourceState<T> {
  if (snapshot.refreshKey === refreshKey) {
    return snapshot.state;
  }
  return startResourceRefresh(snapshot.state);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知请求错误";
}

function getErrorStatusCode(error: unknown) {
  return error instanceof ApiError ? error.status : undefined;
}

export function useApiResource<T>(loader: Loader<T>, refreshKey = 0) {
  const [snapshot, setSnapshot] = useState<ResourceSnapshot<T>>({
    refreshKey,
    state: { status: "loading" },
  });
  const runLoader = useEffectEvent(loader);
  const state = resolveResourceSnapshot(snapshot, refreshKey);

  useEffect(() => {
    let active = true;

    runLoader()
      .then((data) => {
        if (active) {
          setSnapshot({ refreshKey, state: { status: "ready", data } });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setSnapshot({
            refreshKey,
            state: {
              status: "error",
              message: getErrorMessage(error),
              statusCode: getErrorStatusCode(error),
            },
          });
        }
      });

    return () => {
      active = false;
    };
  }, [refreshKey]);

  return state;
}
