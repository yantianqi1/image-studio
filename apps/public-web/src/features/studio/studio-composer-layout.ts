export type ComposerLayoutMetrics = Readonly<{
  position: string;
  top: number;
  viewportHeight: number;
}>;

export function resolveFixedComposerHeight(metrics: ComposerLayoutMetrics): number {
  if (metrics.position !== "fixed") {
    return 0;
  }
  return Math.max(0, Math.ceil(metrics.viewportHeight - metrics.top));
}
