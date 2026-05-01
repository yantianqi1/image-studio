export type AppNavItem = Readonly<{
  href: string;
  label: string;
}>;

export const APP_NAV_ITEMS: readonly AppNavItem[] = [
  { href: "/", label: "图库" },
  { href: "/generate", label: "生成" },
  { href: "/comic", label: "漫画" },
  { href: "/apps", label: "应用" },
] as const;

export const APP_MOBILE_NAV_ITEMS: readonly AppNavItem[] = [
  { href: "/", label: "图库" },
  { href: "/generate", label: "生成" },
  { href: "/comic", label: "漫画" },
  { href: "/login", label: "我的" },
] as const;
