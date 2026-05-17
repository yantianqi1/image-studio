"use client";

import styles from "./prompt-crafter-drawer.module.css";

type PromptCrafterFabProps = Readonly<{
  onClick: () => void;
  onPrefetch?: () => void;
}>;

export function PromptCrafterFab({ onClick, onPrefetch }: PromptCrafterFabProps) {
  return (
    <button
      aria-label="打开提示词工坊"
      className={styles.fab}
      type="button"
      onClick={onClick}
      onFocus={onPrefetch}
      onPointerEnter={onPrefetch}
    >
      <span aria-hidden="true" className={styles.fabIcon}>✦</span>
    </button>
  );
}
