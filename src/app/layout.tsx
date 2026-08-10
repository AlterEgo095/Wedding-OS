import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Playfair_Display, Cormorant_Garamond } from "next/font/google";
import { MotionConfig } from "framer-motion";
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
  viewportFit: "cover", // P0-PWA-2: enables env(safe-area-inset-*) on iOS notch
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#D4AF37" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

// Platform-level metadata — GENERIC (not wedding-specific).
// Per-wedding SEO is generated dynamically by generateMetadata() in
// src/app/w/[slug]/layout.tsx so each tenant's title/description/openGraph
// reflects their own couple. The root layout serves as the platform default
// (e.g. for the homepage, 404, platform/admin routes) and must NEVER leak a
// specific couple's identity into another wedding's social shares.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "https://wedding.hpph.net"),
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
        <link rel="apple-touch-icon" sizes="167x167" href="/icons/icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-192x192.png" />
        <link rel="apple-touch-startup-image" href="/icons/icon-512x512.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Heureux Mariage" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="application-name" content="Heureux Mariage" />
        <meta name="msapplication-TileColor" content="#D4AF37" />
        <meta name="msapplication-tap-highlight" content="no" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} ${cormorant.variable} antialiased bg-background text-foreground min-h-screen flex flex-col`}
      >
        {/* MISSION-5.9.0 Phase 0.3: MotionConfig reducedMotion="user" — respects OS-level prefers-reduced-motion across ALL framer-motion animations (85 files, 1023 motion.* patterns). Single highest-impact a11y fix. */}
        <MotionConfig reducedMotion="user">
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange={false}
          >
            {/* MISSION-5.9.0 Phase 0.4: skip-to-content link — WCAG 2.1 SC 2.4.1 "Bypass Blocks". First focusable element on every page. */}
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-md focus:bg-primary focus:text-primary-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
            >
              Aller au contenu
            </a>
            {children}
            <Toaster />
          </ThemeProvider>
        </MotionConfig>
      </body>
    </html>
  );
}
