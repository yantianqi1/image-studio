export type PromptAppCard = Readonly<{
  description: string;
  href: string;
  statusLabel: string;
  title: string;
}>;

export function buildPromptAppCenterCards(apps: readonly PromptAppCard[]): readonly PromptAppCard[] {
  return apps.map((app) => ({
    description: app.description,
    href: app.href,
    statusLabel: app.statusLabel,
    title: app.title,
  }));
}
