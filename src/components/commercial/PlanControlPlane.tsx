'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Save, Trash2, Loader2, Eye, EyeOff, Archive, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

/**
 * PlanControlPlane — Mission 5.1 Phase 5
 * DB-backed plan management. Replaces hardcoded PLAN_LIMITS + PLAN_METADATA.
 * All prices in Int minor units (cents) — NO floats.
 */

interface Plan {
  id: string; code: string; name: string; description: string | null
  status: string; isPublic: boolean; sortOrder: number
  priceUsdCents: number; priceFcfa: number; currency: string
  maxGuests: number; maxMediaBytes: number; maxAdmins: number
  customDomainAllowed: boolean; bulkInvitationsAllowed: boolean
  checkInAllowed: boolean; designerAllowed: boolean; premiumCollectionsAllowed: boolean
}

interface Props { csrfToken: string }

export default function PlanControlPlane({ csrfToken }: Props) {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [editing, setEditing] = useState<Record<string, string>>({})

  const fetchPlans = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/platform/plans', { headers: { 'X-CSRF-Token': csrfToken } })
      if (res.ok) { const d = await res.json(); setPlans(d.plans || []) }
    } catch { toast.error('Erreur de chargement') }
    finally { setLoading(false) }
  }, [csrfToken])

  useEffect(() => { fetchPlans() }, [fetchPlans])

  const updatePlan = async (planId: string, updates: Record<string, unknown>) => {
    setSaving(planId)
    try {
      const res = await fetch('/api/platform/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ action: 'update_plan', planId, ...updates }),
      })
      if (res.ok) {
        const d = await res.json()
        setPlans(prev => prev.map(p => p.id === planId ? d.plan : p))
        toast.success('Plan mis à jour')
      } else { const e = await res.json(); toast.error(e.error || 'Erreur') }
    } catch { toast.error('Erreur de connexion') }
    finally { setSaving(null) }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="size-8 animate-spin text-gold" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-lg font-bold">Plan OS — DB-backed</h3>
        <Button onClick={fetchPlans} variant="outline" size="sm">Actualiser</Button>
      </div>
      <div className="space-y-4">
        {plans.map(p => (
          <Card key={p.id} className="glass-card border-gold/10">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-serif text-lg font-bold">{p.name}</span>
                  <Badge variant="outline" className="text-[9px]">{p.code}</Badge>
                  {p.status === 'ACTIVE' && <Badge className="text-[9px] bg-emerald-500/20 text-emerald-600">ACTIVE</Badge>}
                  {p.status === 'ARCHIVED' && <Badge className="text-[9px] bg-red-500/20 text-red-600">ARCHIVED</Badge>}
                  {!p.isPublic && <Badge className="text-[9px] bg-amber-500/20 text-amber-600">PRIVATE</Badge>}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => updatePlan(p.id, { isPublic: !p.isPublic })}>
                    {p.isPublic ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => updatePlan(p.id, { status: p.status === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED' })}>
                    <Archive className="size-3" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="text-muted-foreground">Prix USD (cents)</label>
                  <Input type="number" defaultValue={p.priceUsdCents} className="h-7 text-xs mt-1"
                    onChange={e => setEditing(prev => ({...prev, [p.id+'_priceUsd']: e.target.value}))} />
                </div>
                <div>
                  <label className="text-muted-foreground">Prix FCFA</label>
                  <Input type="number" defaultValue={p.priceFcfa} className="h-7 text-xs mt-1"
                    onChange={e => setEditing(prev => ({...prev, [p.id+'_priceFcfa']: e.target.value}))} />
                </div>
                <div>
                  <label className="text-muted-foreground">Max invités</label>
                  <Input type="number" defaultValue={p.maxGuests} className="h-7 text-xs mt-1"
                    onChange={e => setEditing(prev => ({...prev, [p.id+'_maxGuests']: e.target.value}))} />
                </div>
                <div>
                  <label className="text-muted-foreground">Ordre</label>
                  <Input type="number" defaultValue={p.sortOrder} className="h-7 text-xs mt-1"
                    onChange={e => setEditing(prev => ({...prev, [p.id+'_sortOrder']: e.target.value}))} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-[10px]">
                {p.customDomainAllowed && <Badge variant="outline" className="text-[9px]">Domaine perso</Badge>}
                {p.bulkInvitationsAllowed && <Badge variant="outline" className="text-[9px]">Bulk invitations</Badge>}
                {p.checkInAllowed && <Badge variant="outline" className="text-[9px]">Check-in</Badge>}
                {p.designerAllowed && <Badge variant="outline" className="text-[9px]">Designer</Badge>}
                {p.premiumCollectionsAllowed && <Badge variant="outline" className="text-[9px]">Collections premium</Badge>}
              </div>
              {editing[p.id+'_priceUsd'] !== undefined && (
                <Button size="sm" className="h-7 text-[10px] bg-gold text-white" disabled={saving === p.id}
                  onClick={() => {
                    const updates: Record<string, unknown> = {}
                    if (editing[p.id+'_priceUsd'] !== undefined) updates.priceUsdCents = parseInt(editing[p.id+'_priceUsd']) || 0
                    if (editing[p.id+'_priceFcfa'] !== undefined) updates.priceFcfa = parseInt(editing[p.id+'_priceFcfa']) || 0
                    if (editing[p.id+'_maxGuests'] !== undefined) updates.maxGuests = parseInt(editing[p.id+'_maxGuests']) || -1
                    if (editing[p.id+'_sortOrder'] !== undefined) updates.sortOrder = parseInt(editing[p.id+'_sortOrder']) || 0
                    updatePlan(p.id, updates)
                    setEditing({})
                  }}>
                  {saving === p.id ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3 mr-1" />} Enregistrer
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
