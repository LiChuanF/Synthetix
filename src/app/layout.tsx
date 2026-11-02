import type { Metadata } from "next";
import localFont from "next/font/local";
import { cn } from "@/lib/utils";
import { Providers } from "@/components/providers";
import { resolveLocale } from "@/lib/i18n/server";
import "./globals.css";

// 字体文件是从已构建镜像的 .next/static/media 里取出来的
// (Inter / Plus Jakarta Sans, latin 子集, 可变字重)。
// 放在仓库里后, `next build` 不再访问 Google Fonts, 内网断网也能构建。
const plusJakartaSans = localFont({
  src: "./fonts/plus-jakarta-sans-latin.woff2",
  weight: "400 700",
  style: "normal",
  variable: "--font-display",
  display: "swap",
  adjustFontFallback: "Arial",
});

const inter = localFont({
  src: "./fonts/inter-latin.woff2",
  weight: "400 600",
  style: "normal",
  variable: "--font-sans",
  display: "swap",
  adjustFontFallback: "Arial",
});

export const metadata: Metadata = {
  title: "Synthetix - AI-Powered Document Authoring",
  description:
    "Write, organize, and publish professional documents with intelligent assistance.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await resolveLocale();

  return (
    <html lang={locale} className={cn(plusJakartaSans.variable, inter.variable)} suppressHydrationWarning>
      <body className="font-sans antialiased bg-background text-foreground">
        <Providers initialLocale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
