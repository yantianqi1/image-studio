import { NextRequest, NextResponse } from "next/server";

const ADMIN_SESSION_COOKIE_NAME = process.env.ADMIN_SESSION_COOKIE_NAME ?? "studio_admin_session";

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (isIgnoredPath(pathname)) {
    return NextResponse.next();
  }
  if (isLoginPath(pathname)) {
    return handleLoginPath(request);
  }
  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }
  if (hasAdminCookie(request)) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/admin/login", request.url));
}

function handleLoginPath(request: NextRequest) {
  if (!hasAdminCookie(request)) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/admin", request.url));
}

function hasAdminCookie(request: NextRequest) {
  return Boolean(request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value);
}

function isIgnoredPath(pathname: string) {
  return pathname.startsWith("/_next") || pathname.startsWith("/api") || pathname === "/favicon.ico";
}

function isLoginPath(pathname: string) {
  return pathname === "/login" || pathname === "/admin/login";
}

function isProtectedPath(pathname: string) {
  return pathname === "/" || pathname === "/admin" || pathname.startsWith("/admin/") || protectedRootPaths().has(pathname);
}

function protectedRootPaths() {
  return new Set([
    "/users",
    "/billing",
    "/redeem",
    "/providers",
    "/image-jobs",
    "/comic-jobs",
    "/image-tasks",
    "/comic-tasks",
    "/settings",
  ]);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
