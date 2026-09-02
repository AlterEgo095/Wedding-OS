'use client'

// ══════════════════════════════════════════════════════════════════════════════
// SectionTabBar — P4-FUSION (audit ADMIN-MAP §4 : 23 tabs → 10 sections).
// ══════════════════════════════════════════════════════════════════════════════
// Sub-navigation bar rendered INSIDE a fused section (e.g. "Contenu" groups
// Histoire / Chronologie / Programme / Musique / Cadeaux). The sidebar shows
// the 10 top-level sections; this pill bar shows where you are within the
// active section.
//
// Design contract:
//   - Renders NOTHING when the section has ≤1 sub-tabs (single-manager
//     sections like "Médias" keep the full content width, zero chrome).
//   - Sliding gold pill via framer-motion layoutId (premium micro-interaction,
//     consistent with the platform's motion language).
//   - Horizontal scroll on narrow viewports (mobile: 6 sub-tabs max today,
//     the bar scrolls instead of wrapping).
//   - Stateless — the parent console owns activeTab (TabId SSOT unchanged).

import { motion } from 'framer-motion'

export interface SectionTabItem<T extends string = string> {
  /** Sub-tab id (= legacy TabId — no new id namespace). */
  id: T
  /** Visible label (inherited from the legacy NAV_ITEMS). */
  label: string
}

interface SectionTabBarProps<T extends string> {
  /** Namespacing for the layoutId ('wedding' | 'platform'). */
  consoleId: string
  items: SectionTabItem<T>[]
  activeId: T
  onChange: (id: T) => void
}

// Generic on the id type so callers keeping a strict TabId SSOT can pass
// their own (tabId: TabId) => void handler without contravariance friction.
export function SectionTabBar<T extends string>({ consoleId, items, activeId, onChange }: SectionTabBarProps<T>) {
  // Single-manager sections render no bar — the manager IS the section.
  if (items.length <= 1) return null

  return (
    <div className="px-4 md:px-6 pt-4 pb-3 border-b border-white/[0.06] bg-gradient-to-b from-gold/[0.04] to-transparent">
      <div
        role="tablist"
        aria-label="Sous-sections"
        className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar"
      >
        {items.map((item) => {
          const isActive = item.id === activeId
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(item.id)}
              className={`relative shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? 'text-white'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId={`section-tab-pill-${consoleId}`}
                  className="absolute inset-0 rounded-full bg-gradient-gold shadow-sm"
                  transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }}
                />
              )}
              <span className="relative z-10 whitespace-nowrap">{item.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
