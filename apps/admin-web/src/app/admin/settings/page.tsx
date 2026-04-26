import { SettingsPage } from "@/features/settings/settings-page";
import { requireAdminPage } from "@/lib/admin-auth";

export default async function Page() {
  await requireAdminPage();
  return <SettingsPage />;
}
