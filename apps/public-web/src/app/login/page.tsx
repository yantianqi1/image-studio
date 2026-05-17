import { Suspense } from "react";

import { WalletDashboard } from "@/features/wallet/wallet-dashboard";

export default function LoginPage() {
  return (
    <Suspense fallback={<div aria-hidden="true" className="min-h-screen bg-[var(--background)]" />}>
      <WalletDashboard />
    </Suspense>
  );
}
