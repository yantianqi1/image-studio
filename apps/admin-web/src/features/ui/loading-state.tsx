export function LoadingState({
  title,
  description,
}: Readonly<{
  title: string;
  description?: string;
}>) {
  return (
    <div className="admin-loading-state" role="status" aria-live="polite">
      <p className="admin-loading-title">{title}</p>
      {description ? <p className="admin-loading-description">{description}</p> : null}
    </div>
  );
}
