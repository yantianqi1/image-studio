/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useState } from "react";

import styles from "./image-preview-dialog.module.css";

export type ImagePreviewDialogImage = Readonly<{
  src: string;
  alt: string;
}>;

type ImagePreviewDialogProps = Readonly<{
  image: ImagePreviewDialogImage | null;
  onClose: () => void;
}>;

const CLOSE_ANIMATION_MS = 150;

export function ImagePreviewDialog({ image, onClose }: ImagePreviewDialogProps) {
  const [closing, setClosing] = useState(false);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      onClose();
    }, CLOSE_ANIMATION_MS);
  }, [onClose]);

  useEffect(() => {
    if (!image) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [image, handleClose]);

  if (!image) return null;

  const backdropClass = closing
    ? `${styles.backdrop} ${styles.backdropClosing}`
    : styles.backdrop;
  const figureClass = closing
    ? `${styles.figure} ${styles.figureClosing}`
    : styles.figure;

  return (
    <div
      className={backdropClass}
      role="dialog"
      aria-modal="true"
      aria-label={`${image.alt} 预览`}
      onClick={handleClose}
    >
      <button
        className={styles.closeButton}
        type="button"
        aria-label="关闭预览"
        onClick={(event) => {
          event.stopPropagation();
          handleClose();
        }}
      >
        ×
      </button>
      <figure className={figureClass} onClick={(event) => event.stopPropagation()}>
        <img className={styles.image} alt={image.alt} src={image.src} />
      </figure>
    </div>
  );
}
