import { Suspense } from "react";

import { AccountDashboard } from "@/features/account/account-dashboard";

export default function LoginPage() {
  return (
    <Suspense fallback={<div aria-hidden="true" className="min-h-screen bg-[var(--background)]" />}>
      <AccountDashboard />
    </Suspense>
  );
}
