import type { StoryboardShot } from "./comic-utils";

const DEFAULT_PROJECT_TITLE = "漫画项目";
const FIRST_PAGE_INDEX = 1;
const INVALID_FILENAME_PATTERN = /[<>:"/\\|?*\u0000-\u001f]/g;
const TRAILING_DOTS_PATTERN = /\.+$/g;
const WHITESPACE_PATTERN = /\s+/g;

export type ShotDirection = "previous" | "next";

type AdjacentShotOptions = Readonly<{
  shots: readonly Pick<StoryboardShot, "id">[];
  selectedShotId: string | null;
  direction: ShotDirection;
}>;

type ImageNameOptions = Readonly<{
  projectTitle: string;
  index: number;
}>;

export function selectAdjacentShotId(options: AdjacentShotOptions): string | null {
  const selectedIndex = findSelectedShotIndex(options.shots, options.selectedShotId);
  const nextIndex = options.direction === "previous" ? selectedIndex - FIRST_PAGE_INDEX : selectedIndex + FIRST_PAGE_INDEX;
  return options.shots[nextIndex]?.id ?? null;
}

export function canSelectAdjacentShot(options: AdjacentShotOptions): boolean {
  return selectAdjacentShotId(options) !== null;
}

export function buildSequentialImageName(options: ImageNameOptions): string {
  if (!Number.isInteger(options.index) || options.index < FIRST_PAGE_INDEX) {
    throw new Error(`invalid comic page index: ${options.index}`);
  }
  return `${sanitizeDownloadBaseName(options.projectTitle)}-${options.index}`;
}

export function buildStitchedImageName(projectTitle: string): string {
  return sanitizeDownloadBaseName(projectTitle);
}

export function getExportableShots(shots: readonly StoryboardShot[]): readonly StoryboardShot[] {
  return shots.filter((shot) => typeof shot.assetUrl === "string" && shot.assetUrl.length > 0);
}

export function resolveProjectTitle(projectTitle: string | null | undefined): string {
  const normalizedTitle = (projectTitle ?? "").trim().replace(WHITESPACE_PATTERN, " ");
  return normalizedTitle || DEFAULT_PROJECT_TITLE;
}

function sanitizeDownloadBaseName(value: string): string {
  const cleaned = resolveProjectTitle(value)
    .replace(INVALID_FILENAME_PATTERN, "-")
    .replace(TRAILING_DOTS_PATTERN, "")
    .trim();
  return cleaned || DEFAULT_PROJECT_TITLE;
}

function findSelectedShotIndex(shots: readonly Pick<StoryboardShot, "id">[], selectedShotId: string | null): number {
  const foundIndex = shots.findIndex((shot) => shot.id === selectedShotId);
  return foundIndex >= 0 ? foundIndex : 0;
}
