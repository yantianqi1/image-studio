import type { Metadata } from "next";
import { connection } from "next/server";
import "./globals.css";
import { buildAdminMetadata } from "@/lib/site-metadata";
import { SwrProvider } from "@/lib/swr-provider";
import { ToastProvider } from "@/lib/toast-context";

export async function generateMetadata(): Promise<Metadata> {
  return buildAdminMetadata();
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await connection();
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <SwrProvider>
          <ToastProvider>{children}</ToastProvider>
        </SwrProvider>
      </body>
    </html>
  );
}
