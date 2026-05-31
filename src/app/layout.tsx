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

export const metadata: Metadata = {
  metadataBase: new URL("https://x16kp4ft4d40-d.space-z.ai"),
  title: "Mariage Josué & Hornella",
  description:
    "Rejoignez-nous pour célébrer l'union de Josué et Hornella. Découvrez les détails de notre mariage, trouvez votre table et partagez ce moment unique avec nous.",
  keywords: [
    "mariage",
    "wedding",
    "Josué",
    "Hornella",
    "invitation",
    "Kinshasa",
    "celebration",
  ],
  authors: [{ name: "Josué & Hornella" }],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "J & H 2026",
  },
  openGraph: {
    title: "Mariage Josué & Hornella",
    description:
      "Rejoignez-nous pour célébrer l'union de Josué et Hornella.",
    type: "website",
    locale: "fr_FR",
    siteName: "Mariage Josué & Hornella",
    images: [
      {
        url: "/icons/icon-512x512.png",
        width: 512,
        height: 512,
        alt: "Mariage Josué & Hornella",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mariage Josué & Hornella",
    description:
      "Rejoignez-nous pour célébrer l'union de Josué et Hornella.",
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
        className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} ${cormorant.variable} antialiased bg-background text-foreground`}
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
