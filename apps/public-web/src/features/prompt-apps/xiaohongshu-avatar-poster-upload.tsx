/* eslint-disable @next/next/no-img-element */
import type { GenerationSourceImage, SourceUploadState } from "@/features/home/generation-workbench.types";

import baseStyles from "./prompt-apps.module.css";
import uploadStyles from "./xiaohongshu-avatar-poster-upload.module.css";

const REFERENCE_INPUT_ID = "xiaohongshu-avatar-poster-reference";

export function XiaohongshuAvatarPosterUpload(props: Readonly<{
  sourceImage: GenerationSourceImage | null;
  uploadState: SourceUploadState;
  onClear: () => void;
  onUpload: (file: File) => Promise<void>;
}>) {
  const disabled = props.uploadState.status === "uploading";

  return (
    <div className={`${baseStyles.fieldGroup} ${uploadStyles.referenceUploadField}`}>
      <span>主页截图（必填）</span>
      <div className={uploadStyles.referenceUploadBox}>
        <div className={uploadStyles.referenceUploadMeta}>
          <span className={uploadStyles.referenceUploadTitle}>上传小红书主页图</span>
          <span className={uploadStyles.referenceUploadHint}>用于保留手机屏幕中的个人主页界面、头像区域和红色视觉元素。</span>
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
    <div className={uploadStyles.referenceUploadActions}>
      <label aria-disabled={props.disabled} className={uploadStyles.referenceUploadButton} htmlFor={REFERENCE_INPUT_ID}>
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
      {props.sourceImage ? <button className={uploadStyles.referenceClearButton} type="button" onClick={props.onClear}>移除</button> : null}
    </div>
  );
}

function SourcePreview({ sourceImage }: Readonly<{ sourceImage: GenerationSourceImage }>) {
  return (
    <div className={uploadStyles.referencePreview}>
      <img alt="小红书主页截图" src={sourceImage.assetUrl} />
      <div className={uploadStyles.referencePreviewCopy}>
        <span className={uploadStyles.referencePreviewName}>主页截图已上传</span>
        <span className={uploadStyles.referencePreviewDetail}>{sourceImage.mimeType ?? "image"}</span>
      </div>
    </div>
  );
}

function UploadStatus({ uploadState }: Readonly<{ uploadState: SourceUploadState }>) {
  if (uploadState.status === "uploading") {
    return <span className={uploadStyles.referenceUploadHint}>正在上传主页截图。</span>;
  }
  if (uploadState.status === "error") {
    return <span className={uploadStyles.referenceUploadError}>{uploadState.message}</span>;
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
