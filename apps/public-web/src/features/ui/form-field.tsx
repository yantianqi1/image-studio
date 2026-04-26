import type { ComponentPropsWithoutRef } from "react";

type FormFieldProps = Readonly<
  ComponentPropsWithoutRef<"input"> & {
    label: string;
  }
>;

type TextAreaFieldProps = Readonly<
  ComponentPropsWithoutRef<"textarea"> & {
    label: string;
  }
>;

export function FormField({ label, className = "", ...props }: FormFieldProps) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-gray-700">
      {label}
      <input className={`form-control ${className}`} {...props} />
    </label>
  );
}

export function TextAreaField({
  label,
  className = "",
  ...props
}: TextAreaFieldProps) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-gray-700">
      {label}
      <textarea
        className={`form-control min-h-24 resize-y ${className}`}
        {...props}
      />
    </label>
  );
}
