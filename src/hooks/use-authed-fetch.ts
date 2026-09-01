'use client';
import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

/**
 * useAuthedFetch — consolidated fetch-with-auth hook.
 *
 * P2-CQ-19 — created as the canonical replacement for the duplicated
 * fetch-with-auth pattern that currently lives inline in 4 admin pages:
 *
 *   - src/app/platform/admin/page.tsx          (usePlatformFetch)
 *   - src/app/w/[slug]/admin/page.tsx          (inline fetch)
 *   - src/components/admin/GuestManager.tsx    (inline fetch)
 *
 * Behaviour:
 *   - Attaches `Authorization: Bearer <token>` from localStorage
 *     (admin_token | platform_token — transitional during the cookie-session
 *     migration; once all routes are cookie-only, this header can be dropped).
 *   - Attaches `Content-Type: application/json` for any request with a body
 *     that hasn't already set it.
 *   - Attaches `X-CSRF-Token` from the `csrf_token` cookie on mutating
 *     verbs (double-submit pattern — backend compares header vs cookie).
 *   - Sends `credentials: 'include'` so the auth cookie reaches the server.
 *   - On 401: clears admin_token/platform_token/admin_user from localStorage,
 *     toasts "Session expirée", redirects to /platform/login, throws.
 *   - On 403: parses the JSON error body, toasts the message, throws.
 *   - On TypeError (network failure): toasts "Erreur réseau".
 *   - On success: returns the raw Response — caller is responsible for
 *     `.json()` / `.text()` / status-code handling.
 *
 * Why a hook (not a plain function):
 *   - Needs `useRouter` for the 401 redirect (Next.js App Router).
 *   - The `useCallback` memoises the function so callers can pass it as a
 *     dependency to `useEffect` without retriggering on every render.
 *
 * Migration status (P2-CQ-19):
 *   Hook created. The 4 call-site refactors are deferred to P3 — each admin
 *   page has slightly different error handling (some toast, some redirect,
 *   some set local state) and the migration needs careful per-page testing.
 *   New admin code SHOULD use this hook; existing pages can be migrated
 *   opportunistically.
 */
export function useAuthedFetch() {
  const router = useRouter();

  return useCallback(
    async (input: string, init?: RequestInit) => {
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('admin_token') ||
            localStorage.getItem('platform_token')
          : null;

      const headers = new Headers(init?.headers);
      if (token) headers.set('Authorization', `Bearer ${token}`);
      if (init?.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      // Attach CSRF token from cookie if available (double-submit pattern).
      // Only mutating verbs need CSRF protection — GET/HEAD are safe.
      const csrfToken =
        typeof document !== 'undefined'
          ? document.cookie.match(/csrf_token=([^;]+)/)?.[1]
          : null;
      if (
        csrfToken &&
        ['POST', 'PUT', 'DELETE', 'PATCH'].includes(init?.method || 'GET')
      ) {
        headers.set('X-CSRF-Token', csrfToken);
      }

      try {
        const res = await fetch(input, {
          ...init,
          headers,
          credentials: 'include',
        });

        if (res.status === 401) {
          if (typeof window !== 'undefined') {
            localStorage.removeItem('admin_token');
            localStorage.removeItem('platform_token');
            localStorage.removeItem('admin_user');
          }
          toast.error('Session expirée. Veuillez vous reconnecter.');
          router.push('/platform/login');
          throw new Error('Unauthorized');
        }

        if (res.status === 403) {
          const data = await res
            .json()
            .catch(() => ({ error: 'Accès refusé' }));
          toast.error(data.error || 'Accès refusé');
          throw new Error(data.error || 'Forbidden');
        }

        return res;
      } catch (err) {
        // fetch() throws TypeError on network failure (DNS, offline, CORS).
        // Re-throw the auth/forbidden errors we already raised above so the
        // caller's catch block can react — but show a network toast first.
        if (err instanceof TypeError) {
          toast.error('Erreur réseau. Vérifiez votre connexion.');
        }
        throw err;
      }
    },
    [router]
  );
}
