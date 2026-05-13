"use client";

import type { ReactNode } from "react";
import { SWRConfig } from "swr";

export function SwrProvider({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <SWRConfig value={{ revalidateOnFocus: false, dedupingInterval: 5000 }}>
      {children}
    </SWRConfig>
  );
}
