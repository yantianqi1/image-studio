"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AdminLogoutButton } from "@/features/shell/admin-logout-button";

type NavIcon = keyof typeof navIcons;

type NavItem = Readonly<{
  href: string;
  label: string;
  icon: NavIcon;
  aliases?: readonly string[];
}>;

const navGroups = [
  {
    label: "Overview",
    items: [{ href: "/admin", label: "概览", icon: "overview" }],
  },
  {
    label: "Users & Money",
    items: [
      { href: "/admin/users", label: "用户", icon: "users" },
      { href: "/admin/billing", label: "计费", icon: "billing" },
      { href: "/admin/redeem", label: "激活码", icon: "redeem" },
    ],
  },
  {
    label: "Models & Work",
    items: [
      { href: "/admin/providers", label: "Provider", icon: "providers" },
      { href: "/admin/image-jobs", label: "图片任务", icon: "image", aliases: ["/admin/image-tasks"] },
      { href: "/admin/comic-jobs", label: "漫画任务", icon: "comic", aliases: ["/admin/comic-tasks"] },
      { href: "/admin/gallery", label: "公开图库", icon: "gallery" },
      { href: "/admin/character-library", label: "形象库", icon: "character" },
    ],
  },
  {
    label: "System",
    items: [{ href: "/admin/settings", label: "设置", icon: "settings" }],
  },
] as const satisfies readonly { label: string; items: readonly NavItem[] }[];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="admin-nav" aria-label="后台导航">
      {navGroups.map((group) => (
        <NavGroup key={group.label} group={group} pathname={pathname} />
      ))}
      <div className="admin-nav-footer">
        <AdminLogoutButton />
      </div>
    </nav>
  );
}

function NavGroup({ group, pathname }: Readonly<{ group: (typeof navGroups)[number]; pathname: string }>) {
  return (
    <section className="admin-nav-section" aria-label={group.label}>
      <p className="admin-nav-group-label">{group.label}</p>
      <div className="admin-nav-items">
        {group.items.map((item) => (
          <NavLinkItem key={item.href} item={item} active={isActivePath(pathname, item)} />
        ))}
      </div>
    </section>
  );
}

function NavLinkItem({ item, active }: Readonly<{ item: NavItem; active: boolean }>) {
  const className = active ? "admin-nav-link admin-nav-link-active" : "admin-nav-link";
  return (
    <Link href={item.href} className={className} aria-current={active ? "page" : undefined}>
      {navIcons[item.icon]}
      <span>{item.label}</span>
    </Link>
  );
}

function isActivePath(pathname: string, item: NavItem) {
  if (isPathMatch(pathname, item.href)) {
    return true;
  }
  return item.aliases?.some((alias) => isPathMatch(pathname, alias)) ?? false;
}

function isPathMatch(pathname: string, href: string) {
  if (href === "/admin") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

const navIcons = {
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
  billing: (
    <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 15h4" />
    </svg>
  ),
  redeem: (
    <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7.5 12.5 5.75 14.25a3.5 3.5 0 0 0 4.95 4.95l2.05-2.05" />
      <path d="m16.5 11.5 1.75-1.75a3.5 3.5 0 0 0-4.95-4.95l-2.05 2.05" />
      <path d="m9.5 14.5 5-5" />
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
} as const;
