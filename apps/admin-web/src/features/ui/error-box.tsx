export function ErrorBox({ message }: Readonly<{ message: string }>) {
  return (
    <div className="admin-error">
      <p className="font-semibold">{message}</p>
    </div>
  );
}
