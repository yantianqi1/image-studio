import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import "./globals.css";
import { buildPublicMetadata } from "@/lib/site-metadata";
import { SwrProvider } from "@/lib/swr-provider";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicMetadata();
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
        <SwrProvider>{children}</SwrProvider>
      </body>
    </html>
  );
}
