export type ResultsViewportSnapshot = Readonly<{
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
}>;

const BOTTOM_PIN_THRESHOLD_PX = 24;

export function captureResultsViewportSnapshot(element: HTMLElement): ResultsViewportSnapshot {
  return {
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  };
}

export function capturePinnedResultsViewportSnapshot(element: HTMLElement): ResultsViewportSnapshot {
  return {
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: Math.max(0, element.scrollHeight - element.clientHeight),
  };
}

export function shouldScrollResultsToBottom(input: Readonly<{
  hasLayoutChanged: boolean;
  hasNewTurn: boolean;
  previousViewport: ResultsViewportSnapshot | null;
}>): boolean {
  if (input.hasNewTurn) {
    return true;
  }
  if (!input.hasLayoutChanged) {
    return false;
  }
  return isViewportPinnedToBottom(input.previousViewport);
}

function isViewportPinnedToBottom(snapshot: ResultsViewportSnapshot | null): boolean {
  if (!snapshot) {
    return false;
  }
  return snapshot.scrollHeight - snapshot.scrollTop - snapshot.clientHeight <= BOTTOM_PIN_THRESHOLD_PX;
}
