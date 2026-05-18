import { ErrorBox } from "@/features/ui/error-box";
import { LoadingState } from "@/features/ui/loading-state";
import type { AdminWallet } from "@/lib/admin-api";
import { formatCredits } from "./user-format";
import { UserCreditAdjustmentForm } from "./user-credit-adjustment-form";

export function UserWalletPanel({
  onAdjusted,
  error,
  loading,
  wallet,
  userId,
}: Readonly<{
  error: string;
  loading: boolean;
  wallet: AdminWallet | null;
  userId: number;
  onAdjusted: () => Promise<void>;
}>) {
  if (loading) {
    return <LoadingState title="正在读取钱包" />;
  }
  if (error) {
    return <ErrorBox message={error} />;
  }
  if (!wallet) {
    return null;
  }
  return (
    <section className="users-detail-panel">
      <div className="users-panel-heading">
        <div>
          <h3>钱包与额度</h3>
          <p>可直接为该用户增加或扣减额度，变动会写入 ledger。</p>
        </div>
      </div>
      <dl className="users-metric-grid">
        <Metric label="余额" value={formatCredits(wallet.balance_credits)} />
        <Metric label="锁定" value={formatCredits(wallet.locked_credits)} />
        <Metric label="币种" value={wallet.currency} />
      </dl>
      <UserCreditAdjustmentForm userId={userId} wallet={wallet} onAdjusted={onAdjusted} />
    </section>
  );
}

function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
