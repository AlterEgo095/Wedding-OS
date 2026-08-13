import Link from 'next/link'
import Image from 'next/image'
import { Heart } from 'lucide-react'

/**
 * MarketingFooter — footer for the Marketing OS homepage.
 *
 * Brand-neutral (no couple identity). Links to real routes only.
 * Sticky to bottom (mt-auto pushes it down on short content).
 *
 * Server Component (Phase 2B): no client interactivity — `new Date()` is
 * computed at request time (ISR-safe with `revalidate = 60` on the homepage).
 *
 * Phase G (5.8.10) — Premium Wedding OS logo integrated as brand anchor.
 */

export default function MarketingFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="relative border-t border-gold/10 bg-gradient-to-b from-background to-champagne/5 dark:to-champagne/3 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Divider */}
        <div className="section-divider max-w-md mx-auto mb-8">
          <span className="flourish text-sm">✦</span>
        </div>

        {/* Brand + links */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand — premium logo lockup */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-4 mb-4">
              {/* Logo medallion */}
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 shrink-0">
                {/* Gold glow */}
                <div
                  className="absolute inset-0 rounded-full blur-xl scale-110"
                  style={{
                    background:
                      'radial-gradient(circle, oklch(0.85 0.15 85 / 0.25) 0%, transparent 70%)',
                  }}
                  aria-hidden
                />
                <Image
                  src="/brand/wedding-os-logo-256.jpg"
                  alt="Wedding OS"
                  fill
                  sizes="(max-width: 640px) 64px, 80px"
                  className="relative rounded-full object-cover ring-2 ring-gold/30 shadow-lg shadow-gold/20"
                />
              </div>
              {/* Wordmark + tagline */}
              <div>
                <h3 className="font-serif text-xl sm:text-2xl font-bold gold-gradient leading-none mb-1">
                  Wedding OS
                </h3>
                <p className="font-display text-[10px] tracking-[0.2em] uppercase text-gold/60 font-semibold">
                  Create · Manage · Celebrate
                </p>
              </div>
            </div>
            <p className="font-display text-sm text-muted-foreground max-w-sm leading-relaxed">
              Créez, personnalisez, publiez et exploitez des expériences événementielles numériques premium.
            </p>
          </div>

          {/* Product links */}
          <div>
            <h4 className="font-display text-xs tracking-[0.2em] uppercase text-gold/70 font-bold mb-3">
              Plateforme
            </h4>
            <ul className="space-y-2">
              <li><Link href="#collections" className="font-display text-sm text-muted-foreground hover:text-gold transition-colors">Collections</Link></li>
              <li><Link href="#experiences" className="font-display text-sm text-muted-foreground hover:text-gold transition-colors">Réalisations</Link></li>
              <li><Link href="#fonctionnalites" className="font-display text-sm text-muted-foreground hover:text-gold transition-colors">Fonctionnalités</Link></li>
              <li><Link href="/onboarding" className="font-display text-sm text-muted-foreground hover:text-gold transition-colors">Créer un événement</Link></li>
            </ul>
          </div>

          {/* Admin links */}
          <div>
            <h4 className="font-display text-xs tracking-[0.2em] uppercase text-gold/70 font-bold mb-3">
              Administration
            </h4>
            <ul className="space-y-2">
              <li><Link href="/platform/admin" className="font-display text-sm text-muted-foreground hover:text-gold transition-colors">Centre de commande</Link></li>
              <li><Link href="/platform/login" className="font-display text-sm text-muted-foreground hover:text-gold transition-colors">Connexion</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-gold/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="font-display text-xs text-muted-foreground">
            © {year} Wedding OS. Tous droits réservés.
          </p>
          <p className="font-display text-xs text-muted-foreground flex items-center gap-1.5">
            Conçu avec <Heart className="size-3 text-gold/60 fill-gold/30" /> pour les événements qui comptent
          </p>
        </div>
      </div>
    </footer>
  )
}
