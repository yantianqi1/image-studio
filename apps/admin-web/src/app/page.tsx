import { AdminOverviewPage } from "@/features/overview/admin-overview-page";
import { requireAdminPage } from "@/lib/admin-auth";

export default async function Home() {
  await requireAdminPage();
  return <AdminOverviewPage />;
}
