import type { Dispatch, SetStateAction } from "react";

import type { ImageFormState } from "@/features/home/generation-workbench.types";
import styles from "./generation-visibility-field.module.css";

const VISIBILITY_OPTIONS: readonly Readonly<{
  value: ImageFormState["visibility"];
  label: string;
  description: string;
}>[] = [
  { value: "private", label: "私有保存", description: "只进入我的图库" },
  { value: "public", label: "公开展示", description: "生成后进入公共瀑布流" },
];

export function GenerationVisibilityField({
  form,
  onFormChange,
}: Readonly<{
  form: ImageFormState;
  onFormChange: Dispatch<SetStateAction<ImageFormState>>;
}>) {
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium text-gray-900">图库</p>
      <div className={styles.visibilityGroup}>
        {VISIBILITY_OPTIONS.map((option) => (
          <button
            key={option.value}
            aria-pressed={form.visibility === option.value}
            className={getVisibilityOptionClass(form.visibility === option.value)}
            type="button"
            onClick={() => onFormChange((current) => ({ ...current, visibility: option.value }))}
          >
            <span>{option.label}</span>
            <small>{option.description}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function getVisibilityOptionClass(active: boolean) {
  return active
    ? `${styles.visibilityOption} ${styles.visibilityOptionActive}`
    : styles.visibilityOption;
}
