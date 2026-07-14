'use client'

import ThemeTheater from '@/components/aenws/ThemeTheater'

export default function ShowcasePage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      <section className="relative min-h-[50vh] flex flex-col items-center justify-center px-4 text-center overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a] via-[#0f0f0f] to-[#0a0a0a]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-[#D4AF37]/5 blur-[100px]" />
        </div>
        <div className="max-w-3xl">
          <span className="inline-block px-4 py-1.5 rounded-full text-[10px] font-body tracking-[0.25em] uppercase text-[#D4AF37] bg-[#D4AF37]/10 border border-[#D4AF37]/20 mb-6">
            AENWS Showcase
          </span>
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold mb-4">
            <span className="gold-gradient">Douze mondes, douze identités</span>
          </h1>
          <p className="font-body text-sm sm:text-base text-white/50 max-w-xl mx-auto leading-relaxed">
            Chaque thème possède sa propre identité, son arrangement, ses composants et ses modèles.
          </p>
        </div>
      </section>
      <ThemeTheater onSelect={() => {}} onCompare={() => {}} />
    </main>
  )
}
