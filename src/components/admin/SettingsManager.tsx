'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Save, Loader2, Settings as SettingsIcon } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

interface SettingsManagerProps {
  token: string
  userRole: string
  onSessionExpired: () => void
}

// Default settings keys for the wedding platform
const SETTINGS_GROUPS = [
  {
    title: 'Informations du Couple',
    keys: [
      { key: 'groom_name', label: 'Nom du Marié' },
      { key: 'bride_name', label: 'Nom de la Mariée' },
      { key: 'couple_story', label: 'Histoire du Couple', multiline: true },
    ],
  },
  {
    title: 'Informations du Mariage',
    keys: [
      { key: 'wedding_date', label: 'Date du Mariage', type: 'date' },
      { key: 'wedding_time', label: 'Heure de la Cérémonie' },
      { key: 'venue_name', label: 'Nom du Lieu' },
      { key: 'venue_address', label: 'Adresse du Lieu' },
      { key: 'venue_reference', label: 'Référence / Indication' },
      { key: 'venue_city', label: 'Ville' },
      { key: 'venue_lat', label: 'Latitude GPS', type: 'text' },
      { key: 'venue_lng', label: 'Longitude GPS', type: 'text' },
      { key: 'venue_time', label: 'Heure de la Cérémonie' },
      { key: 'venue_parking', label: 'Parking' },
      { key: 'reception_venue', label: 'Lieu de Réception' },
    ],
  },
  {
    title: 'Invitation Digitale',
    keys: [
      { key: 'invitation_message', label: 'Message d\'invitation', multiline: true },
      { key: 'site_title', label: 'Titre du Site' },
      { key: 'site_subtitle', label: 'Sous-titre (Date affichée)' },
    ],
  },
  {
    title: 'Contact & RSVP',
    keys: [
      { key: 'contact_email', label: 'Email de Contact', type: 'email' },
      { key: 'contact_phone', label: 'Téléphone de Contact' },
      { key: 'rsvp_deadline', label: 'Date Limite RSVP', type: 'date' },
      { key: 'rsvp_message', label: 'Message RSVP' },
    ],
  },
  {
    title: 'Apparence',
    keys: [
      { key: 'primary_color', label: 'Couleur Principale' },
      { key: 'accent_color', label: 'Couleur d\'Accent' },
    ],
  },
  {
    title: 'Personnalisation',
    keys: [
      { key: 'welcome_message', label: 'Message d\'Accueil' },
      { key: 'thank_you_message', label: 'Message de Remerciement' },
      { key: 'hashtag', label: 'Hashtag du Mariage' },
    ],
  },
]

export default function SettingsManager({ token, userRole, onSessionExpired }: SettingsManagerProps) {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const isSuperAdmin = userRole === 'SUPER_ADMIN'

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings')
      if (res.ok) {
        const json = await res.json()
        setSettings(json.settings || {})
      }
    } catch {
      toast.error('Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ settings }),
      })
      if (res.status === 401) { onSessionExpired(); return }
      const json = await res.json()
      if (res.ok) {
        toast.success('Paramètres sauvegardés')
        setSettings(json.settings || {})
      } else {
        toast.error(json.error || 'Erreur')
      }
    } catch {
      toast.error('Erreur de connexion')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-10 w-48" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    )
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <SettingsIcon className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground">Accès réservé aux Super Admins</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Paramètres</h2>
          <p className="text-sm text-muted-foreground">Configurer la plateforme</p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          size="sm"
          className="bg-gradient-gold text-white"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Sauvegarder
        </Button>
      </div>

      {/* Settings Groups */}
      {SETTINGS_GROUPS.map((group, gi) => (
        <motion.div
          key={group.title}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: gi * 0.05 }}
        >
          <Card className="glass-card gold-border border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-gold">{group.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {group.keys.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{field.label}</Label>
                  {field.multiline ? (
                    <Textarea
                      value={settings[field.key] || ''}
                      onChange={(e) => setSettings({ ...settings, [field.key]: e.target.value })}
                      placeholder={field.label}
                      className="bg-white/5 min-h-[100px] resize-y"
                      rows={4}
                    />
                  ) : (
                    <Input
                      type={field.type || 'text'}
                      value={settings[field.key] || ''}
                      onChange={(e) => setSettings({ ...settings, [field.key]: e.target.value })}
                      placeholder={field.label}
                      className="bg-white/5"
                    />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      ))}

      {/* Save Button Bottom */}
      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-gradient-gold text-white min-w-40"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Sauvegarder tout
        </Button>
      </div>
    </div>
  )
}
