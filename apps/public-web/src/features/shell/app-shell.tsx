import Link from "next/link";
import type { ReactNode } from "react";

import { ClientProviderControls } from "@/features/shell/client-provider-controls";
import {
  APP_HEADER_CONTAINER_CLASS,
  APP_HEADER_LEFT_CLASS,
  APP_HEADER_RIGHT_CLASS,
  APP_NAV_CONTAINER_CLASS,
  APP_NAV_ITEMS,
} from "@/features/shell/app-navigation";

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
  brandLabel = "image Studio",
  navAside,
  leadingAction,
  workspaceMode = false,
  activeHref,
  headerTitle,
}: AppShellProps) {
  const hasHero = !workspaceMode && Boolean(eyebrow || title || description);
  const resolvedHeaderTitle = headerTitle ?? (workspaceMode ? title : undefined);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <AppHeader activeHref={activeHref} brandLabel={brandLabel} headerTitle={resolvedHeaderTitle} leadingAction={leadingAction} navAside={navAside} />

      <main className={workspaceMode ? "h-[calc(100vh-4rem)] w-full overflow-hidden px-3 py-3 sm:px-4 lg:px-5" : "mx-auto w-full max-w-[1440px] px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-6"}>
        {hasHero ? <HeroSection description={description} eyebrow={eyebrow} title={title} /> : null}
        <section className={workspaceMode ? "h-full" : hasHero ? "mt-5" : ""}>{children}</section>
      </main>
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
    <header className="sticky top-0 z-30 border-b border-black/5 bg-white/90 backdrop-blur-xl">
      <div className={APP_HEADER_CONTAINER_CLASS}>
        <div className={APP_HEADER_LEFT_CLASS}>
          {props.leadingAction}
          <BrandLink brandLabel={props.brandLabel} headerTitle={props.headerTitle} />
        </div>
        <MainNav activeHref={props.activeHref} />
        <div className={APP_HEADER_RIGHT_CLASS}>
          <ClientProviderControls />
          {props.navAside}
        </div>
      </div>
    </header>
  );
}

function BrandLink(props: Readonly<{ brandLabel: string; headerTitle?: string }>) {
  return (
    <div className="flex min-w-0 items-center gap-3 overflow-hidden">
      <Link href="/" className="flex min-w-0 shrink-0 items-center gap-3 rounded-2xl px-1 py-1.5 text-sm font-semibold tracking-[-0.01em] text-gray-900" aria-label="image Studio 首页">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gray-900 text-xs font-bold text-white shadow-sm">IS</span>
        <span className="hidden truncate sm:inline">{props.brandLabel}</span>
      </Link>
      {props.headerTitle ? <span className="hidden min-w-0 truncate border-l border-gray-200 pl-3 text-sm font-semibold text-gray-900 sm:inline">{props.headerTitle}</span> : null}
    </div>
  );
}

function MainNav({ activeHref }: Readonly<{ activeHref?: string }>) {
  return (
    <nav className={APP_NAV_CONTAINER_CLASS}>
      {APP_NAV_ITEMS.map((item) => <NavLink key={item.href} active={activeHref === item.href} href={item.href} label={item.label} />)}
    </nav>
  );
}

function NavLink(props: Readonly<{ active: boolean; href: string; label: string }>) {
  return (
    <Link
      href={props.href}
      className="nav-pill whitespace-nowrap"
      aria-current={props.active ? "page" : undefined}
      data-active={props.active ? "true" : "false"}
    >
      {props.label}
    </Link>
  );
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
