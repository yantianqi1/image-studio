import { NextRequest, NextResponse } from "next/server";

const ADMIN_SESSION_COOKIE_NAME = process.env.ADMIN_SESSION_COOKIE_NAME ?? "studio_admin_session";
const ADMIN_LOGIN_PATH = "/admin/login";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (isIgnoredPath(pathname) || !isAdminPath(pathname)) {
    return NextResponse.next();
  }
  if (isLoginPath(pathname)) {
    return NextResponse.next();
  }
  if (hasAdminCookie(request)) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL(ADMIN_LOGIN_PATH, request.url));
}

function hasAdminCookie(request: NextRequest) {
  return Boolean(request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value);
}

function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function isIgnoredPath(pathname: string) {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.png" ||
    pathname === "/apple-icon.png"
  );
}

function isLoginPath(pathname: string) {
  return pathname === ADMIN_LOGIN_PATH;
}

export const config = {
  matcher: ["/admin/:path*"],
};
