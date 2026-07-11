import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import PhotoFallbackController from "./photo-fallback-controller";
import { siteConfig } from "./site-config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "127.0.0.1:3001";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("127.0.0.1") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = `${siteConfig.profile.brand}｜${siteConfig.profile.city} Cosplay 摄影师`;
  const description = `漫展场照、主题私影与影棚创作，${siteConfig.trustItems[1].value}。${siteConfig.profile.intro}`;

  return {
    metadataBase: new URL(origin),
    title,
    description,
    icons: { icon: "/favicon.svg" },
    openGraph: {
      type: "website",
      locale: "zh_CN",
      url: origin,
      siteName: siteConfig.profile.brand,
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#f8f5f0",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <PhotoFallbackController />
        {children}
      </body>
    </html>
  );
}
