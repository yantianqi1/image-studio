import Link from "next/link";

import { AdminShell } from "@/features/shell/admin-shell";

const navCards = [
  {
    href: "/admin/users",
    label: "用户目录",
    desc: "查看注册用户基础信息",
    cover: { accent: "#0f172a", badge: "USERS", title: "用户档案" },
  },
  {
    href: "/admin/billing",
    label: "钱包查询",
    desc: "查余额、看 ledger、执行调账",
    cover: { accent: "#7c2d12", badge: "BALANCE", title: "资金面板" },
  },
  {
    href: "/admin/redeem",
    label: "激活码批次",
    desc: "创建批次、查看兑换状态",
    cover: { accent: "#0f766e", badge: "REDEEM", title: "兑换批次" },
  },
  {
    href: "/admin/providers",
    label: "Provider 列表",
    desc: "管理 LLM Provider 与模型定价",
    cover: { accent: "#1d4ed8", badge: "LLM", title: "模型供应" },
  },
  {
    href: "/admin/image-jobs",
    label: "图片任务",
    desc: "查看图片任务状态与队列",
    cover: { accent: "#6d28d9", badge: "IMAGE", title: "图片队列" },
  },
  {
    href: "/admin/comic-jobs",
    label: "漫画任务",
    desc: "查看漫画任务执行状态",
    cover: { accent: "#be123c", badge: "COMIC", title: "漫画流水线" },
  },
] as const;

export function AdminOverviewPage() {
  return (
    <AdminShell
      title="后台应用中心"
      description="以九宫格预览所有应用入口，直接进入用户、钱包、兑换码、Provider、图片任务和漫画任务管理。"
    >
      <div className="col-span-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {navCards.map((item) => (
          <OverviewAppCard key={item.href} item={item} />
        ))}
      </div>
    </AdminShell>
  );
}

function OverviewAppCard({
  item,
}: Readonly<{
  item: (typeof navCards)[number];
}>) {
  return (
    <Link href={item.href} className="group admin-card flex h-full flex-col gap-4 overflow-hidden p-3 text-gray-700 hover:text-gray-900">
      <AppCover badge={item.cover.badge} title={item.cover.title} accent={item.cover.accent} />
      <div className="grid gap-1 px-1 pb-1">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-sm font-semibold text-gray-950">{item.label}</p>
          <span className="shrink-0 rounded-full border border-black/5 bg-black/[0.03] px-2 py-1 text-[11px] font-semibold text-gray-500 transition-colors group-hover:bg-black/[0.05]">
            打开
          </span>
        </div>
        <p className="text-xs leading-5 text-gray-500">{item.desc}</p>
      </div>
    </Link>
  );
}

function AppCover({
  accent,
  badge,
  title,
}: Readonly<{
  accent: string;
  badge: string;
  title: string;
}>) {
  const overlayStyle = { background: `linear-gradient(135deg, ${accent} 0%, #111827 100%)` };

  return (
    <div className="relative aspect-[16/10] overflow-hidden rounded-[1rem] border border-white/50 bg-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" style={overlayStyle}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.24),transparent_28%),radial-gradient(circle_at_82%_14%,rgba(255,255,255,0.12),transparent_26%)]" />
      <div className="absolute inset-x-4 top-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-white/90" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/55" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/35" />
        </div>
        <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/85">
          {badge}
        </span>
      </div>
      <div className="absolute inset-x-4 bottom-4 rounded-[0.9rem] border border-white/18 bg-white/12 p-3 backdrop-blur-md">
        <div className="grid gap-2">
          <p className="text-sm font-semibold text-white">{title}</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="h-10 rounded-lg bg-white/18" />
            <div className="h-10 rounded-lg bg-white/24" />
            <div className="h-10 rounded-lg bg-white/14" />
          </div>
        </div>
      </div>
      <div className="absolute right-4 top-14 grid gap-2">
        <div className="h-16 w-12 rounded-2xl border border-white/12 bg-white/10" />
        <div className="h-16 w-12 rounded-2xl border border-white/12 bg-white/20 translate-x-3" />
      </div>
    </div>
  );
}
