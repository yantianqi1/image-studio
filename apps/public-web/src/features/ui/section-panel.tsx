type SectionPanelProps = Readonly<{
  title: string;
  description?: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}>;

export function SectionPanel({
  title,
  description,
  children,
  aside,
}: SectionPanelProps) {
  return (
    <section className="section-panel">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs text-gray-400 leading-relaxed">
              {description}
            </p>
          ) : null}
        </div>
        {aside ? <div>{aside}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
