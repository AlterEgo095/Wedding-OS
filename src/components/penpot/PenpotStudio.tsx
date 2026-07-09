'use client'

// ════════════════════════════════════════════════════════════════════════════
// PenpotStudio — Native Penpot Design Studio Integration
// ════════════════════════════════════════════════════════════════════════════
// This is the official design Studio of Wedding OS, powered by Penpot.
//
// Architecture (reuses existing engines, zero regression):
//   ┌─────────────────────────────────────────────────────────────┐
//   │ PenpotStudio (this component)                              │
//   │  • Embeds Penpot editor via iframe (view mode)             │
//   │  • Links a Penpot file URL → stored in Theme.customizations│
//   │  • Pushes theme tokens to Penpot (colors + fonts)          │
//   │  • Pulls design tokens from Penpot                         │
//   │  • Coexists with LuxuryVisualEngine (ambiance overlay)     │
//   ├─────────────────────────────────────────────────────────────┤
//   │ Theme Engine (existing)                                    │
//   │  • /api/theme GET/PUT — reads/writes Theme row             │
//   │  • Theme.customizations JSON stores Penpot integration     │
//   │  • ThemeCustomizer still works (4 canonical fields)        │
//   ├─────────────────────────────────────────────────────────────┤
//   │ ThemeInjector (existing)                                   │
//   │  • Injects --theme-* CSS vars (unchanged)                  │
//   │  • Now ALSO injects --penpot-* CSS vars (additive)         │
//   ├─────────────────────────────────────────────────────────────┤
//   │ InvitationCard (existing, fallback)                        │
//   │  • If Theme.customizations.penpot.invitationFrameId is set │
//   │    → render Penpot SVG export with guest data overlaid     │
//   │  • Else → render the existing fixed InvitationCard design  │
//   ├─────────────────────────────────────────────────────────────┤
//   │ Media Engine (existing)                                    │
//   │  • /api/media returns the wedding's uploaded photos        │
//   │  • Penpot can reference these URLs as placed images        │
//   └─────────────────────────────────────────────────────────────┘
//
// All Penpot state is persisted in Theme.customizations.penpot (JSON).
// This is additive: the existing Theme.customizations field is reused,
// zero schema migration needed.
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  ExternalLink,
  Link2,
  Unlink,
  RefreshCw,
  Palette,
  Upload,
  Download,
  Loader2,
  CheckCircle2,
  Info,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  PENPOT_BASE_URL,
  PENPOT_ENABLED,
  buildPenpotViewUrl,
  buildPenpotEditUrl,
  parsePenpotUrl,
  themeToPenpotTokens,
  penpotTokensToTheme,
  type PenpotIntegration,
  type PenpotTokens,
  EMPTY_PENPOT_INTEGRATION,
} from '@/lib/penpot/config'

interface PenpotStudioProps {
  /** Wedding slug — used for the X-Wedding-Slug header (tenant scoping). */
  slug?: string
  /**
   * Called when the user links/unlinks a Penpot file.
   * The parent should persist `integration.fileUrl` to Theme.customizations.
   */
  onIntegrationChange?: (integration: PenpotIntegration) => void
}

export function PenpotStudio({ slug, onIntegrationChange }: PenpotStudioProps) {
  // ─── Load existing Penpot integration from /api/theme ────────────────────
  // The Theme.customizations JSON field stores the PenpotIntegration blob.
  // We read it on mount and expose editors for each field.
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState<'push' | 'pull' | null>(null)
  const [integration, setIntegration] = useState<PenpotIntegration>(EMPTY_PENPOT_INTEGRATION)
  const [theme, setTheme] = useState<{
    primaryColor?: string | null
    accentColor?: string | null
    fontDisplay?: string | null
    fontBody?: string | null
  }>({})
  const [fileUrlInput, setFileUrlInput] = useState('')
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // ─── Fetch current theme + Penpot integration on mount ───────────────────
  const fetchTheme = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/theme')
      if (!res.ok) return
      const data = await res.json()
      const themeRow = data.theme || data
      setTheme({
        primaryColor: themeRow.primaryColor,
        accentColor: themeRow.accentColor,
        fontDisplay: themeRow.fontDisplay,
        fontBody: themeRow.fontBody,
      })
      // Parse the existing customizations JSON (if any) to restore Penpot state
      let customizations: Record<string, unknown> = {}
      if (themeRow.customizations) {
        try {
          customizations =
            typeof themeRow.customizations === 'string'
              ? JSON.parse(themeRow.customizations)
              : themeRow.customizations
        } catch {
          customizations = {}
        }
      }
      const penpot = (customizations.penpot as PenpotIntegration) || EMPTY_PENPOT_INTEGRATION
      setIntegration(penpot)
      setFileUrlInput(penpot.fileUrl || '')
    } catch {
      // Silent — theme may not exist yet for a fresh wedding
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTheme()
  }, [fetchTheme])

  // ─── Persist Penpot integration to /api/theme (PUT) ──────────────────────
  // We merge our PenpotIntegration into the existing Theme.customizations JSON
  // so we never clobber other customizations fields (additive merge).
  // Returns true on success, false on failure (so callers can decide whether
  // to show their own success toast or not).
  const persistIntegration = useCallback(
    async (next: PenpotIntegration): Promise<boolean> => {
      setSaving(true)
      try {
        // First, re-fetch the latest theme to get the current customizations
        // (avoids clobbering concurrent edits from ThemeCustomizer).
        const getRes = await fetch('/api/theme')
        if (!getRes.ok) {
          toast.error('Impossible de charger le thème actuel')
          return false
        }
        const getData = await getRes.json()
        const themeRow = getData.theme || getData
        let customizations: Record<string, unknown> = {}
        if (themeRow.customizations) {
          try {
            customizations =
              typeof themeRow.customizations === 'string'
                ? JSON.parse(themeRow.customizations)
                : themeRow.customizations
          } catch {
            customizations = {}
          }
        }
        // Merge: only touch the `penpot` key, leave everything else intact
        customizations.penpot = next

        const putRes = await fetch('/api/theme', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // Preserve existing theme fields (don't clobber colors/fonts)
            primaryColor: themeRow.primaryColor,
            accentColor: themeRow.accentColor,
            fontDisplay: themeRow.fontDisplay,
            fontBody: themeRow.fontBody,
            layout: themeRow.layout,
            // Send customizations as an OBJECT — the /api/theme PUT route
            // calls JSON.stringify() itself. Sending a pre-stringified value
            // would cause double-encoding (the route would JSON.stringify a
            // string, producing an escaped string in the DB).
            customizations,
          }),
        })
        if (!putRes.ok) {
          const err = await putRes.json().catch(() => ({}))
          toast.error(err.error || 'Échec de la sauvegarde Penpot')
          return false
        }
        setIntegration(next)
        onIntegrationChange?.(next)
        return true
      } catch {
        toast.error('Erreur réseau lors de la sauvegarde')
        return false
      } finally {
        setSaving(false)
      }
    },
    [onIntegrationChange]
  )

  // ─── Link a Penpot file ──────────────────────────────────────────────────
  const handleLinkFile = useCallback(async () => {
    const url = fileUrlInput.trim()
    if (!url) {
      toast.error('Collez une URL de fichier Penpot')
      return
    }
    if (!url.startsWith(PENPOT_BASE_URL) && !url.startsWith('http')) {
      toast.error(`L'URL doit commencer par ${PENPOT_BASE_URL}`)
      return
    }
    const { fileId, pageId } = parsePenpotUrl(url)
    if (!fileId) {
      toast.error('URL Penpot invalide — file-id introuvable')
      return
    }
    const next: PenpotIntegration = {
      ...integration,
      fileUrl: url,
      fileId,
      pageId,
      lastSyncedAt: new Date().toISOString(),
    }
    const ok = await persistIntegration(next)
    if (ok) toast.success('Studio Penpot lié avec succès')
  }, [fileUrlInput, integration, persistIntegration])

  // ─── Unlink Penpot file ──────────────────────────────────────────────────
  const handleUnlink = useCallback(async () => {
    const next: PenpotIntegration = {
      ...EMPTY_PENPOT_INTEGRATION,
      tokens: integration.tokens, // keep tokens even after unlink
    }
    setFileUrlInput('')
    const ok = await persistIntegration(next)
    if (ok) toast.success('Fichier Penpot délié')
  }, [integration, persistIntegration])

  // ─── Push theme tokens to Penpot ─────────────────────────────────────────
  // Serializes the current ThemeCustomizer colors/fonts as PenpotTokens and
  // stores them in Theme.customizations.penpot.tokens. The couple can then
  // import these tokens into their Penpot file (via Penpot's Tokens plugin
  // or by copying the JSON from the clipboard).
  const handlePushTokens = useCallback(async () => {
    setSyncing('push')
    try {
      const tokens = themeToPenpotTokens(theme)
      const next: PenpotIntegration = {
        ...integration,
        tokens,
        lastSyncedAt: new Date().toISOString(),
      }
      const ok = await persistIntegration(next)
      if (!ok) return
      // Also copy the tokens JSON to clipboard for easy paste into Penpot
      try {
        await navigator.clipboard.writeText(JSON.stringify(tokens, null, 2))
        toast.success('Tokens poussés vers Penpot (JSON copié dans le presse-papiers)')
      } catch {
        toast.success('Tokens poussés vers Penpot')
      }
    } finally {
      setSyncing(null)
    }
  }, [theme, integration, persistIntegration])

  // ─── Pull tokens from Penpot (manual paste) ──────────────────────────────
  // Since we can't directly read from the Penpot iframe (cross-origin),
  // the couple pastes the Penpot tokens JSON into a prompt. We parse it,
  // store it in customizations, AND update the canonical theme fields
  // (primaryColor, accentColor, fontDisplay, fontBody) so ThemeInjector
  // picks them up immediately.
  const handlePullTokens = useCallback(async () => {
    setSyncing('pull')
    try {
      const pasted = window.prompt(
        'Collez le JSON des tokens exporté depuis Penpot (ou laissez vide pour ignorer) :'
      )
      if (!pasted) {
        setSyncing(null)
        return
      }
      let tokens: PenpotTokens
      try {
        tokens = JSON.parse(pasted)
      } catch {
        toast.error('JSON invalide — vérifiez le format')
        setSyncing(null)
        return
      }
      // Map back to canonical theme fields and persist via /api/theme PUT
      const themeUpdate = penpotTokensToTheme(tokens)
      const getRes = await fetch('/api/theme')
      if (!getRes.ok) {
        toast.error('Impossible de charger le thème')
        return
      }
      const getData = await getRes.json()
      const themeRow = getData.theme || getData
      let customizations: Record<string, unknown> = {}
      if (themeRow.customizations) {
        try {
          customizations =
            typeof themeRow.customizations === 'string'
              ? JSON.parse(themeRow.customizations)
              : themeRow.customizations
        } catch {
          customizations = {}
        }
      }
      const next: PenpotIntegration = {
        ...integration,
        tokens,
        lastSyncedAt: new Date().toISOString(),
      }
      customizations.penpot = next

      const putRes = await fetch('/api/theme', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryColor: themeUpdate.primaryColor ?? themeRow.primaryColor,
          accentColor: themeUpdate.accentColor ?? themeRow.accentColor,
          fontDisplay: themeUpdate.fontDisplay ?? themeRow.fontDisplay,
          fontBody: themeUpdate.fontBody ?? themeRow.fontBody,
          layout: themeRow.layout,
          // Send as object — the /api/theme PUT route does JSON.stringify itself
          customizations,
        }),
      })
      if (!putRes.ok) {
        toast.error('Échec de la synchronisation Penpot → Thème')
        return
      }
      setIntegration(next)
      setTheme((prev) => ({ ...prev, ...themeUpdate }))
      onIntegrationChange?.(next)
      toast.success('Tokens Penpot → Thème synchronisés')
    } finally {
      setSyncing(null)
    }
  }, [integration, persistIntegration, onIntegrationChange])

  // ─── Render ──────────────────────────────────────────────────────────────

  if (!PENPOT_ENABLED) {
    return (
      <Card className="border-gold/20">
        <CardContent className="p-6 text-center text-muted-foreground">
          <Palette className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Studio Penpot désactivé. Configurez NEXT_PUBLIC_PENPOT_BASE_URL.</p>
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gold" />
        <span className="ml-2 text-sm text-muted-foreground">Chargement du Studio…</span>
      </div>
    )
  }

  const isLinked = !!(integration.fileId && integration.fileUrl)
  const viewUrl = isLinked
    ? buildPenpotViewUrl(integration.fileId!, integration.pageId ?? null)
    : null
  const editUrl = isLinked
    ? buildPenpotEditUrl(integration.fileId!, integration.pageId ?? null)
    : null

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <Card className="border-gold/20 bg-gradient-to-br from-gold/[0.03] to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gold/20 to-rose-gold/10 flex items-center justify-center">
                <Palette className="w-5 h-5 text-gold" />
              </div>
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  Studio Penpot
                  <Badge variant="outline" className="text-blue-400 border-blue-400/30 text-xs">
                    Pont externe
                  </Badge>
                  {isLinked ? (
                    <Badge variant="outline" className="text-emerald-400 border-emerald-400/30 text-xs">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Lié
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground text-xs">
                      Non lié
                    </Badge>
                  )}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Pont vers Penpot Cloud (design.penpot.app) — l'usine de designs intégrée
                  de Wedding OS se trouve dans l'onglet « Collections Premium ».
                </p>
              </div>
            </div>
            {isLinked && editUrl && (
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <a href={editUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  Éditer dans Penpot
                </a>
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* ─── File Linker ────────────────────────────────────────────────── */}
      <Card className="border-white/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Link2 className="w-4 h-4 text-gold" />
            Fichier Penpot
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="penpot-url" className="text-xs">
              URL du fichier Penpot (partage ou éditeur)
            </Label>
            <div className="flex gap-2">
              <Input
                id="penpot-url"
                value={fileUrlInput}
                onChange={(e) => setFileUrlInput(e.target.value)}
                placeholder={`${PENPOT_BASE_URL}/#/view?file-id=...&page-id=...`}
                className="text-xs font-mono"
                disabled={saving}
              />
              {isLinked ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUnlink}
                  disabled={saving}
                  className="shrink-0 text-red-400 hover:text-red-300 hover:bg-red-400/10"
                >
                  <Unlink className="w-3.5 h-3.5 mr-1.5" />
                  Délier
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleLinkFile}
                  disabled={saving || !fileUrlInput.trim()}
                  className="shrink-0"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5 mr-1.5" />}
                  Lier
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Dans Penpot : Menu → Partager → Copier le lien. Collez-le ici.
            </p>
          </div>
          {isLinked && integration.fileId && (
            <div className="text-[11px] text-muted-foreground font-mono bg-white/[0.02] rounded p-2 border border-white/5">
              <div>file-id: <span className="text-foreground">{integration.fileId}</span></div>
              {integration.pageId && (
                <div>page-id: <span className="text-foreground">{integration.pageId}</span></div>
              )}
              {integration.lastSyncedAt && (
                <div>dernière sync: <span className="text-foreground">{new Date(integration.lastSyncedAt).toLocaleString('fr-FR')}</span></div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Token Sync Bridge ──────────────────────────────────────────── */}
      <Card className="border-white/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-gold" />
            Synchronisation des tokens
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Push: Wedding OS → Penpot */}
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Upload className="w-3.5 h-3.5 text-gold" />
                <span className="text-xs font-medium">Pousser vers Penpot</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Exporte les couleurs et polices du thème actuel au format JSON
                pour les importer dans Penpot.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={handlePushTokens}
                disabled={syncing !== null}
                className="w-full text-xs"
              >
                {syncing === 'push' ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Upload className="w-3 h-3 mr-1.5" />}
                Pousser les tokens
              </Button>
            </div>

            {/* Pull: Penpot → Wedding OS */}
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Download className="w-3.5 h-3.5 text-gold" />
                <span className="text-xs font-medium">Tirer depuis Penpot</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Importe les tokens modifiés dans Penpot pour mettre à jour le
                thème Wedding OS (couleurs, polices).
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={handlePullTokens}
                disabled={syncing !== null}
                className="w-full text-xs"
              >
                {syncing === 'pull' ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Download className="w-3 h-3 mr-1.5" />}
                Tirer les tokens
              </Button>
            </div>
          </div>

          {/* Current token state */}
          {integration.tokens && (
            <>
              <Separator className="bg-white/5" />
              <div className="space-y-1.5">
                <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
                  Tokens actuels
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(integration.tokens).filter(([, v]) => v).map(([k, v]) => (
                    <Badge key={k} variant="outline" className="text-[10px] font-mono">
                      {k}: <span className="text-foreground ml-1">{String(v)}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── Penpot Embed (view mode) ──────────────────────────────────── */}
      {isLinked && viewUrl ? (
        <Card className="border-white/10 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-gold" />
              Aperçu du design Penpot
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="relative w-full" style={{ minHeight: '500px' }}>
              <iframe
                ref={iframeRef}
                src={viewUrl}
                title="Penpot Studio"
                className="w-full border-0"
                style={{ minHeight: '500px', height: '60vh' }}
                allow="clipboard-read; clipboard-write; fullscreen"
                loading="lazy"
              />
            </div>
            <div className="p-3 bg-white/[0.02] border-t border-white/5 flex items-center gap-2 text-[11px] text-muted-foreground">
              <Info className="w-3 h-3 shrink-0" />
              <span>
                Mode aperçu (lecture seule). Pour éditer, cliquez sur « Éditer dans Penpot ».
              </span>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed border-white/15">
          <CardContent className="p-8 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-gold/10 flex items-center justify-center mx-auto">
              <Palette className="w-6 h-6 text-gold" />
            </div>
            <div>
              <p className="text-sm font-medium">Aucun fichier Penpot lié</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                Ce pont permet de connecter un fichier Penpot Cloud (design.penpot.app) à
                votre mariage pour synchroniser manuellement les tokens (couleurs, polices)
                via copier-coller. Pour créer et gérer les designs de Wedding OS, utilisez
                l'onglet « Collections Premium ».
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <a href={PENPOT_BASE_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                Ouvrir Penpot
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ─── Integration info ──────────────────────────────────────────── */}
      <Card className="border-blue-500/15 bg-blue-500/[0.02]">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-blue-300">
            <Info className="w-3.5 h-3.5" />
            Comment fonctionne l&apos;intégration Penpot
          </div>
          <ol className="text-[11px] text-muted-foreground space-y-1 list-decimal list-inside ml-1">
            <li>Créez un fichier Penpot (ou dupliquez un template fourni).</li>
            <li>Copiez l&apos;URL de partage et liez-la ci-dessus.</li>
            <li>Poussez vos couleurs/polices vers Penpot (bouton ci-dessus).</li>
            <li>Concevez votre invitation/save-the-date dans Penpot.</li>
            <li>Tirez les tokens modifiés pour resynchroniser le thème.</li>
            <li>Le moteur InvitationCard affiche automatiquement votre design Penpot.</li>
          </ol>
          <p className="text-[11px] text-muted-foreground pt-1 border-t border-blue-500/10">
            <strong className="text-foreground">Coexistence :</strong> le LuxuryVisualEngine
            (particules, bokeh, halos) se superpose au design Penpot sans conflit.
            Le ThemeInjector applique les tokens Penpot via les variables CSS{' '}
            <code className="text-foreground">--penpot-*</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
