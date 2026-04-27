import Image from "next/image";
import Link from "next/link";

import { AppShell } from "@/features/shell/app-shell";

import { PROMPT_APPS } from "./prompt-apps";
import { buildPromptAppCenterCards } from "./prompt-apps-home-data";
import styles from "./prompt-apps-home.module.css";

export function PromptAppsHome() {
  const cards = buildPromptAppCenterCards(PROMPT_APPS);

  return (
    <AppShell activeHref="/apps">
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
    <div className={styles.appCover} aria-hidden="true">
      <Image
        fill
        alt=""
        className={styles.appCoverImage}
        sizes="(min-width: 1024px) 31vw, (min-width: 640px) 46vw, 100vw"
        src={cover.imageSrc}
      />
      <div className={styles.appCoverShade} />
      <div className={styles.appCoverHeader}>
        <span className={styles.appCoverBadge}>{cover.badge}</span>
      </div>

      <div className={styles.appCoverPanel}>
        <div className={styles.appCoverPanelText}>
          <p className={styles.appCoverPanelTitle}>{cover.label}</p>
        </div>
      </div>
    </div>
  );
}
