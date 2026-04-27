import { ErrorState, StatusBadge, statusDescription } from "./comic-status";
import { CHARACTER_REFERENCE_MODE_OPTIONS, type CharacterReferenceMode } from "./character-reference-modes";
import { COMIC_STYLE_PRESETS, type ComicStylePresetId } from "./comic-style-presets";
import { PROJECT_TITLE_LIMIT } from "./comic-utils";
import type { ComicWorkflowEvent } from "./comic-workflow-events";
import layout from "./comic-workspace.module.css";
import styles from "./comic-project.module.css";
import referenceStyles from "./comic-reference-mode.module.css";

type CreateState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "submitting" }>
  | Readonly<{ status: "error"; message: string }>
  | Readonly<{ status: "success"; title: string; projectId: string }>;

type MangaProjectPanelProps = Readonly<{
  title: string;
  premise: string;
  stylePresetId: ComicStylePresetId;
  characterReferenceMode: CharacterReferenceMode;
  referencePackFileName: string | null;
  referencePackStatus: "idle" | "exporting" | "importing" | "error" | "success";
  referencePackMessage?: string;
  workflowStatus: string;
  workflowError?: string;
  workflowEvents: readonly ComicWorkflowEvent[];
  createState: CreateState;
  onTitleChange: (value: string) => void;
  onPremiseChange: (value: string) => void;
  onStylePresetChange: (value: ComicStylePresetId) => void;
  onCharacterReferenceModeChange: (value: CharacterReferenceMode) => void;
  onReferencePackFileChange: (value: File | null) => void;
  onExportReferencePack: () => void;
  onImportReferencePack: () => void;
  onCreateProject: (event: React.FormEvent<HTMLFormElement>) => void;
}>;

export function MangaProjectPanel(props: MangaProjectPanelProps) {
  return (
    <aside className={layout.panel}>
      <div className={layout.panelScroll}>
        <CreateProjectCard {...props} />
      </div>
    </aside>
  );
}

function CreateProjectCard(props: MangaProjectPanelProps) {
  const isSubmitting = props.createState.status === "submitting";

  return (
    <section className={styles.innerCard}>
      <form className={styles.formStack} onSubmit={props.onCreateProject}>
        <TextInput
          label="项目标题"
          value={props.title}
          maxLength={PROJECT_TITLE_LIMIT}
          placeholder="潮汐侦探社：迷雾之城"
          onChange={props.onTitleChange}
        />
        <PremiseInput
          value={props.premise}
          onChange={props.onPremiseChange}
        />
        <StylePresetSelect
          value={props.stylePresetId}
          onChange={props.onStylePresetChange}
        />
        <ReferenceModeSelect
          value={props.characterReferenceMode}
          onChange={props.onCharacterReferenceModeChange}
        />
        <ReferencePackControls {...props} />
        <button className={styles.primaryButton} type="submit" disabled={isSubmitting}>
          {isSubmitting ? "创建中..." : "创建项目"}
        </button>
      </form>
      <CreateFeedback errorMessage={props.workflowError} state={props.createState} status={props.workflowStatus} />
      <WorkflowEventStream events={props.workflowEvents} />
    </section>
  );
}

function TextInput(props: Readonly<{
  label: string;
  value: string;
  maxLength: number;
  placeholder: string;
  onChange: (value: string) => void;
}>) {
  const inputId = "comic-project-title";
  return (
    <div className={styles.fieldGroup}>
      <label htmlFor={inputId}>{props.label}</label>
      <input
        className={styles.textInput}
        id={inputId}
        maxLength={props.maxLength}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        required
        value={props.value}
      />
      <em>{props.value.length} / {props.maxLength}</em>
    </div>
  );
}

function PremiseInput(props: Readonly<{
  value: string;
  onChange: (value: string) => void;
}>) {
  const textareaId = "comic-project-premise";
  return (
    <div className={styles.fieldGroup}>
      <span className={styles.fieldHeader}>
        <label htmlFor={textareaId}>企划概述</label>
        <button className={styles.assistButton} type="button" disabled title="UI 占位，待接入 AI 助写接口">
          AI 助写
        </button>
      </span>
      <textarea
        className={styles.textArea}
        id={textareaId}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder="粘贴完整章节剧情，系统会按剧情容量自动拆成多张漫画页"
        required
        value={props.value}
      />
      <em>{props.value.length} 字</em>
    </div>
  );
}

function StylePresetSelect(props: Readonly<{
  value: ComicStylePresetId;
  onChange: (value: ComicStylePresetId) => void;
}>) {
  return (
    <label className={styles.fieldGroup} htmlFor="comic-style-preset">
      漫画风格
      <select
        className={styles.selectInput}
        id="comic-style-preset"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value as ComicStylePresetId)}
      >
        {COMIC_STYLE_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.labelZh}（{preset.labelEn}）
          </option>
        ))}
      </select>
      <small>{COMIC_STYLE_PRESETS.find((item) => item.id === props.value)?.bestFor}</small>
    </label>
  );
}

function ReferenceModeSelect(props: Readonly<{
  value: CharacterReferenceMode;
  onChange: (value: CharacterReferenceMode) => void;
}>) {
  return (
    <div className={styles.fieldGroup}>
      <span>角色参考模式</span>
      <div className={referenceStyles.referenceModeGrid}>
        {CHARACTER_REFERENCE_MODE_OPTIONS.map((option) => (
          <button
            className={referenceStyles.referenceModeOption}
            key={option.value}
            type="button"
            data-active={props.value === option.value ? "true" : "false"}
            onClick={() => props.onChange(option.value)}
          >
            <span className={referenceStyles.referenceModeMarker} aria-hidden="true" />
            <span className={referenceStyles.referenceModeText}>
              <span>{option.label}</span>
              <small>{option.detail}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ReferencePackControls(props: MangaProjectPanelProps) {
  const busy = props.referencePackStatus === "exporting" || props.referencePackStatus === "importing";
  return (
    <div className={styles.fieldGroup}>
      <span>人设图包</span>
      <div className={styles.packActionRow}>
        <label className={styles.secondaryButton} htmlFor="comic-character-pack-file">
          选择 zip
        </label>
        <input
          accept=".zip,application/zip"
          className={styles.fileInput}
          id="comic-character-pack-file"
          type="file"
          onChange={(event) => props.onReferencePackFileChange(event.target.files?.[0] ?? null)}
        />
        <button type="button" disabled={busy || !props.referencePackFileName} onClick={props.onImportReferencePack}>
          {props.referencePackStatus === "importing" ? "导入中" : "导入"}
        </button>
        <button type="button" disabled={busy} onClick={props.onExportReferencePack}>
          {props.referencePackStatus === "exporting" ? "导出中" : "导出"}
        </button>
      </div>
      {props.referencePackFileName ? <small>{props.referencePackFileName}</small> : null}
      {props.referencePackMessage ? (
        <small data-tone={props.referencePackStatus}>{props.referencePackMessage}</small>
      ) : null}
    </div>
  );
}

function CreateFeedback({ errorMessage, state, status }: Readonly<{
  errorMessage?: string;
  state: CreateState;
  status: string;
}>) {
  if (state.status === "error") {
    return <ErrorState title="漫创流程失败" message={state.message} />;
  }
  if (state.status === "idle") {
    return null;
  }
  return (
    <div className={styles.workflowNote}>
      <span className={styles.workflowHeader}>
        <StatusBadge status={status} />
        <small>{state.status === "success" ? `ID: ${state.projectId}` : "正在创建项目"}</small>
      </span>
      <strong>{state.status === "success" ? state.title : "任务提交中"}</strong>
      <p>{errorMessage ?? statusDescription(status)}</p>
    </div>
  );
}

function WorkflowEventStream({ events }: Readonly<{ events: readonly ComicWorkflowEvent[] }>) {
  if (events.length === 0) {
    return null;
  }
  return (
    <div className={styles.eventStream}>
      <div className={styles.eventStreamHeader}>
        <span>实时执行日志</span>
        <small>{events.length} 条</small>
      </div>
      <ol>
        {events.map((event) => (
          <li className={styles.eventItem} data-tone={event.tone} key={`${event.sequence}-${event.key}`}>
            <span>{event.sequence}</span>
            <div>
              <strong>{event.title}</strong>
              <p>{event.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
