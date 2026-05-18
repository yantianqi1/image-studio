"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ADMIN_NAV_GROUPS, ADMIN_NAV_ICONS, findAdminNavLocation, type AdminNavItem } from "@/features/shell/admin-navigation";

export function AdminNav() {
  const pathname = usePathname();
  const activeHref = findAdminNavLocation(pathname)?.item.href;
  return (
    <nav className="admin-nav" aria-label="后台导航">
      {ADMIN_NAV_GROUPS.map((group) => (
        <NavGroup key={group.label} group={group} activeHref={activeHref} />
      ))}
    </nav>
  );
}

function NavGroup({
  group,
  activeHref,
}: Readonly<{
  group: (typeof ADMIN_NAV_GROUPS)[number];
  activeHref?: string;
}>) {
  return (
    <section className="admin-nav-section" aria-label={group.label}>
      <p className="admin-nav-group-label">{group.label}</p>
      <div className="admin-nav-items">
        {group.items.map((item) => (
          <NavLinkItem key={item.href} item={item} active={activeHref === item.href} />
        ))}
      </div>
    </section>
  );
}

function NavLinkItem({ item, active }: Readonly<{ item: AdminNavItem; active: boolean }>) {
  const className = active ? "admin-nav-link admin-nav-link-active" : "admin-nav-link";
  return (
    <Link href={item.href} className={className} aria-current={active ? "page" : undefined}>
      {ADMIN_NAV_ICONS[item.icon]}
      <span>{item.label}</span>
    </Link>
  );
}
