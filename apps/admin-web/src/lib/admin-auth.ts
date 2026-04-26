import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:7800";
const ADMIN_SESSION_COOKIE_NAME = process.env.ADMIN_SESSION_COOKIE_NAME ?? "studio_admin_session";

export async function isAdminAuthenticated() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ADMIN_SESSION_COOKIE_NAME);
  if (!sessionCookie?.value) {
    return false;
  }
  const response = await fetch(`${API_BASE_URL}/api/admin/auth/me`, {
    cache: "no-store",
    headers: {
      Cookie: `${ADMIN_SESSION_COOKIE_NAME}=${encodeURIComponent(sessionCookie.value)}`,
    },
  });
  return response.ok;
}

export async function requireAdminPage(loginPath = "/admin/login") {
  if (await isAdminAuthenticated()) {
    return;
  }
  redirect(loginPath);
}

export async function redirectAuthenticatedAdmin(homePath = "/admin") {
  if (await isAdminAuthenticated()) {
    redirect(homePath);
  }
}
