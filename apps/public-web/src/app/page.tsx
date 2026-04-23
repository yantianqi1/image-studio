import { AppShell } from "@commercial-studio/ui";

const modules = [
  "公开生图",
  "用户登录",
  "钱包兑换",
  "漫画工作台",
  "任务中心",
];

export default function Home() {
  return (
    <AppShell
      eyebrow="Public Web · 7700"
      title="用户端创作站骨架已就位"
      description="这里会承载公开生图、钱包兑换和漫画创作工作台。当前阶段只保留清晰入口，业务实现交给后续领域批次。"
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
