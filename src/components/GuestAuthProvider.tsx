'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

interface GuestData {
  id: string
  firstName: string
  lastName: string
  invitationCode: string
  seats: number
  category: string
  status: string
  personalMessage: string | null
  checkedIn: boolean
  table: {
    id: string
    name: string
    number: number
  } | null
  invitationViewed: boolean
  invitationViewCount: number
  lastAccessAt: string | null
  encryptedLink?: string
}

interface GuestAuthContextType {
  guest: GuestData | null
  authenticated: boolean
  loading: boolean
  login: (code: string, firstName?: string, lastName?: string) => Promise<{ success: boolean; error?: string; remainingAttempts?: number }>
  loginWithLinkToken: (token: string) => Promise<{ success: boolean; error?: string }>
  loginByLookupToken: (lookupToken: string) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const GuestAuthContext = createContext<GuestAuthContextType>({
  guest: null,
  authenticated: false,
  loading: true,
  login: async () => ({ success: false }),
  loginWithLinkToken: async () => ({ success: false }),
  loginByLookupToken: async () => ({ success: false }),
  logout: async () => {},
  refresh: async () => {},
})

export function useGuestAuth() {
  return useContext(GuestAuthContext)
}

export function GuestAuthProvider({ children }: { children: ReactNode }) {
  const [guest, setGuest] = useState<GuestData | null>(null)
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch('/api/guest/me')
      if (res.ok) {
        const data = await res.json()
        if (data.authenticated && data.guest) {
          setGuest(data.guest)
          setAuthenticated(true)
          return
        }
      }
      setGuest(null)
      setAuthenticated(false)
    } catch {
      setGuest(null)
      setAuthenticated(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    checkSession()
  }, [checkSession])

  const login = useCallback(async (code: string, firstName?: string, lastName?: string) => {
    try {
      const res = await fetch('/api/guest/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, firstName, lastName }),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        setGuest(data.guest)
        setAuthenticated(true)
        return { success: true }
      }

      return {
        success: false,
        error: data.error || 'Erreur d\'authentification',
        remainingAttempts: data.remainingAttempts,
      }
    } catch {
      return { success: false, error: 'Erreur de connexion au serveur' }
    }
  }, [])

  const loginWithLinkToken = useCallback(async (linkToken: string) => {
    try {
      const res = await fetch(`/api/guest/invite?token=${encodeURIComponent(linkToken)}`)
      const data = await res.json()

      if (res.ok && data.success) {
        setGuest(data.guest)
        setAuthenticated(true)
        return { success: true }
      }

      return {
        success: false,
        error: data.error || 'Lien d\'invitation invalide',
      }
    } catch {
      return { success: false, error: 'Erreur de connexion au serveur' }
    }
  }, [])

  // ═══════════════════════════════════════════════════════════
  // NEW: Auto-authenticate via lookup token (name-based, no code)
  // This is the primary authentication method for guests.
  // ═══════════════════════════════════════════════════════════
  const loginByLookupToken = useCallback(async (lookupToken: string) => {
    try {
      const res = await fetch('/api/guest/auto-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lookupToken }),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        setGuest(data.guest)
        setAuthenticated(true)
        return { success: true }
      }

      return {
        success: false,
        error: data.error || 'Impossible de trouver votre invitation',
      }
    } catch {
      return { success: false, error: 'Erreur de connexion au serveur' }
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/guest/logout', { method: 'POST' })
    } catch {
      // Continue regardless
    }
    setGuest(null)
    setAuthenticated(false)
  }, [])

  const refresh = useCallback(async () => {
    await checkSession()
  }, [checkSession])

  return (
    <GuestAuthContext.Provider value={{ guest, authenticated, loading, login, loginWithLinkToken, loginByLookupToken, logout, refresh }}>
      {children}
    </GuestAuthContext.Provider>
  )
}
