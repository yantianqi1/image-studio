import { RedeemPage } from "@/features/redeem/redeem-page";
import { requireAdminPage } from "@/lib/admin-auth";

export default async function Page() {
  await requireAdminPage();
  return <RedeemPage />;
}
