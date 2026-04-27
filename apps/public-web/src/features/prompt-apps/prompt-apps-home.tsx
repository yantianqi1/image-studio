import Link from "next/link";

import { AppShell } from "@/features/shell/app-shell";

import { PROMPT_APPS } from "./prompt-apps";
import { buildPromptAppCenterCards } from "./prompt-apps-home-data";
import styles from "./prompt-apps-home.module.css";

export function PromptAppsHome() {
  const cards = buildPromptAppCenterCards(PROMPT_APPS);

  return (
    <AppShell
      activeHref="/apps"
      description="将常用创作流程整理成可直接进入的小应用入口。"
      title="应用"
    >
      <div className={styles.appGrid}>
        {cards.map((card) => (
          <Link key={card.href} className={styles.appCard} href={card.href} aria-label={`${card.title} 应用`}>
            <AppCover cover={card.cover} />
            <div className={styles.appBody}>
              <div className={styles.appMetaRow}>
                <span className={styles.appStatus}>{card.statusLabel}</span>
                <span className={styles.appBadge}>{card.cover.badge}</span>
              </div>
              <h2 className={styles.appTitle}>{card.title}</h2>
              <p className={styles.appDescription}>{card.description}</p>
              <span className={styles.appAction}>进入应用</span>
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}

function AppCover({
  cover,
}: Readonly<{
  cover: (typeof PROMPT_APPS)[number]["cover"];
}>) {
  return (
    <div className={styles.appCover} data-tone={cover.tone} aria-hidden="true">
      <div className={styles.appCoverGlow} />
      <div className={styles.appCoverHeader}>
        <div className={styles.appCoverDots}>
          <span />
          <span />
          <span />
        </div>
        <span className={styles.appCoverBadge}>{cover.badge}</span>
      </div>

      <div className={styles.appCoverPanel}>
        <div className={styles.appCoverPanelText}>
          <p className={styles.appCoverPanelTitle}>{cover.label}</p>
        </div>
        <div className={styles.appCoverPanelGrid}>
          <span />
          <span />
          <span />
        </div>
      </div>

      <div className={styles.appCoverStack}>
        <div />
        <div />
      </div>
    </div>
  );
}
