import Image from "next/image";

import type { AdminImageJob, AdminImageJobResult } from "@/lib/admin-image-job-types";

type ImageJobResultsProps = Readonly<{
  job: AdminImageJob | null;
}>;

export function ImageJobResults({ job }: ImageJobResultsProps) {
  if (!job) {
    return <ResultsEmptyState />;
  }
  if (job.results.length === 0) {
    return <NoResultsState job={job} />;
  }
  return (
    <section className="admin-panel image-job-results-panel">
      <ResultsHeader count={job.results.length} jobId={job.id} />
      <FeaturedResult result={job.results[0]} />
      {job.results.length > 1 ? <ResultThumbGrid results={job.results.slice(1)} /> : null}
    </section>
  );
}

function ResultsHeader({ count, jobId }: Readonly<{ count: number; jobId: number }>) {
  return (
    <div className="image-job-results-header">
      <div>
        <p className="image-job-eyebrow">RESULTS</p>
        <h2>结果图片</h2>
      </div>
      <span>{count} 张</span>
      <small>Job #{jobId}</small>
    </div>
  );
}

function FeaturedResult({ result }: Readonly<{ result: AdminImageJobResult }>) {
  return (
    <figure className="image-job-featured-result">
      <a href={result.asset_url} target="_blank" rel="noreferrer">
        <Image
          alt={`图片任务结果 ${result.result_index}`}
          className="image-job-featured-image"
          height={720}
          src={result.asset_url}
          unoptimized
          width={720}
        />
      </a>
      <figcaption>
        <span>Result #{result.result_index}</span>
        <span>Asset #{result.asset_id}</span>
        <span>Provider Request：{result.provider_request_id ?? "无"}</span>
      </figcaption>
    </figure>
  );
}

function ResultThumbGrid({ results }: Readonly<{ results: readonly AdminImageJobResult[] }>) {
  return (
    <div className="image-job-thumb-grid">
      {results.map((result) => (
        <a href={result.asset_url} key={result.id} target="_blank" rel="noreferrer">
          <Image
            alt={`图片任务结果 ${result.result_index}`}
            height={240}
            src={result.asset_url}
            unoptimized
            width={240}
          />
          <span>#{result.result_index}</span>
        </a>
      ))}
    </div>
  );
}

function NoResultsState({ job }: Readonly<{ job: AdminImageJob }>) {
  return (
    <section className="admin-panel image-job-results-panel">
      <ResultsHeader count={0} jobId={job.id} />
      <div className="image-job-empty-state image-job-empty-result">
        <p>暂无结果图片</p>
        <span>任务还没有写入 image_job_results，失败原因会显示在中间详情区。</span>
      </div>
    </section>
  );
}

function ResultsEmptyState() {
  return (
    <section className="admin-panel image-job-results-panel">
      <div className="image-job-empty-state">
        <p>结果图片区</p>
        <span>选中任务后，这里会固定显示图片，不再被长提示词压到页面底部。</span>
      </div>
    </section>
  );
}
