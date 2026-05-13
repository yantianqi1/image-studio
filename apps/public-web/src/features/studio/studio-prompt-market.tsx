"use client";

import { memo, useCallback, useEffect } from "react";

import { STUDIO_PRESETS, type StudioPreset } from "@/features/studio/studio-presets";
import styles from "./studio-prompt-market.module.css";

type StudioPromptMarketProps = Readonly<{
  open: boolean;
  onClose: () => void;
  onApply: (preset: StudioPreset) => void;
}>;

export const StudioPromptMarket = memo(function StudioPromptMarket({
  open,
  onClose,
  onApply,
}: StudioPromptMarketProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label="模板市场">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>模板市场</h2>
          <button className={styles.closeButton} onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className={styles.body}>
          <div className={styles.grid}>
            {STUDIO_PRESETS.map((preset) => (
              <PresetCard key={preset.id} preset={preset} onApply={onApply} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});

const PresetCard = memo(function PresetCard({
  preset,
  onApply,
}: Readonly<{
  preset: StudioPreset;
  onApply: (preset: StudioPreset) => void;
}>) {
  const handleApply = useCallback(() => {
    onApply(preset);
  }, [onApply, preset]);

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>{preset.title}</h3>
      <p className={styles.cardHint}>{preset.hint}</p>
      <p className={styles.cardPrompt}>{preset.prompt}</p>
      <button className={styles.applyButton} onClick={handleApply}>
        应用
      </button>
    </div>
  );
});
