export type AppNavItem = Readonly<{
  href: string;
  label: string;
}>;

export const APP_NAV_ITEMS: readonly AppNavItem[] = [
  { href: "/", label: "生图" },
  { href: "/apps", label: "应用" },
  { href: "/comic", label: "漫画" },
  { href: "/tasks", label: "任务" },
  { href: "/wallet", label: "钱包" },
  { href: "/login", label: "登录" },
] as const;

export const APP_NAV_CONTAINER_CLASS = "absolute left-1/2 top-1/2 hidden h-11 w-[27rem] -translate-x-1/2 -translate-y-1/2 grid-cols-6 items-center gap-1 rounded-xl md:grid";
