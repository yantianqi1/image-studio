/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect } from "react";

import styles from "./image-preview-dialog.module.css";

export type ImagePreviewDialogImage = Readonly<{
  src: string;
  alt: string;
}>;

type ImagePreviewDialogProps = Readonly<{
  image: ImagePreviewDialogImage | null;
  onClose: () => void;
}>;

export function ImagePreviewDialog({ image, onClose }: ImagePreviewDialogProps) {
  useEffect(() => {
    if (!image) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [image, onClose]);

  if (!image) {
    return null;
  }

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label={`${image.alt} 预览`}
      onClick={onClose}
    >
      <button
        className={styles.closeButton}
        type="button"
        aria-label="关闭预览"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        ×
      </button>
      <figure
        className={styles.figure}
        onClick={(event) => event.stopPropagation()}
      >
        <img className={styles.image} alt={image.alt} src={image.src} />
      </figure>
    </div>
  );
}
