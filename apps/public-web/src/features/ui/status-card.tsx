type StatusCardProps = Readonly<{
  title: string;
  description: string;
  tone?: "neutral" | "loading" | "empty";
}>;

const toneClassNames = {
  empty:
    "border-amber-200/60 bg-amber-50/50 text-amber-900",
  loading:
    "border-blue-200/60 bg-blue-50/50 text-blue-900",
  neutral:
    "border-gray-200/60 bg-white/50 text-gray-700",
} as const;

export function StatusCard({
  title,
  description,
  tone = "neutral",
}: StatusCardProps) {
  return (
    <div
      className={`rounded-xl border p-3 backdrop-blur-md ${toneClassNames[tone]}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wider">{title}</p>
      <p className="mt-1 text-xs leading-relaxed opacity-70">{description}</p>
    </div>
  );
}
