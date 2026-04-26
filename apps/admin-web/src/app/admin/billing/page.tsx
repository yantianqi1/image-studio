import { BillingPage } from "@/features/billing/billing-page";
import { requireAdminPage } from "@/lib/admin-auth";

export default async function Page() {
  await requireAdminPage();
  return <BillingPage />;
}
