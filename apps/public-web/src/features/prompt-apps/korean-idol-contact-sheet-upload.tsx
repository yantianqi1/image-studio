/* eslint-disable @next/next/no-img-element */
import type { GenerationSourceImage, SourceUploadState } from "@/features/home/generation-workbench.types";

import uploadStyles from "./korean-idol-contact-sheet-app.module.css";
import styles from "./prompt-apps.module.css";

const REFERENCE_INPUT_ID = "korean-idol-contact-sheet-reference";

export function ReferenceImageField(props: Readonly<{
  sourceImage: GenerationSourceImage | null;
  uploadState: SourceUploadState;
  onClear: () => void;
  onUpload: (file: File) => Promise<void>;
}>) {
  const disabled = props.uploadState.status === "uploading";

  return (
    <div className={`${styles.fieldGroup} ${uploadStyles.uploadField}`}>
      <span>参考图（可选）</span>
      <div className={uploadStyles.uploadBox}>
        <div className={uploadStyles.uploadMeta}>
          <span className={uploadStyles.uploadTitle}>上传人物参考图</span>
          <span className={uploadStyles.uploadHint}>上传后用于保持九张照片中的脸部、发型与整体身份一致；不上传则生成原创人物。</span>
        </div>
        {props.sourceImage ? <SourcePreview sourceImage={props.sourceImage} /> : null}
        <UploadActions disabled={disabled} sourceImage={props.sourceImage} onClear={props.onClear} onUpload={props.onUpload} />
        <UploadStatus uploadState={props.uploadState} />
      </div>
    </div>
  );
}

function UploadActions(props: Readonly<{
  disabled: boolean;
  sourceImage: GenerationSourceImage | null;
  onClear: () => void;
  onUpload: (file: File) => Promise<void>;
}>) {
  return (
    <div className={uploadStyles.uploadActions}>
      <label aria-disabled={props.disabled} className={uploadStyles.uploadButton} htmlFor={REFERENCE_INPUT_ID}>
        {props.disabled ? "上传中" : props.sourceImage ? "更换图片" : "选择图片"}
        <input
          accept="image/*"
          className="sr-only"
          disabled={props.disabled}
          id={REFERENCE_INPUT_ID}
          type="file"
          onChange={(event) => handleFileInputChange(event.currentTarget, props.onUpload)}
        />
      </label>
      {props.sourceImage ? <button className={uploadStyles.clearButton} type="button" onClick={props.onClear}>移除</button> : null}
    </div>
  );
}

function SourcePreview({ sourceImage }: Readonly<{ sourceImage: GenerationSourceImage }>) {
  return (
    <div className={uploadStyles.preview}>
      <img alt="九宫格写真参考图" src={sourceImage.assetUrl} />
      <div className={uploadStyles.previewCopy}>
        <span className={uploadStyles.previewName}>参考图已上传</span>
        <span className={uploadStyles.previewDetail}>{sourceImage.mimeType ?? "image"}</span>
      </div>
    </div>
  );
}

function UploadStatus({ uploadState }: Readonly<{ uploadState: SourceUploadState }>) {
  if (uploadState.status === "uploading") {
    return <span className={uploadStyles.uploadHint}>正在上传参考图。</span>;
  }
  if (uploadState.status === "error") {
    return <span className={uploadStyles.uploadError}>{uploadState.message}</span>;
  }
  return null;
}

function handleFileInputChange(input: HTMLInputElement, onUpload: (file: File) => Promise<void>) {
  const file = input.files?.[0];
  input.value = "";
  if (!file) {
    return;
  }
  void onUpload(file);
}
