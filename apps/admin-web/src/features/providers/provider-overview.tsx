import { adminApi } from "@/lib/admin-api";

type Provider = Awaited<ReturnType<typeof adminApi.providers>>[number];
type SellableModel = Awaited<ReturnType<typeof adminApi.models>>[number];

export function ProviderOverview({
  models,
  providers,
}: Readonly<{
  models: readonly SellableModel[];
  providers: readonly Provider[];
}>) {
  const publicModels = models.filter((model) => model.public_enabled);
  return (
    <section className="admin-panel">
      <div className="grid gap-4 md:grid-cols-4">
        <OverviewMetric label="供应商" value={`${activeProviderCount(providers)} / ${providers.length}`} />
        <OverviewMetric label="公开模型" value={`${publicModels.length} / ${models.length}`} />
        <OverviewMetric label="可见模型" value={String(publicModels.length)} />
        <OverviewMetric label="图片模型" value={String(models.filter((model) => model.capability === "image").length)} />
      </div>
    </section>
  );
}

function OverviewMetric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="border-l border-gray-200 pl-3">
      <p className="text-xs font-semibold text-gray-400">{label}</p>
      <p className="mt-1 overflow-hidden text-ellipsis text-sm font-bold text-gray-900">{value}</p>
    </div>
  );
}

function activeProviderCount(providers: readonly Provider[]) {
  return providers.filter((provider) => provider.status === "active").length;
}
