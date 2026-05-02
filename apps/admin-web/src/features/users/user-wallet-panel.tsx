import { ErrorBox } from "@/features/ui/error-box";
import type { AdminWallet } from "@/lib/admin-api";
import { formatCents } from "./user-format";

export function UserWalletPanel({
  error,
  loading,
  wallet,
}: Readonly<{
  error: string;
  loading: boolean;
  wallet: AdminWallet | null;
}>) {
  if (loading) {
    return <div className="users-detail-state">正在读取钱包...</div>;
  }
  if (error) {
    return <ErrorBox message={error} />;
  }
  if (!wallet) {
    return null;
  }
  return (
    <section className="users-detail-panel">
      <h3>钱包</h3>
      <dl className="users-metric-grid">
        <Metric label="余额" value={formatCents(wallet.balance_cents)} />
        <Metric label="锁定" value={formatCents(wallet.locked_cents)} />
        <Metric label="币种" value={wallet.currency} />
      </dl>
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
