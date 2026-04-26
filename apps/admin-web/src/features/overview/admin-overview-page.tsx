import Link from "next/link";

import { AdminShell } from "@/features/shell/admin-shell";

const navCards = [
  { href: "/admin/users", label: "用户目录", desc: "查看注册用户基础信息" },
  { href: "/admin/billing", label: "钱包查询", desc: "查余额、看 ledger、执行调账" },
  { href: "/admin/redeem", label: "激活码批次", desc: "创建批次、查看兑换状态" },
  { href: "/admin/providers", label: "Provider 列表", desc: "管理 LLM Provider 与模型定价" },
  { href: "/admin/image-jobs", label: "图片任务", desc: "查看图片任务状态与队列" },
  { href: "/admin/comic-jobs", label: "漫画任务", desc: "查看漫画任务执行状态" },
] as const;

export function AdminOverviewPage() {
  return (
    <AdminShell
      title="后台运营概览"
      description="当前后台已经接上认证、兑换码、Provider、图片任务和漫画任务几个核心入口。"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 col-span-12">
        {navCards.map((item) => (
          <Link key={item.href} href={item.href} className="admin-card text-gray-700 hover:text-gray-900">
            <p className="font-semibold text-sm">{item.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
          </Link>
        ))}
      </div>
    </AdminShell>
  );
}
