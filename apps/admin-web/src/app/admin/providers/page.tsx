import { ProvidersPage } from "@/features/providers/providers-page";
import { requireAdminPage } from "@/lib/admin-auth";

export default async function Page() {
  await requireAdminPage();
  return <ProvidersPage />;
}
