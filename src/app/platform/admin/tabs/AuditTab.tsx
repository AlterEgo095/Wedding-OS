'use client'

// AuditTab — extracted from src/app/platform/admin/page.tsx (CONS-3).
// Shows the platform-wide audit log (recentActivity from /api/platform/dashboard).

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import Link from 'next/link'
import { ScrollText, Loader2 } from 'lucide-react'

import { formatDateTime } from '@/lib/format'
import { ROLE_BADGE_CLASS, getRoleLabel } from '@/lib/ui-labels'

import {
  type AuditLog,
  type DashboardData,
  type FetchWithAuth,
} from './shared'


// ════════════════════════════════════════════════════════════════════════════
// Audit tab — reuses /api/platform/dashboard's recentActivity field
// ════════════════════════════════════════════════════════════════════════════

const ACTION_BADGE_CLASS: Record<string, string> = {
  CREATE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  UPDATE: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  DELETE: 'bg-red-500/15 text-red-400 border-red-500/30',
  LOGIN: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  LOGOUT: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  DEFAULT: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
}

function actionBadgeClass(action: string): string {
  const prefix = action.split('_')[0]
  return ACTION_BADGE_CLASS[prefix] || ACTION_BADGE_CLASS.DEFAULT
}

export function AuditTab({ fetchWithAuth }: { fetchWithAuth: (url: string, init?: RequestInit) => Promise<Response | null> }) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetchWithAuth('/api/platform/dashboard')
    if (!res) {
      setLoading(false)
      return
    }
    try {
      const json = (await res.json()) as DashboardData
      setLogs(json.recentActivity || [])
    } catch {
      toast.error('Réponse invalide du serveur')
    } finally {
      setLoading(false)
    }
  }, [fetchWithAuth])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <ScrollText className="w-5 h-5 text-gold" />
          Journal d&apos;audit
        </h2>
        <p className="text-sm text-muted-foreground">
          Les 20 actions les plus récentes sur la plateforme
        </p>
      </div>

      <Card className="glass-card gold-border border-0">
        <CardContent className="p-0">
          <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
            <Table>
              <TableHeader className="sticky top-0 bg-background/95 backdrop-blur z-10">
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-xs">Horodatage</TableHead>
                  <TableHead className="text-xs">Action</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Utilisateur</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">Mariage</TableHead>
                  <TableHead className="text-xs">Détails</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={`sk-${i}`} className="border-white/5">
                      <TableCell colSpan={5}>
                        <Skeleton className="h-8 w-full rounded" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : logs.length === 0 ? (
                  <TableRow className="border-white/5 hover:bg-transparent">
                    <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                      <ScrollText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Aucune entrée d&apos;audit</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id} className="border-white/5 hover:bg-white/5 transition-colors align-top">
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(log.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] uppercase tracking-wide ${actionBadgeClass(log.action)}`}
                        >
                          {log.action.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {log.user ? (
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{log.user.name}</span>
                            <span className="text-xs text-muted-foreground">{log.user.email}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Système</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {log.wedding ? (
                          <Link
                            href={`/w/${log.wedding.slug}`}
                            target="_blank"
                            className="hover:text-gold transition-colors"
                          >
                            {log.wedding.coupleLabel}
                          </Link>
                        ) : log.weddingId ? (
                          // Dashboard endpoint doesn't include the wedding relation —
                          // surface a short id hash so the operator can still tell which
                          // tenant the audit entry belongs to.
                          <span className="font-mono text-[10px] text-muted-foreground/70">
                            #{log.weddingId.slice(-6)}
                          </span>
                        ) : (
                          <span className="text-gold/70">Plateforme</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs">
                        {log.details || '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
