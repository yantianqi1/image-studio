import type { ReactNode } from "react";

type DetailDrawerProps = Readonly<{
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  actions?: ReactNode;
  children: ReactNode;
}>;

export function DetailDrawer({ open, title, description, actions, children, onClose }: DetailDrawerProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="admin-detail-drawer-backdrop" onClick={onClose} role="presentation">
      <aside
        className="admin-detail-drawer"
        aria-label={title}
        aria-modal="true"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="admin-detail-drawer-header">
          <div className="min-w-0">
            <h2 className="admin-detail-drawer-title">{title}</h2>
            {description ? <p className="admin-detail-drawer-description">{description}</p> : null}
          </div>
          <button className="admin-button admin-button-secondary" type="button" onClick={onClose}>
            关闭
          </button>
        </header>
        {actions ? <div className="admin-detail-drawer-actions">{actions}</div> : null}
        <div className="admin-detail-drawer-body">{children}</div>
      </aside>
    </div>
  );
}
