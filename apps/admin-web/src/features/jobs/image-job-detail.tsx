import { StatusPill } from "@/features/ui/status-pill";
import type { AdminImageJob } from "@/lib/admin-image-job-types";

import { formatJobCents, formatJobDateTime, formatJobOwner } from "./image-job-format";

type ImageJobDetailProps = Readonly<{
  job: AdminImageJob | null;
}>;

type DetailItem = Readonly<{
  label: string;
  value: string;
}>;

export function ImageJobDetail({ job }: ImageJobDetailProps) {
  if (!job) {
    return <DetailEmptyState />;
  }
  return (
    <section className="admin-panel image-job-detail-panel">
      <DetailHeader job={job} />
      <MetaGrid items={buildDetailItems(job)} />
      {job.error_code || job.error_message ? <ErrorDetail job={job} /> : null}
      <PromptBlock label="完整提示词" value={job.prompt} />
      <RevisedPromptBlock job={job} />
    </section>
  );
}

function DetailHeader({ job }: Readonly<{ job: AdminImageJob }>) {
  return (
    <div className="image-job-detail-header">
      <div>
        <p className="image-job-eyebrow">IMAGE JOB #{job.id}</p>
        <h2>任务详情</h2>
      </div>
      <StatusPill status={job.status} />
    </div>
  );
}

function MetaGrid({ items }: Readonly<{ items: readonly DetailItem[] }>) {
  return (
    <dl className="image-job-meta-grid">
      {items.map((item) => (
        <div className="image-job-meta-item" key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ErrorDetail({ job }: Readonly<{ job: AdminImageJob }>) {
  return (
    <section className="image-job-error-block">
      <h3>失败信息</h3>
      <p>{job.error_code ?? "unknown"} · {job.error_message ?? "无错误详情"}</p>
    </section>
  );
}

function PromptBlock({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <section className="image-job-prompt-block">
      <h3>{label}</h3>
      <pre>{value}</pre>
    </section>
  );
}

function RevisedPromptBlock({ job }: Readonly<{ job: AdminImageJob }>) {
  const prompts = collectRevisedPrompts(job);
  if (prompts.length === 0) {
    return null;
  }
  return (
    <section className="image-job-prompt-block image-job-revised-block">
      <h3>供应商修订提示词</h3>
      {prompts.map((prompt, index) => (
        <pre key={`${index}-${prompt.slice(0, 16)}`}>{prompt}</pre>
      ))}
    </section>
  );
}

function DetailEmptyState() {
  return (
    <section className="admin-panel image-job-detail-panel">
      <div className="image-job-empty-state">
        <p>选择一个任务</p>
        <span>点击左侧日志条目后，这里会显示完整提示词、计费、用户和错误信息。</span>
      </div>
    </section>
  );
}

function buildDetailItems(job: AdminImageJob): readonly DetailItem[] {
  return [
    { label: "用户", value: formatJobOwner(job.user_id) },
    { label: "来源", value: `${job.source} / ${job.mode}` },
    { label: "模型", value: job.model_code },
    { label: "Provider", value: job.provider_model ?? "未绑定" },
    { label: "数量", value: String(job.requested_count) },
    { label: "扣费", value: formatJobCents(job.charge_cents) },
    { label: "尝试", value: `${job.attempt_count}/${job.max_attempts}` },
    { label: "创建", value: formatJobDateTime(job.created_at) },
    { label: "完成", value: formatJobDateTime(job.finished_at) },
  ];
}

function collectRevisedPrompts(job: AdminImageJob): readonly string[] {
  const prompts = job.results
    .map((result) => result.revised_prompt?.trim() ?? "")
    .filter(Boolean);
  return Array.from(new Set(prompts));
}
