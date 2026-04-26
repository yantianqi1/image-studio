import historyStyles from "./generation-history.module.css";
import styles from "./generation-workbench.module.css";

export function MobileHistoryButton({ onClick }: Readonly<{ onClick: () => void }>) {
  return (
    <button
      className={`${historyStyles.menuButton} lg:hidden`}
      type="button"
      onClick={onClick}
      aria-label="打开历史记录"
    >
      ☰
    </button>
  );
}

export function TopBarActions({ walletLabel }: Readonly<{ walletLabel: string }>) {
  return (
    <div className="flex items-center gap-2">
      <a className={styles.topbarBalance} href="/wallet" aria-label="查看钱包余额">
        {walletLabel}
      </a>
      <a className={styles.topbarIconButton} href="/tasks" aria-label="查看生成任务">
        ?
      </a>
      <a className={styles.topbarAvatar} href="/login" aria-label="登录或查看账号">
        CS
      </a>
    </div>
  );
}
