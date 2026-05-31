import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Mariage Alexandre & Béatrice",
  description:
    "Rejoignez-nous pour célébrer l'union d'Alexandre et Béatrice. Découvrez les détails de notre mariage, confirmez votre présence et partagez ce moment unique avec nous.",
  keywords: [
    "mariage",
    "wedding",
    "Alexandre",
    "Béatrice",
    "invitation",
    "célibataire",
    "celebration",
  ],
  authors: [{ name: "Alexandre & Béatrice" }],
  openGraph: {
    title: "Mariage Alexandre & Béatrice",
    description:
      "Rejoignez-nous pour célébrer l'union d'Alexandre et Béatrice.",
    type: "website",
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mariage Alexandre & Béatrice",
    description:
      "Rejoignez-nous pour célébrer l'union d'Alexandre et Béatrice.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning style={{ scrollBehavior: "smooth" }}>
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
