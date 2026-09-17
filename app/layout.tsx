import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import "./marketing.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const requestOrigin = `${protocol}://${host}`;
  let origin = requestOrigin;
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    try { origin = new URL(process.env.NEXT_PUBLIC_SITE_URL).origin; } catch { origin = requestOrigin; }
  }
  const title = "Find Anything — Trusted knowledge for AI agents";
  const description = "Detect conflicting knowledge, account for retrieval gaps, and give AI agents exact citations, permissions, confidence, trace, replay, receipt, and diff.";

  return {
    metadataBase: new URL(origin),
    title,
    description,
    alternates: { canonical: origin },
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: `${origin}/find-anything-promo-poster.png`, width: 1920, height: 1080, alt: "Find Anything accounts for known sources, retrieval confidence, citations, and coverage" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [`${origin}/find-anything-promo-poster.png`] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
