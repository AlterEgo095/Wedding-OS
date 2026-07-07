import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Playfair_Display, Cormorant_Garamond } from "next/font/google";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#B8860B" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a2e" },
  ],
};

// Platform-level metadata — GENERIC (not wedding-specific).
// Per-wedding SEO is generated dynamically by generateMetadata() in
// src/app/w/[slug]/layout.tsx so each tenant's title/description/openGraph
// reflects their own couple. The root layout serves as the platform default
// (e.g. for the homepage, 404, platform/admin routes) and must NEVER leak a
// specific couple's identity into another wedding's social shares.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "https://heureuxmariage.aenews.net"),
  title: "AENEWS Event Experience Platform — Créez vos expériences événementielles",
  description:
    "Plateforme numérique de création, personnalisation et déploiement d'expériences événementielles premium. Mariages, anniversaires, conférences — sans coder.",
  keywords: [
    "plateforme événementielle",
    "mariage numérique",
    "invitation digitale",
    "collections premium",
    "designer événement",
    "multi-tenant",
    "AENEWS",
  ],
  authors: [{ name: "AENEWS" }],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AENEWS Platform",
  },
  openGraph: {
    title: "AENEWS Event Experience Platform",
    description: "Créez, personnalisez et déployez des expériences événementielles numériques premium.",
    type: "website",
    locale: "fr_FR",
    siteName: "AENEWS Event Experience Platform",
    images: [
      {
        url: "/icons/icon-512x512.png",
        width: 512,
        height: 512,
        alt: "AENEWS Event Experience Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AENEWS Event Experience Platform",
    description: "Créez, personnalisez et déployez des expériences événementielles numériques premium.",
    images: ["/icons/icon-512x512.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning style={{ scrollBehavior: "smooth" }}>
      <head>
        <link rel="icon" href="/icons/icon-192x192.png" type="image/png" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192x192.png" />
        <link rel="apple-touch-startup-image" href="/icons/icon-512x512.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} ${cormorant.variable} antialiased bg-background text-foreground min-h-screen flex flex-col`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange={false}
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
