'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp, Users, FileText, CreditCard, Send, Package,
  Plus, Check, X, Loader2, AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

/**
 * CommercialOS — Mission 5.0 Commercial Operating System admin UI.
 * Accessible from /platform/admin → Commercial tab.
 *
 * Sections: Dashboard, Customers, Deals, Orders, Payments, Delivery
 * All data comes from real DB queries via /api/platform/commercial.
 * No fake metrics, no fake providers.
 */

type Tab = 'dashboard' | 'customers' | 'deals' | 'orders' | 'payments' | 'delivery'

interface Props { csrfToken: string }

export default function CommercialOS({ csrfToken }: Props) {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [loading, setLoading] = useState(true)
  const [dashboard, setDashboard] = useState<Record<string, unknown> | null>(null)
  const [customers, setCustomers] = useState<any[]>([])
  const [deals, setDeals] = useState<any[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const headers = { 'X-CSRF-Token': csrfToken }
      const [d, c, de, o, p] = await Promise.all([
        fetch('/api/platform/commercial?resource=dashboard', { headers }).then(r => r.json()),
        fetch('/api/platform/commercial?resource=customers', { headers }).then(r => r.json()),
        fetch('/api/platform/commercial?resource=deals', { headers }).then(r => r.json()),
        fetch('/api/platform/commercial?resource=orders', { headers }).then(r => r.json()),
        fetch('/api/platform/commercial?resource=payments', { headers }).then(r => r.json()),
      ])
      setDashboard(d)
      setCustomers(c.customers || [])
      setDeals(de.deals || [])
      setOrders(o.orders || [])
      setPayments(p.payments || [])
    } catch { toast.error('Erreur de chargement') }
    finally { setLoading(false) }
  }, [csrfToken])

  useEffect(() => { fetchAll() }, [fetchAll])

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/platform/commercial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.message || data.error || 'Erreur'); return null }
    toast.success('Opération réussie')
    fetchAll()
    return data
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="size-8 animate-spin text-gold" /></div>

  const tabs: Array<{id: Tab; label: string; icon: any}> = [
    { id: 'dashboard', label: 'Dashboard', icon: TrendingUp },
    { id: 'customers', label: 'Clients', icon: Users },
    { id: 'deals', label: 'Deals', icon: FileText },
    { id: 'orders', label: 'Commandes', icon: Package },
    { id: 'payments', label: 'Paiements', icon: CreditCard },
    { id: 'delivery', label: 'Delivery', icon: Send },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="size-6 text-gold" /> Commercial OS
        </h2>
        <Button onClick={fetchAll} variant="outline" size="sm">Actualiser</Button>
      </div>

      <div className="flex gap-1 flex-wrap">
        {tabs.map(t => (
          <Button key={t.id} size="sm" variant={tab === t.id ? 'default' : 'outline'}
            onClick={() => setTab(t.id)}
            className={tab === t.id ? 'bg-gold text-white' : ''}>
            <t.icon className="size-3.5 mr-1.5" />{t.label}
          </Button>
        ))}
      </div>

      {tab === 'dashboard' && <DashboardTab stats={dashboard} />}
      {tab === 'customers' && <CustomersTab customers={customers} post={post} />}
      {tab === 'deals' && <DealsTab deals={deals} customers={customers} post={post} />}
      {tab === 'orders' && <OrdersTab orders={orders} customers={customers} post={post} />}
      {tab === 'payments' && <PaymentsTab payments={payments} post={post} />}
      {tab === 'delivery' && <DeliveryTab post={post} csrfToken={csrfToken} />}
    </div>
  )
}

function DashboardTab({ stats }: { stats: any }) {
  if (!stats) return null
  const cards = [
    { label: 'Clients', value: stats.customers?.total || 0, sub: `${stats.customers?.active || 0} actifs`, icon: Users },
    { label: 'Deals ouverts', value: stats.deals?.open || 0, sub: `${stats.deals?.won || 0} gagnés`, icon: FileText },
    { label: 'Commandes confirmées', value: stats.orders?.confirmed || 0, sub: `${stats.orders?.total || 0} total`, icon: Package },
    { label: 'Paiements vérifiés', value: stats.payments?.verified || 0, sub: `${stats.payments?.pending || 0} en attente`, icon: CreditCard },
    { label: 'Revenu vérifié', value: `$${((stats.revenue?.verifiedUsdCents || 0) / 100).toFixed(2)}`, sub: 'USD', icon: TrendingUp },
    { label: 'Événements publiés', value: stats.events?.published || 0, sub: `${stats.events?.total || 0} total`, icon: Package },
  ]
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {cards.map((c, i) => (
        <Card key={i} className="glass-card border-gold/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <c.icon className="size-4 text-gold" />
              <span className="text-[10px] tracking-wider uppercase text-muted-foreground">{c.label}</span>
            </div>
            <div className="font-serif text-2xl font-bold">{c.value}</div>
            <div className="text-[10px] text-muted-foreground">{c.sub}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function CustomersTab({ customers, post }: { customers: any[]; post: any }) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  return (
    <div className="space-y-4">
      <Button size="sm" onClick={() => setShowForm(!showForm)} className="bg-gold text-white">
        <Plus className="size-4 mr-1" /> Nouveau client
      </Button>
      {showForm && (
        <Card className="glass-card gold-border p-4 space-y-2">
          <Input placeholder="Nom *" value={name} onChange={e => setName(e.target.value)} />
          <Input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <Input placeholder="Téléphone" value={phone} onChange={e => setPhone(e.target.value)} />
          <Button size="sm" onClick={async () => {
            const r = await post({ action: 'create_customer', displayName: name, email, phone })
            if (r) { setName(''); setEmail(''); setPhone(''); setShowForm(false) }
          }} className="bg-gold text-white">Créer</Button>
        </Card>
      )}
      <div className="space-y-2">
        {customers.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Aucun client</p>}
        {customers.map(c => (
          <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-gold/10">
            <div>
              <div className="font-serif text-sm font-bold">{c.displayName}</div>
              <div className="text-xs text-muted-foreground">{c.email || 'Pas d'email'} · {c.type}</div>
            </div>
            <Badge variant="outline" className="text-[9px]">{c.status}</Badge>
          </div>
        ))}
      </div>
    </div>
  )
}

function DealsTab({ deals, customers, post }: { deals: any[]; customers: any[]; post: any }) {
  const [showForm, setShowForm] = useState(false)
  const [customerId, setCustomerId] = useState('')
  const [title, setTitle] = useState('')
  const [value, setValue] = useState('')

  const stages = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST']

  return (
    <div className="space-y-4">
      <Button size="sm" onClick={() => setShowForm(!showForm)} className="bg-gold text-white">
        <Plus className="size-4 mr-1" /> Nouveau deal
      </Button>
      {showForm && (
        <Card className="glass-card gold-border p-4 space-y-2">
          <select className="w-full h-9 rounded-md border border-gold/20 bg-background px-2 text-sm" value={customerId} onChange={e => setCustomerId(e.target.value)}>
            <option value="">Sélectionner un client...</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.displayName}</option>)}
          </select>
          <Input placeholder="Titre du deal *" value={title} onChange={e => setTitle(e.target.value)} />
          <Input placeholder="Valeur estimée (cents USD)" type="number" value={value} onChange={e => setValue(e.target.value)} />
          <Button size="sm" onClick={async () => {
            const r = await post({ action: 'create_deal', customerId, title, estimatedValue: parseInt(value) || undefined })
            if (r) { setTitle(''); setValue(''); setCustomerId(''); setShowForm(false) }
          }} className="bg-gold text-white">Créer</Button>
        </Card>
      )}
      <div className="space-y-2">
        {deals.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Aucun deal</p>}
        {deals.map(d => (
          <div key={d.id} className="flex items-center justify-between p-3 rounded-lg border border-gold/10">
            <div>
              <div className="font-serif text-sm font-bold">{d.title}</div>
              <div className="text-xs text-muted-foreground">{d.customer?.displayName} · {d.estimatedValue ? `$${(d.estimatedValue/100).toFixed(2)}` : 'Sur devis'}</div>
            </div>
            <div className="flex items-center gap-2">
              <select className="h-7 text-xs rounded border border-gold/20 bg-background px-1" value={d.stage}
                onChange={e => post({ action: 'update_deal_stage', dealId: d.id, stage: e.target.value })}>
                {stages.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function OrdersTab({ orders, customers, post }: { orders: any[]; customers: any[]; post: any }) {
  const [showForm, setShowForm] = useState(false)
  const [customerId, setCustomerId] = useState('')
  const [desc, setDesc] = useState('')
  const [price, setPrice] = useState('')
  const [selectedOrder, setSelectedOrder] = useState('')

  return (
    <div className="space-y-4">
      <Button size="sm" onClick={() => setShowForm(!showForm)} className="bg-gold text-white">
        <Plus className="size-4 mr-1" /> Nouvelle commande
      </Button>
      {showForm && (
        <Card className="glass-card gold-border p-4 space-y-2">
          <select className="w-full h-9 rounded-md border border-gold/20 bg-background px-2 text-sm" value={customerId} onChange={e => setCustomerId(e.target.value)}>
            <option value="">Sélectionner un client...</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.displayName}</option>)}
          </select>
          <Button size="sm" onClick={async () => {
            const r = await post({ action: 'create_order', customerId })
            if (r) { setCustomerId(''); setShowForm(false); setSelectedOrder(r.order.id) }
          }} className="bg-gold text-white">Créer commande</Button>
        </Card>
      )}
      <div className="space-y-2">
        {orders.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Aucune commande</p>}
        {orders.map(o => (
          <div key={o.id} className="p-3 rounded-lg border border-gold/10 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-serif text-sm font-bold">Commande · {o.customer?.displayName}</div>
                <div className="text-xs text-muted-foreground">Total: ${(o.total/100).toFixed(2)} {o.currency} · {o.items?.length || 0} item(s)</div>
              </div>
              <Badge variant="outline" className="text-[9px]">{o.status}</Badge>
            </div>
            {o.status === 'DRAFT' && (
              <div className="flex gap-2">
                <Input placeholder="Description item" value={desc} onChange={e => setDesc(e.target.value)} className="h-8 text-xs" />
                <Input placeholder="Prix (cents)" type="number" value={price} onChange={e => setPrice(e.target.value)} className="h-8 text-xs w-24" />
                <Button size="sm" variant="outline" className="h-8" onClick={async () => {
                  const r = await post({ action: 'add_order_item', orderId: o.id, description: desc, unitPrice: parseInt(price) || 0 })
                  if (r) { setDesc(''); setPrice('') }
                }}>+ Item</Button>
                <Button size="sm" className="h-8 bg-gold text-white" onClick={() => post({ action: 'confirm_order', orderId: o.id })}>Confirmer</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function PaymentsTab({ payments, post }: { payments: any[]; post: any }) {
  return (
    <div className="space-y-2">
      {payments.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Aucun paiement</p>}
      {payments.map(p => (
        <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border border-gold/10">
          <div>
            <div className="font-serif text-sm font-bold">${(p.amount/100).toFixed(2)} {p.currency}</div>
            <div className="text-xs text-muted-foreground">{p.method} · {p.order?.customer?.displayName || 'N/A'}</div>
            {p.reference && <div className="text-xs text-muted-foreground">Réf: {p.reference}</div>}
          </div>
          <div className="flex items-center gap-2">
            <Badge className={
              p.status === 'VERIFIED' ? 'bg-emerald-500/20 text-emerald-600' :
              p.status === 'REJECTED' ? 'bg-red-500/20 text-red-600' :
              'bg-amber-500/20 text-amber-600'
            }>{p.status}</Badge>
            {p.status === 'AWAITING_VERIFICATION' && (
              <>
                <Button size="sm" className="h-7 bg-emerald-600 text-white" onClick={() => post({ action: 'verify_payment', paymentId: p.id })}>
                  <Check className="size-3" />
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-red-600" onClick={() => post({ action: 'reject_payment', paymentId: p.id, rejectionReason: 'Rejeté' })}>
                  <X className="size-3" />
                </Button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function DeliveryTab({ post, csrfToken }: { post: any; csrfToken: string }) {
  return (
    <div className="space-y-4">
      <Card className="glass-card gold-border p-4">
        <h3 className="font-serif text-sm font-bold mb-2">Statut des canaux de livraison</h3>
        <div className="space-y-1 text-xs">
          <div className="flex items-center justify-between p-2 rounded bg-emerald-500/10">
            <span>LINK</span><Badge className="bg-emerald-500/20 text-emerald-600">REAL</Badge>
          </div>
          <div className="flex items-center justify-between p-2 rounded bg-emerald-500/10">
            <span>QR</span><Badge className="bg-emerald-500/20 text-emerald-600">REAL</Badge>
          </div>
          <div className="flex items-center justify-between p-2 rounded bg-amber-500/10">
            <span>EMAIL</span><Badge className="bg-amber-500/20 text-amber-600">DEFER_EXTERNAL</Badge>
          </div>
          <div className="flex items-center justify-between p-2 rounded bg-amber-500/10">
            <span>SMS</span><Badge className="bg-amber-500/20 text-amber-600">DEFER_EXTERNAL</Badge>
          </div>
          <div className="flex items-center justify-between p-2 rounded bg-amber-500/10">
            <span>WHATSAPP</span><Badge className="bg-amber-500/20 text-amber-600">DEFER_EXTERNAL</Badge>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">LINK et QR sont générés localement. EMAIL/SMS/WHATSAPP nécessitent un provider externe configuré.</p>
      </Card>
    </div>
  )
}
