import Link from "next/link";

import { AdminShell } from "@/features/shell/admin-shell";

type OverviewItem = Readonly<{
  href: string;
  label: string;
  detail: string;
  token: string;
}>;

type OverviewSection = Readonly<{
  group: string;
  description: string;
  items: readonly OverviewItem[];
}>;

const shortcuts = [
  { href: "/admin/users", label: "用户检索", detail: "搜索、查看、进入详情", token: "users" },
  { href: "/admin/billing", label: "余额核查", detail: "钱包、ledger、调账", token: "money" },
  { href: "/admin/image-jobs", label: "图片队列", detail: "任务状态与结果图", token: "image" },
  { href: "/admin/providers", label: "模型定价", detail: "Provider 与模型配置", token: "llm" },
] as const satisfies readonly OverviewItem[];

const overviewSections = [
  {
    group: "Overview",
    description: "后台入口和关键操作的集中视图。",
    items: [{ href: "/admin", label: "后台概览", detail: "当前页面与导航分组", token: "home" }],
  },
  {
    group: "Users & Money",
    description: "用户、钱包和兑换码归在同一操作域。",
    items: [
      { href: "/admin/users", label: "用户目录", detail: "真实用户记录、状态与后续详情抽屉", token: "users" },
      { href: "/admin/billing", label: "计费面板", detail: "按用户查看余额、ledger 和调账入口", token: "wallet" },
      { href: "/admin/redeem", label: "激活码", detail: "批次创建、兑换状态和到账金额", token: "redeem" },
    ],
  },
  {
    group: "Models & Work",
    description: "供应商配置和长任务监控放在同一工作面。",
    items: [
      { href: "/admin/providers", label: "Provider 与模型", detail: "供应商、上游模型导入和价格", token: "models" },
      { href: "/admin/image-jobs", label: "图片任务", detail: "图片生成队列、结果和 worker 告警", token: "image" },
      { href: "/admin/comic-jobs", label: "漫画任务", detail: "漫画任务状态和项目执行线索", token: "comic" },
      { href: "/admin/gallery", label: "公开图库", detail: "浏览、下架或删除公开分享的图片", token: "gallery" },
    ],
  },
  {
    group: "System",
    description: "全局开关与后台运行策略。",
    items: [{ href: "/admin/settings", label: "站点设置", detail: "注册、匿名生图和上传等开关", token: "settings" }],
  },
] as const satisfies readonly OverviewSection[];

export function AdminOverviewPage() {
  return (
    <AdminShell title="后台概览" description="按操作域组织后台入口，减少在用户、计费、模型和任务之间来回查找。">
      <ShortcutGrid />
      <section className="col-span-12 grid grid-cols-1 gap-3 xl:grid-cols-4">
        {overviewSections.map((section) => (
          <OverviewGroup key={section.group} section={section} />
        ))}
      </section>
    </AdminShell>
  );
}

function ShortcutGrid() {
  return (
    <section className="col-span-12 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
      {shortcuts.map((item) => (
        <ShortcutLink key={item.href} item={item} />
      ))}
    </section>
  );
}

function ShortcutLink({ item }: Readonly<{ item: OverviewItem }>) {
  return (
    <Link href={item.href} className="admin-card flex items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-gray-950">{item.label}</span>
        <span className="mt-0.5 block truncate text-xs text-gray-500">{item.detail}</span>
      </span>
      <span className="shrink-0 text-xs font-semibold text-gray-400">{item.token}</span>
    </Link>
  );
}

function OverviewGroup({ section }: Readonly<{ section: OverviewSection }>) {
  return (
    <section className="admin-panel">
      <div className="min-h-[52px] border-b border-[var(--admin-border)] pb-3">
        <h2 className="text-sm font-semibold text-gray-950">{section.group}</h2>
        <p className="mt-1 text-xs leading-5 text-gray-500">{section.description}</p>
      </div>
      <div className="pt-3">
        {section.items.map((item) => (
          <OverviewRow key={item.href} item={item} />
        ))}
      </div>
    </section>
  );
}

function OverviewRow({ item }: Readonly<{ item: OverviewItem }>) {
  return (
    <Link href={item.href} className="admin-list-row text-gray-700 hover:text-gray-950">
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{item.label}</span>
        <span className="mt-0.5 block truncate text-xs text-gray-500">{item.detail}</span>
      </span>
      <span className="shrink-0 text-xs font-semibold text-gray-400">{item.token}</span>
    </Link>
  );
}
