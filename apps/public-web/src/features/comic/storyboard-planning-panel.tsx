import type { StoryboardShot } from "./comic-utils";

import { EmptyState, StatusBadge, statusDescription, toStatusTone } from "./comic-status";
import layout from "./comic-workspace.module.css";
import styles from "./comic-storyboard.module.css";

type StoryboardPlanningPanelProps = Readonly<{
  shots: readonly StoryboardShot[];
  selectedShotId: string | null;
  status: string;
  onSelectShot: (shotId: string) => void;
}>;

const STEPS = ["剧情分析", "人物设定", "角色参考图", "分镜生成", "漫画页面生成"] as const;

export function StoryboardPlanningPanel(props: StoryboardPlanningPanelProps) {
  return (
    <section className={layout.panel}>
      <div className={layout.panelHeader}>
        <div>
          <p className={layout.eyebrow}>LLM Agent</p>
          <h2>分镜规划</h2>
        </div>
        <StatusBadge status={props.status} />
      </div>
      <StoryboardStepProgress status={props.status} />
      <div className={styles.storyboardList}>
        {props.shots.length === 0 ? (
          <EmptyState
            title="暂无分镜"
            description={statusDescription(props.status)}
            icon="▦"
          />
        ) : (
          props.shots.map((shot) => (
            <StoryboardShotCard
              key={shot.id}
              shot={shot}
              active={shot.id === props.selectedShotId}
              onSelect={props.onSelectShot}
            />
          ))
        )}
      </div>
      <div className={styles.panelFooter}>
        <button className={layout.ghostButton} type="button" disabled title="UI 占位，待接入分镜重生成接口">
          重新生成分镜
        </button>
      </div>
    </section>
  );
}

function StoryboardStepProgress({ status }: Readonly<{ status: string }>) {
  const activeIndex = getActiveStepIndex(status);

  return (
    <div className={styles.stepTrack}>
      {STEPS.map((step, index) => {
        const state = index < activeIndex ? "done" : index === activeIndex ? "active" : "idle";
        return (
          <div className={styles.stepItem} data-state={state} key={step}>
            <span>{index + 1}</span>
            <p>{step}</p>
          </div>
        );
      })}
    </div>
  );
}

function StoryboardShotCard(props: Readonly<{
  shot: StoryboardShot;
  active: boolean;
  onSelect: (shotId: string) => void;
}>) {
  return (
    <button
      className={`${styles.shotCard} ${props.active ? styles.shotCardActive : ""}`}
      type="button"
      onClick={() => props.onSelect(props.shot.id)}
    >
      <ShotPromptPreview shot={props.shot} />
      <div className={styles.shotCopy}>
        <div className={styles.shotTitleRow}>
          <span>{String(props.shot.index).padStart(2, "0")}</span>
          <strong>{props.shot.shotType}</strong>
          <ShotStatus status={props.shot.status} />
        </div>
        <p>{props.shot.description}</p>
        <small>{props.shot.scene} · 镜头时长 {props.shot.duration}</small>
      </div>
    </button>
  );
}

function ShotPromptPreview({ shot }: Readonly<{ shot: StoryboardShot }>) {
  const prompt = shot.promptText?.trim() || "提示词待生成";
  return (
    <div className={styles.shotPrompt}>
      <span>上游提示词</span>
      <p>{prompt}</p>
    </div>
  );
}

function ShotStatus({ status }: Readonly<{ status: string }>) {
  const tone = toStatusTone(status);
  const symbol = tone === "success" ? "✓" : tone === "failed" ? "!" : tone === "generating" ? "◌" : "•";
  return <em className={`${layout.shotStatus} ${layout[`status_${tone}`]}`}>{symbol}</em>;
}

function getActiveStepIndex(status: string): number {
  if (status === "page_image_generating" || status === "completed") return 4;
  if (status === "character_reference_ready") return 3;
  if (status === "character_reference_generating" || status === "character_reference_pending") return 2;
  if (["storyboarding", "prompt_composing"].includes(status)) return 3;
  if (status === "character_designing") return 2;
  if (["llm_processing", "task_started", "story_analyzing"].includes(status)) return 1;
  if (status === "task_queued" || status === "submitting") return 0;
  return 0;
}
