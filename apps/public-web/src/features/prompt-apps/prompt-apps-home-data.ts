import type { PromptAppCover } from "./prompt-apps";

export type PromptAppCard = Readonly<{
  cover: PromptAppCardCover;
  description: string;
  href: string;
  statusLabel: string;
  title: string;
}>;

export type PromptAppCardCover = PromptAppCover;

export function buildPromptAppCenterCards(apps: readonly PromptAppCard[]): readonly PromptAppCard[] {
  return apps.map((app) => ({
    cover: app.cover,
    description: app.description,
    href: app.href,
    statusLabel: app.statusLabel,
    title: app.title,
  }));
}
