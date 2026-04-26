import { LoginPage } from "@/features/login/login-page";
import { redirectAuthenticatedAdmin } from "@/lib/admin-auth";

export default async function Page() {
  await redirectAuthenticatedAdmin();
  return <LoginPage redirectTo="/admin" />;
}
