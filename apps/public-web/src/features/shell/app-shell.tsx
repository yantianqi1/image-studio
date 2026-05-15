import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "@/features/shell/brand-mark";
import {
  APP_MOBILE_NAV_ITEMS,
  APP_NAV_ITEMS,
} from "@/features/shell/app-navigation";
import { ViewTransitionLink } from "@/features/shell/view-transition-link";
import { GlobalPromptCrafter } from "@/features/prompt-crafter/global-prompt-crafter";
import { ProviderSettingsPopover } from "@/features/shell/provider-settings-popover";
import { PublicQuotaStatusBadge } from "@/features/shell/public-quota-status";
import styles from "./app-header.module.css";

type AppShellProps = Readonly<{
  children: ReactNode;
  eyebrow?: string;
  title?: string;
  description?: string;
  brandLabel?: string;
  navAside?: ReactNode;
  leadingAction?: ReactNode;
  workspaceMode?: boolean;
  activeHref?: string;
  headerTitle?: string;
}>;

export function AppShell({
  children,
  eyebrow,
  title,
  description,
  brandLabel = "Image Studio",
  navAside,
  leadingAction,
  workspaceMode = false,
  activeHref,
  headerTitle,
}: AppShellProps) {
  const hasHero = !workspaceMode && Boolean(eyebrow || title || description);
  const resolvedHeaderTitle = headerTitle ?? (workspaceMode ? title : undefined);

  return (
    <div className={workspaceMode ? "fixed inset-0 flex h-[100dvh] flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]" : "min-h-screen bg-[var(--background)] text-[var(--foreground)]"}>
      <AppHeader activeHref={activeHref} brandLabel={brandLabel} headerTitle={resolvedHeaderTitle} leadingAction={leadingAction} navAside={navAside} />

      <main style={{ viewTransitionName: "main-content" }} className={workspaceMode ? "min-h-0 w-full flex-1 overflow-hidden px-2 pb-2 pt-2 sm:px-4 sm:pb-3 lg:px-5" : "mx-auto w-full max-w-[1440px] px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-6"}>
        {hasHero ? <HeroSection description={description} eyebrow={eyebrow} title={title} /> : null}
        <section className={workspaceMode ? "h-full min-h-0" : hasHero ? "mt-5" : ""}>{children}</section>
      </main>

      <GlobalPromptCrafter />
    </div>
  );
}

type AppHeaderProps = Readonly<{
  activeHref?: string;
  brandLabel: string;
  headerTitle?: string;
  leadingAction?: ReactNode;
  navAside?: ReactNode;
}>;

function AppHeader(props: AppHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <div className={styles.brandArea}>
          {props.leadingAction}
          <BrandLink brandLabel={props.brandLabel} headerTitle={props.headerTitle} />
        </div>
        <MainNav activeHref={props.activeHref} />
        <div className={styles.actions}>
          <div className={styles.quotaBadge}>
            <PublicQuotaStatusBadge />
          </div>
          <ProviderSettingsPopover />
          {props.navAside}
          {props.navAside ? null : <AccountButton />}
        </div>
      </div>
      <MobileNav activeHref={props.activeHref} />
    </header>
  );
}

function BrandLink(props: Readonly<{ brandLabel: string; headerTitle?: string }>) {
  return (
    <>
      <Link href="/" className={styles.brand} aria-label={`${props.brandLabel} 首页`}>
        <span className={styles.brandIcon}>
          <BrandMark />
        </span>
        <span className={styles.brandName}>{props.brandLabel}</span>
      </Link>
      {props.headerTitle ? <span className={styles.headerTitle}>{props.headerTitle}</span> : null}
    </>
  );
}

function MainNav({ activeHref }: Readonly<{ activeHref?: string }>) {
  return (
    <nav className={styles.nav} aria-label="产品导航">
      {APP_NAV_ITEMS.map((item) => <NavLink key={item.href} active={activeHref === item.href} item={item} />)}
    </nav>
  );
}

function MobileNav({ activeHref }: Readonly<{ activeHref?: string }>) {
  return (
    <nav className={styles.mobileNav} aria-label="移动端功能切换">
      {APP_MOBILE_NAV_ITEMS.map((item) => (
        <MobileNavLink key={item.href} active={activeHref === item.href} item={item} />
      ))}
    </nav>
  );
}

function NavLink(props: Readonly<{ active: boolean; item: (typeof APP_NAV_ITEMS)[number] }>) {
  return (
    <ViewTransitionLink
      href={props.item.href}
      className={getNavLinkClass(props.active)}
      aria-current={props.active ? "page" : undefined}
    >
      {props.item.label}
    </ViewTransitionLink>
  );
}

function MobileNavLink(props: Readonly<{ active: boolean; item: (typeof APP_MOBILE_NAV_ITEMS)[number] }>) {
  return (
    <ViewTransitionLink
      href={props.item.href}
      className={getMobileNavLinkClass(props.active)}
      aria-current={props.active ? "page" : undefined}
    >
      {props.item.label}
    </ViewTransitionLink>
  );
}

function AccountButton() {
  return (
    <Link href="/wallet" className={styles.accountButton} aria-label="账号中心">
      <span className={styles.accountAvatar} aria-hidden="true">我</span>
      <span className={styles.accountButtonText}>我的</span>
    </Link>
  );
}

function getNavLinkClass(active: boolean) {
  return active ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem;
}

function getMobileNavLinkClass(active: boolean) {
  return active ? `${styles.mobileNavItem} ${styles.mobileNavItemActive}` : styles.mobileNavItem;
}

function HeroSection(props: Readonly<{ description?: string; eyebrow?: string; title?: string }>) {
  return (
    <section className="rounded-[24px] border border-black/5 bg-white px-5 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:px-6">
      {props.eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400">{props.eyebrow}</p> : null}
      {props.title ? <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-gray-900 sm:text-3xl">{props.title}</h1> : null}
      {props.description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">{props.description}</p> : null}
    </section>
  );
}
