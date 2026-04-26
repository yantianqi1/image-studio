type ErrorMessageProps = Readonly<{
  message: string;
  title?: string;
}>;

export function ErrorMessage({
  message,
  title = "接口请求失败",
}: ErrorMessageProps) {
  return (
    <div className="rounded-xl border border-red-300/40 bg-red-50/70 backdrop-blur-md p-3 text-sm text-red-900">
      <p className="font-semibold">{title}</p>
      <p className="mt-0.5 leading-relaxed">{message}</p>
    </div>
  );
}
