import Link from "next/link";
import { ChevronDown, HelpCircle, Settings } from "lucide-react";

import { BrandMark } from "@/features/shell/brand-mark";

import type { AccountSession, AccountResources } from "./account-types";
import { getDisplayName, getQuotaValueLabel, getUserInitial } from "./account-utils";

const TOP_NAV_LINKS = [
  { href: "/", label: "图库" },
  { href: "/generate", label: "创作台" },
  { href: "/comic", label: "漫画" },
  { href: "/apps", label: "应用" },
] as const;

export function renderTopNavigation(props: Readonly<{
  resources?: Pick<AccountResources, "quotaState">;
  session: AccountSession | null;
}>) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/86 backdrop-blur-xl">
      <div className="mx-auto flex min-h-[72px] w-full max-w-[1500px] items-center gap-5 px-5 sm:px-8">
        <BrandLink />
        <nav className="hidden flex-1 justify-center gap-2 md:flex" aria-label="产品导航">
          {TOP_NAV_LINKS.map((item) => <TopNavLink item={item} key={item.href} />)}
        </nav>
        {props.session
          ? renderAuthenticatedTopActions({ resources: props.resources, session: props.session })
          : renderGuestTopActions()}
      </div>
    </header>
  );
}

function BrandLink() {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-3 font-bold text-slate-950" aria-label="Image Studio 首页">
      <span className="grid size-10 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <BrandMark />
      </span>
      <span className="truncate">Image Studio</span>
    </Link>
  );
}

function TopNavLink(props: Readonly<{ item: (typeof TOP_NAV_LINKS)[number] }>) {
  return (
    <Link
      className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950"
      href={props.item.href}
    >
      {props.item.label}
    </Link>
  );
}

function renderGuestTopActions() {
  return (
    <div className="ml-auto flex items-center gap-2">
      <Link
        className="hidden items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 sm:inline-flex"
        href="/#help"
      >
        <HelpCircle className="size-4" />
        帮助中心
      </Link>
      <Link className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm" href="/login?mode=register">
        注册
      </Link>
    </div>
  );
}

function renderAuthenticatedTopActions(props: Readonly<{
  resources?: Pick<AccountResources, "quotaState">;
  session: AccountSession;
}>) {
  return (
    <div className="ml-auto flex items-center gap-2">
      <span className="hidden rounded-full border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800 lg:inline-flex">
        共享额度 {getQuotaValueLabel(props.resources?.quotaState)}
      </span>
      <button className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 sm:inline-flex" type="button">
        <Settings className="size-4" />
        设置
      </button>
      <button className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1.5 pl-1.5 pr-3 text-sm font-semibold text-slate-900 shadow-sm" type="button">
        <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-white">
          {getUserInitial(props.session.user)}
        </span>
        <span className="hidden max-w-28 truncate sm:inline">{getDisplayName(props.session.user)}</span>
        <ChevronDown className="size-4 text-slate-400" />
      </button>
    </div>
  );
}
