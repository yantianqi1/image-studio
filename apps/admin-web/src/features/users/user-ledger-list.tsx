import { EmptyState } from "@/features/ui/empty-state";
import { ErrorBox } from "@/features/ui/error-box";
import type { AdminWalletLedgerEntry } from "@/lib/admin-api";
import { formatCents, formatDateTime } from "./user-format";

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
    return <div className="users-detail-state">正在读取账本...</div>;
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
        {formatCents(entry.amount_cents)}
        <small>{formatDateTime(entry.created_at)}</small>
      </span>
    </div>
  );
}
