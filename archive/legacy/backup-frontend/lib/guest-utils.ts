/**
 * Guest Name Utility — Clean display names and handle special entries
 *
 * This module cleans guest names at display time only.
 * The database is NEVER modified — all transformations happen
 * when data is rendered or returned from the API.
 *
 * Handles three issues:
 * 1. Duplicate names like "DIEGO DIEGO" (where firstName === lastName) → "DIEGO"
 * 2. "Couple" entries like "Couple Diego" → special greeting formatting
 * 3. "Famille" entries like "Famille Mbele" → special greeting formatting
 *
 * Also provides category metadata with emoji and display info.
 */

export interface CleanedGuestName {
  /** The cleaned display name (duplicates removed) */
  displayName: string
  /** Whether this is a "Couple" entry */
  isCouple: boolean
  /** Whether this is a "Famille" entry */
  isFamille: boolean
  /** Whether this is a VIP entry */
  isVip: boolean
  /** The name after "Couple"/"Famille" prefix */
  prefixName: string
  /** Full formatted greeting line */
  greeting: string
  /** Short greeting for card headers */
  shortGreeting: string
  /** Category display info with emoji */
  categoryDisplay: CategoryDisplay
}

export interface CategoryDisplay {
  emoji: string
  label: string
  color: string
  bgColor: string
  borderColor: string
}

/* Category configuration with emojis and styling */
export const CATEGORY_CONFIG: Record<string, CategoryDisplay> = {
  COUPLE: {
    emoji: '💍',
    label: 'Couple',
    color: '#A67C3D',
    bgColor: 'rgba(196,162,101,0.08)',
    borderColor: 'rgba(196,162,101,0.2)',
  },
  FAMILLE: {
    emoji: '👨‍👩‍👧',
    label: 'Famille',
    color: '#B05A5A',
    bgColor: 'rgba(176,90,90,0.08)',
    borderColor: 'rgba(176,90,90,0.2)',
  },
  VIP: {
    emoji: '⭐',
    label: 'VIP',
    color: '#8B6914',
    bgColor: 'rgba(139,105,20,0.08)',
    borderColor: 'rgba(139,105,20,0.2)',
  },
  AMIS: {
    emoji: '🤝',
    label: 'Amis',
    color: '#5A8B5A',
    bgColor: 'rgba(90,139,90,0.08)',
    borderColor: 'rgba(90,139,90,0.2)',
  },
  SPONSORS: {
    emoji: '💎',
    label: 'Sponsor',
    color: '#6A5ACD',
    bgColor: 'rgba(106,90,205,0.08)',
    borderColor: 'rgba(106,90,205,0.2)',
  },
  COLLEGUES: {
    emoji: '👔',
    label: 'Collègues',
    color: '#5A7A8B',
    bgColor: 'rgba(90,122,139,0.08)',
    borderColor: 'rgba(90,122,139,0.2)',
  },
}

/** Special prefixes that should be treated as status markers, not names */
const SPECIAL_PREFIXES = ['COUPLE', 'FAMILLE', 'FAMILY']

/**
 * Detects the category from a name entry.
 * For example, "Couple Diego" has category COUPLE.
 */
function detectNameCategory(firstName: string, lastName: string): {
  isCouple: boolean
  isFamille: boolean
  isVip: boolean
  prefixName: string
} {
  const parts = [firstName, lastName].filter(Boolean)
  const isCouple = parts.some(p => p.toUpperCase() === 'COUPLE')
  const isFamille = parts.some(p => p.toUpperCase() === 'FAMILLE' || p.toUpperCase() === 'FAMILY')
  const isVip = parts.some(p => p.toUpperCase() === 'VIP')

  // Extract the name after any special prefix
  const nameParts = parts.filter(p => !SPECIAL_PREFIXES.includes(p.toUpperCase()) && p.toUpperCase() !== 'VIP')
  const prefixName = nameParts.join(' ')

  return { isCouple, isFamille, isVip, prefixName }
}

/**
 * Takes firstName and lastName as inputs and returns cleaned display information.
 *
 * @example
 * cleanGuestName("DIEGO", "DIEGO")
 * // → { displayName: "DIEGO", isCouple: false, ... }
 *
 * @example
 * cleanGuestName("Couple", "Diego")
 * // → { displayName: "Couple Diego", isCouple: true, prefixName: "Diego", greeting: "Invitation exclusive pour le Couple Diego" }
 *
 * @example
 * cleanGuestName("Famille", "Mbele")
 * // → { displayName: "Famille Mbele", isFamille: true, prefixName: "Mbele", greeting: "Invitation exclusive pour la Famille Mbele" }
 */
export function cleanGuestName(firstName: string, lastName: string, category?: string): CleanedGuestName {
  const parts = [firstName, lastName].filter(Boolean)
  const { isCouple, isFamille, isVip, prefixName } = detectNameCategory(firstName, lastName)

  // Remove exact duplicate words (case-insensitive)
  const seen = new Set<string>()
  const uniqueParts = parts.filter(part => {
    const upper = part.toUpperCase()
    if (seen.has(upper)) return false
    seen.add(upper)
    return true
  })

  // Determine category display
  let categoryKey = category?.toUpperCase() || 'AMIS'
  if (isCouple) categoryKey = 'COUPLE'
  else if (isFamille) categoryKey = 'FAMILLE'
  else if (isVip) categoryKey = 'VIP'
  
  const categoryDisplay = CATEGORY_CONFIG[categoryKey] || CATEGORY_CONFIG.AMIS

  if (isCouple) {
    return {
      displayName: `Couple ${prefixName}`,
      isCouple: true,
      isFamille: false,
      isVip: false,
      prefixName,
      greeting: `Invitation exclusive pour le Couple ${prefixName}`,
      shortGreeting: `Cher Couple ${prefixName}`,
      categoryDisplay: CATEGORY_CONFIG.COUPLE,
    }
  }

  if (isFamille) {
    return {
      displayName: `Famille ${prefixName}`,
      isCouple: false,
      isFamille: true,
      isVip: false,
      prefixName,
      greeting: `Invitation exclusive pour la Famille ${prefixName}`,
      shortGreeting: `Chère Famille ${prefixName}`,
      categoryDisplay: CATEGORY_CONFIG.FAMILLE,
    }
  }

  const displayName = uniqueParts.join(' ')

  return {
    displayName,
    isCouple: false,
    isFamille: false,
    isVip,
    prefixName: displayName,
    greeting: `Invitation exclusive pour ${displayName}`,
    shortGreeting: `Cher ${displayName}`,
    categoryDisplay,
  }
}
