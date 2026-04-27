import { BrandMark } from "@/features/shell/brand-mark";
import styles from "./generation-workbench.module.css";

export function TopBarActions({ walletLabel }: Readonly<{ walletLabel: string }>) {
  return (
    <div className="flex items-center gap-2">
      <a className={styles.topbarBalance} href="/wallet" aria-label="查看钱包余额">
        {walletLabel}
      </a>
      <a className={styles.topbarAvatar} href="/login" aria-label="登录或查看账号">
        <BrandMark />
      </a>
    </div>
  );
}
