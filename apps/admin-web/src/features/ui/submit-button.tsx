"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = Readonly<{
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  disabled?: boolean;
}>;

export function SubmitButton({
  children,
  pendingText = "提交中...",
  className = "admin-button",
  disabled = false,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={disabled || pending}>
      {pending ? pendingText : children}
    </button>
  );
}
