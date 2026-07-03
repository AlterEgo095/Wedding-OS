'use client'

/**
 * Command Center — Auth Hook
 *
 * Extracted from the legacy monolithic page.tsx. Provides a `fetchWithAuth`
 * wrapper that injects the Bearer token from localStorage and handles
 * session expiry by redirecting to /platform/login.
 *
 * NOTE (Phase 0 risk R-01): the token is still read from localStorage.
 * Migrating to cookie-only is a Phase 1+ follow-up that must touch every
 * fetch call site — kept as-is here to guarantee zero regression.
 */

import { useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export function usePlatformFetch() {
  const router = useRouter()
  const sessionExpiredRef = useRef(false)

  const onSessionExpired = useCallback(() => {
    if (sessionExpiredRef.current) return
    sessionExpiredRef.current = true
    try {
      localStorage.removeItem('admin_token')
      localStorage.removeItem('admin_user')
    } catch {
      /* ignore */
    }
    toast.error('Session expirée, veuillez vous reconnecter')
    router.replace('/platform/login')
  }, [router])

  const getToken = useCallback(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('admin_token')
  }, [])

  const fetchWithAuth = useCallback(
    async (url: string, init?: RequestInit): Promise<Response | null> => {
      const token = getToken()
      if (!token) {
        onSessionExpired()
        return null
      }
      let res: Response
      try {
        res = await fetch(url, {
          ...init,
          headers: {
            ...(init?.headers || {}),
            Authorization: `Bearer ${token}`,
          },
        })
      } catch {
        toast.error('Erreur de connexion au serveur')
        return null
      }
      if (res.status === 401) {
        onSessionExpired()
        return null
      }
      if (res.status === 403) {
        toast.error('Accès refusé')
        return null
      }
      return res
    },
    [getToken, onSessionExpired],
  )

  return { fetchWithAuth, onSessionExpired, getToken }
}

export type FetchWithAuth = (url: string, init?: RequestInit) => Promise<Response | null>
