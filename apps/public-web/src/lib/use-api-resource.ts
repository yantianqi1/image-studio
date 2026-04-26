"use client";

import { useEffect, useEffectEvent, useState } from "react";

import { ApiError } from "@/lib/api-client";

export type ResourceState<T> =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "error"; message: string; statusCode?: number }>
  | Readonly<{ status: "ready"; data: T }>;

type Loader<T> = () => Promise<T>;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知请求错误";
}

function getErrorStatusCode(error: unknown) {
  return error instanceof ApiError ? error.status : undefined;
}

export function useApiResource<T>(loader: Loader<T>, refreshKey = 0) {
  const [state, setState] = useState<ResourceState<T>>({ status: "loading" });
  const runLoader = useEffectEvent(loader);

  useEffect(() => {
    let active = true;

    runLoader()
      .then((data) => {
        if (active) {
          setState({ status: "ready", data });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: "error",
            message: getErrorMessage(error),
            statusCode: getErrorStatusCode(error),
          });
        }
      });

    return () => {
      active = false;
    };
  }, [refreshKey]);

  return state;
}
