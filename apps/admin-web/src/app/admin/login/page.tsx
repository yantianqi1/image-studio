import { LoginPage } from "@/features/login/login-page";
import { redirectAuthenticatedAdmin } from "@/lib/admin-auth";

export default async function Page() {
  await redirectAuthenticatedAdmin("/admin");
  return <LoginPage redirectTo="/admin" />;
}
