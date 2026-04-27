import Link from "next/link";

import { AppShell } from "@/features/shell/app-shell";

import { PROMPT_APPS } from "./prompt-apps";
import { buildPromptAppCenterCards } from "./prompt-apps-home-data";
import styles from "./prompt-apps.module.css";

export function PromptAppsHome() {
  const cards = buildPromptAppCenterCards(PROMPT_APPS);

  return (
    <AppShell activeHref="/apps" title="应用">
      <div className={styles.appGrid}>
        {cards.map((card) => (
          <Link key={card.href} className={styles.appCard} href={card.href}>
            <span className={styles.appStatus}>{card.statusLabel}</span>
            <h2 className={styles.appTitle}>{card.title}</h2>
            <p className={styles.appDescription}>{card.description}</p>
            <span className={styles.appAction}>进入应用</span>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
