export type AdminNavIconKey = keyof typeof ADMIN_NAV_ICONS;

export type AdminNavItem = Readonly<{
  href: string;
  label: string;
  icon: AdminNavIconKey;
  detail: string;
  token: string;
  aliases?: readonly string[];
}>;

export type AdminNavGroup = Readonly<{
  label: string;
  description: string;
  items: readonly AdminNavItem[];
}>;

export const ADMIN_NAV_GROUPS = [
  {
    label: "概览",
    description: "后台总览和常用入口。",
    items: [
      { href: "/admin", label: "概览", icon: "overview", detail: "当前页面与导航分组", token: "总览" },
    ],
  },
  {
    label: "用户",
    description: "用户身份、状态和审计归在同一操作域。",
    items: [
      { href: "/admin/users", label: "用户管理", icon: "users", detail: "搜索真实用户、状态和详情", token: "用户" },
    ],
  },
  {
    label: "模型",
    description: "NewAPI 接入、模型目录和设施配置。",
    items: [
      { href: "/admin/providers", label: "NewAPI 接入", icon: "providers", detail: "NewAPI 中转站、模型目录和可见性", token: "NewAPI" },
      { href: "/admin/facilities", label: "设施", icon: "facilities", detail: "功能到模型的绑定配置", token: "设施" },
    ],
  },
  {
    label: "任务",
    description: "长任务和队列健康状态。",
    items: [
      { href: "/admin/image-jobs", label: "图片任务", icon: "image", detail: "图片生成队列、结果和运行告警", token: "图片", aliases: ["/admin/image-tasks"] },
      { href: "/admin/comic-jobs", label: "漫画任务", icon: "comic", detail: "漫画任务状态和执行线索", token: "漫画", aliases: ["/admin/comic-tasks"] },
    ],
  },
  {
    label: "内容",
    description: "公开图库和形象库管理。",
    items: [
      { href: "/admin/gallery", label: "公开图库", icon: "gallery", detail: "浏览、下架或删除公开分享的图片", token: "图库" },
      { href: "/admin/character-library", label: "形象库", icon: "character", detail: "管理公共形象和引用资产", token: "形象库" },
    ],
  },
  {
    label: "系统",
    description: "全局开关、审计和运行策略。",
    items: [
      { href: "/admin/settings", label: "设置", icon: "settings", detail: "注册、匿名生图和上传等开关", token: "设置" },
      { href: "/admin/audit", label: "审计日志", icon: "audit", detail: "查看敏感后台操作记录", token: "审计" },
    ],
  },
] as const satisfies readonly AdminNavGroup[];

export const ADMIN_NAV_ICONS = {
  overview: (
    <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="6" height="7" rx="1.5" />
      <rect x="14" y="4" width="6" height="4" rx="1.5" />
      <rect x="14" y="12" width="6" height="8" rx="1.5" />
      <rect x="4" y="15" width="6" height="5" rx="1.5" />
    </svg>
  ),
  users: (
    <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.75 19.5a5.25 5.25 0 0 1 10.5 0" />
      <path d="M16.5 11.5a3 3 0 0 0 0-6" />
      <path d="M16.75 15.25a4.5 4.5 0 0 1 3.5 4.25" />
    </svg>
  ),
  providers: (
    <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4v16" />
      <path d="M4 12h16" />
      <path d="m6.5 6.5 11 11" />
      <path d="m17.5 6.5-11 11" />
    </svg>
  ),
  facilities: (
    <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 7h14" />
      <path d="M5 12h14" />
      <path d="M5 17h14" />
      <path d="M8 5v14" />
      <path d="M16 5v14" />
    </svg>
  ),
  image: (
    <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.75" />
      <path d="m6.5 17 4.25-4.25 2.75 2.75 2-2L20 18" />
    </svg>
  ),
  comic: (
    <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6.5 4.5h11A1.5 1.5 0 0 1 19 6v12.5H7a2 2 0 0 1 0-4h12" />
      <path d="M7 4.5v10" />
      <path d="M10 8h5" />
    </svg>
  ),
  settings: (
    <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M18.75 13.4a7.3 7.3 0 0 0 0-2.8l2-1.55-2-3.45-2.45 1a7.2 7.2 0 0 0-2.4-1.4L13.5 2.5h-4l-.4 2.7a7.2 7.2 0 0 0-2.4 1.4l-2.45-1-2 3.45 2 1.55a7.3 7.3 0 0 0 0 2.8l-2 1.55 2 3.45 2.45-1a7.2 7.2 0 0 0 2.4 1.4l.4 2.7h4l.4-2.7a7.2 7.2 0 0 0 2.4-1.4l2.45 1 2-3.45z" />
    </svg>
  ),
  gallery: (
    <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  character: (
    <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.25 20a6.75 6.75 0 0 1 13.5 0" />
      <path d="M17.75 5.5 20 3.25" />
      <path d="M18.75 8.5h3" />
    </svg>
  ),
  audit: (
    <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 4h9l3 3v13H6z" />
      <path d="M14 4v4h4" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </svg>
  ),
} as const;

export function findAdminNavLocation(pathname: string) {
  for (const group of ADMIN_NAV_GROUPS) {
    for (const item of group.items) {
      const aliases = "aliases" in item ? item.aliases : undefined;
      if (isPathMatch(pathname, item.href) || aliases?.some((alias: string) => isPathMatch(pathname, alias))) {
        return { group, item };
      }
    }
  }
  return null;
}

function isPathMatch(pathname: string, href: string) {
  if (href === "/admin") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
