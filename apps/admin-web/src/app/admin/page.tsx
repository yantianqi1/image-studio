import { AdminOverviewPage } from "@/features/overview/admin-overview-page";
import { requireAdminPage } from "@/lib/admin-auth";

export default async function Page() {
  await requireAdminPage();
  return <AdminOverviewPage />;
}
