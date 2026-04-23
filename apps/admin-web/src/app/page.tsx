import { AppShell } from "@commercial-studio/ui";

const modules = [
  "用户与钱包",
  "激活码",
  "价格配置",
  "Provider",
  "任务监控",
];

export default function Home() {
  return (
    <AppShell
      eyebrow="Admin Web · 7701"
      title="后台运营系统骨架已就位"
      description="这里会承载商业化设置、账务、Provider、价格、任务排查和漫画运营能力。当前阶段先固定信息架构。"
    >
      <div className="grid gap-3 md:grid-cols-5">
        {modules.map((module) => (
          <div key={module} className="rounded-2xl border border-black/10 bg-white/70 p-4">
            <p className="text-sm font-semibold">{module}</p>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
