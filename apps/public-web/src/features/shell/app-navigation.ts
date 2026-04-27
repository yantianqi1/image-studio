export type AppNavItem = Readonly<{
  href: string;
  label: string;
}>;

export const APP_NAV_ITEMS: readonly AppNavItem[] = [
  { href: "/", label: "生图" },
  { href: "/comic", label: "漫画" },
  { href: "/apps", label: "应用" },
  { href: "/tasks", label: "任务" },
  { href: "/wallet", label: "钱包" },
  { href: "/login", label: "登录" },
] as const;

export const APP_HEADER_CONTAINER_CLASS = "grid h-16 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 sm:px-5 md:grid-cols-[minmax(0,1fr)_27rem_minmax(0,1fr)] lg:px-6";
export const APP_HEADER_LEFT_CLASS = "col-start-1 row-start-1 flex min-w-0 items-center gap-3";
export const APP_HEADER_RIGHT_CLASS = "col-start-2 row-start-1 flex min-w-0 items-center justify-end gap-2 md:col-start-3";
export const APP_NAV_CONTAINER_CLASS = "col-start-2 row-start-1 hidden h-11 w-[27rem] grid-cols-6 items-center gap-1 rounded-xl md:grid";
