import { EmptyState } from "@/features/ui/empty-state";
import { ErrorBox } from "@/features/ui/error-box";
import { LoadingState } from "@/features/ui/loading-state";
import type { AdminWalletLedgerEntry } from "@/lib/admin-api";
import { formatCredits, formatDateTime } from "./user-format";

export function UserLedgerList({
  entries,
  error,
  loading,
}: Readonly<{
  entries: readonly AdminWalletLedgerEntry[];
  error: string;
  loading: boolean;
}>) {
  if (loading) {
    return <LoadingState title="正在读取账本" />;
  }
  if (error) {
    return <ErrorBox message={error} />;
  }
  if (entries.length === 0) {
    return <EmptyState title="暂无账本记录" description="该用户还没有钱包 ledger 条目。" />;
  }
  return (
    <section className="users-detail-panel">
      <h3>账本</h3>
      <div className="users-ledger-list">
        {entries.map((entry) => (
          <LedgerRow key={entry.id} entry={entry} />
        ))}
      </div>
    </section>
  );
}

function LedgerRow({ entry }: Readonly<{ entry: AdminWalletLedgerEntry }>) {
  return (
    <div className="admin-list-row">
      <span className="min-w-0">
        <span className="users-primary-text">{entry.reason}</span>
        <span className="users-secondary-text">{entry.reference_type} · {entry.reference_id}</span>
      </span>
      <span className="users-ledger-amount">
        {entry.amount_credits >= 0 ? "+" : ""}
        {formatCredits(entry.amount_credits)}
        <small>{formatDateTime(entry.created_at)}</small>
      </span>
    </div>
  );
}
