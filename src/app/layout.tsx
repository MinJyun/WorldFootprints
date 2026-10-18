import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Geist } from "next/font/google";
import { AuthNav } from "@/components/AuthNav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "World Footprints", template: "%s · World Footprints" },
  description: "把去過的地方點亮,和朋友一起紀錄旅行足跡",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="border-b border-border">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 text-sm">
            <Link href="/" className="text-base font-bold">
              🌏 World Footprints
            </Link>
            <Suspense>
              <AuthNav />
            </Suspense>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        <footer className="mx-auto w-full max-w-6xl px-4 py-6 text-xs text-muted">
          <Link href="/privacy" className="hover:text-foreground">
            隱私權政策
          </Link>
        </footer>
      </body>
    </html>
  );
}
