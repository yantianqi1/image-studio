import type { ReactNode } from "react";

interface AppShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}

export function AppShell({
  eyebrow,
  title,
  description,
  children,
}: AppShellProps) {
  return (
    <main className="min-h-screen bg-[var(--app-background)] text-[var(--app-foreground)]">
      <section className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10 md:px-10">
        <header className="grid gap-4 border-b border-black/10 pb-8">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--app-accent)]">
            {eyebrow}
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
            {title}
          </h1>
          <p className="max-w-2xl text-base leading-7 text-black/70">{description}</p>
        </header>
        {children}
      </section>
    </main>
  );
}

