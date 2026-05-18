import { AdminWorkspace } from "@/features/shell/admin-workspace";
import { requireAdminPage } from "@/lib/admin-auth";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireAdminPage();
  return <AdminWorkspace>{children}</AdminWorkspace>;
}
