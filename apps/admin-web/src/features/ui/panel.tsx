export function Panel({
  title,
  description,
  children,
}: Readonly<{
  title: string;
  description: string;
  children: React.ReactNode;
}>) {
  return (
    <section className="admin-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <p className="mt-0.5 text-xs text-gray-400 leading-relaxed">{description}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
