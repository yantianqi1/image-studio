import { UsersPage } from "@/features/users/users-page";
import { requireAdminPage } from "@/lib/admin-auth";

export default async function Page() {
  await requireAdminPage();
  return <UsersPage />;
}
