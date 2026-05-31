'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LogOut, MapPin, Heart, QrCode,
  Check, Share2, Link2,
  PartyPopper, Download, FileImage, FileText, Loader2, ChevronDown,
  MessageSquare, Send, Mail, Calendar, Clock, Users,
  CheckCircle2, XCircle, Gift, Sparkles, Crown, Star
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cleanGuestName } from '@/lib/guest-utils'
import type { CategoryDisplay } from '@/lib/guest-utils'

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
  table: { id: string; name: string; number: number } | null
  invitationViewed: boolean
  invitationViewCount: number
  lastAccessAt: string | null
  encryptedLink?: string
  rsvpAt?: string | null
  rsvpMessage?: string | null
  rsvpPlusOne?: boolean
}

interface Settings {
  [key: string]: string | undefined
}

interface GuestPersonalSpaceProps {
  guest: GuestData
  settings: Settings
  onLogout: () => void
}

function CategoryBadge({ catDisplay }: { catDisplay: CategoryDisplay }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] tracking-[0.12em] uppercase font-bold"
      style={{
        background: catDisplay.bgColor,
        border: `1px solid ${catDisplay.borderColor}`,
        color: catDisplay.color,
      }}
    >
      <span className="text-[11px]">{catDisplay.emoji}</span>
      {catDisplay.label}
    </span>
  )
}

const goldText: React.CSSProperties = {
  background: 'linear-gradient(135deg, #8B6914, #C4A265, #D4B87A, #C4A265, #8B6914)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
}

type RevealPhase = 'envelope' | 'opening' | 'revealing' | 'complete'

export default function GuestPersonalSpace({ guest, settings, onLogout }: GuestPersonalSpaceProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(true)
  const [copiedLink, setCopiedLink] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false)
  const [shareMenuOpen, setShareMenuOpen] = useState(false)
  const [revealPhase, setRevealPhase] = useState<RevealPhase>('envelope')
  const [rsvpStatus, setRsvpStatus] = useState<string>(guest.status)
  const [rsvpLoading, setRsvpLoading] = useState(false)
  const [rsvpMessage, setRsvpMessage] = useState('')
  const [rsvpDone, setRsvpDone] = useState(false)
  const invitationRef = useRef<HTMLDivElement>(null)
  const downloadRef = useRef<HTMLDivElement>(null)
  const [photo1Base64, setPhoto1Base64] = useState<string | null>(null)
  const [photo2Base64, setPhoto2Base64] = useState<string | null>(null)

  const cleanedName = cleanGuestName(guest.firstName, guest.lastName, guest.category)

  const groomName = settings.groom_name || 'Josué'
  const brideName = settings.bride_name || 'Hornella'
  const dateDisplay = settings.site_subtitle || 'Vendredi 26 Juin 2026'
  const venueName = settings.venue_name || 'Salle Polyvalente – Grand Palais Kinshasa'
  const venueAddress = settings.venue_address || '21 / 22 Avenue Bobozo'
  const venueReference = settings.venue_reference || 'Réf. Hôpital AKRAM, à la diagonale du Centre TELEMA'
  const venueTime = settings.venue_time || '21H30'
  const hashtag = settings.hashtag || '#JosueEtHornella2026'
  const closingMessage = settings.invitation_message || 'Votre présence rendra cette célébration encore plus mémorable.'

  const encryptedLinkUrl = guest.encryptedLink
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}?invite=${guest.encryptedLink}`
    : ''

  // Fetch QR code
  useEffect(() => {
    let cancelled = false
    async function fetchQR() {
      try {
        const res = await fetch(`/api/guests/qrcode/${guest.invitationCode}`)
        if (res.ok && !cancelled) {
          const data = await res.json()
          setQrCodeUrl(data.qrCode)
        }
      } catch { /* QR code is optional */ }
      finally { if (!cancelled) setQrLoading(false) }
    }
    fetchQR()
    return () => { cancelled = true }
  }, [guest.invitationCode])

  // Pre-load couple photos as base64 for download compatibility
  useEffect(() => {
    async function loadPhotos() {
      try {
        const [r1, r2] = await Promise.all([
          fetch('/uploads/couple-photo-1.jpeg'),
          fetch('/uploads/couple-photo-2.jpeg'),
        ])
        if (r1.ok) {
          const blob1 = await r1.blob()
          const reader1 = new FileReader()
          reader1.onloadend = () => setPhoto1Base64(reader1.result as string)
          reader1.readAsDataURL(blob1)
        }
        if (r2.ok) {
          const blob2 = await r2.blob()
          const reader2 = new FileReader()
          reader2.onloadend = () => setPhoto2Base64(reader2.result as string)
          reader2.readAsDataURL(blob2)
        }
      } catch { /* photos optional */ }
    }
    loadPhotos()
  }, [])

  // Auto-start envelope reveal
  useEffect(() => {
    const timer = setTimeout(() => setRevealPhase('opening'), 800)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (revealPhase === 'opening') {
      const timer = setTimeout(() => setRevealPhase('revealing'), 1200)
      return () => clearTimeout(timer)
    }
  }, [revealPhase])

  useEffect(() => {
    if (revealPhase === 'revealing') {
      const timer = setTimeout(() => setRevealPhase('complete'), 1500)
      return () => clearTimeout(timer)
    }
  }, [revealPhase])

  const handleCopyLink = useCallback(async (text: string) => {
    try { await navigator.clipboard.writeText(text) }
    catch {
      const ta = document.createElement('textarea')
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
    }
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2500)
  }, [])

  const handleRSVP = useCallback(async (status: 'CONFIRMED' | 'DECLINED') => {
    setRsvpLoading(true)
    try {
      const res = await fetch('/api/guest/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, message: rsvpMessage }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setRsvpStatus(status)
        setRsvpDone(true)
      }
    } catch { /* error */ }
    finally { setRsvpLoading(false) }
  }, [rsvpMessage])

  // Download handler — uses html2canvas-pro for reliable CSS rendering
  const handleDownload = useCallback(async (format: 'png' | 'jpg' | 'pdf') => {
    setDownloading(true); setDownloadMenuOpen(false)
    try {
      const html2canvas = (await import('html2canvas-pro')).default
      const { jsPDF } = await import('jspdf')

      const downloadEl = downloadRef.current
      if (!downloadEl) return

      // Temporarily show the hidden download element for rendering
      downloadEl.style.position = 'fixed'
      downloadEl.style.left = '0'
      downloadEl.style.top = '0'
      downloadEl.style.zIndex = '-9999'
      downloadEl.style.opacity = '1'
      downloadEl.style.pointerEvents = 'none'

      // Wait for all images inside the element
      const images = downloadEl.querySelectorAll('img')
      await Promise.all(
        Array.from(images).map(
          (img) => img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.onload = () => resolve()
                img.onerror = () => resolve()
              })
        )
      )
      await new Promise((r) => setTimeout(r, 200))

      const canvas = await html2canvas(downloadEl, {
        scale: 2,
        backgroundColor: '#FAF6EE',
        useCORS: true,
        allowTaint: true,
        logging: false,
      })

      // Hide again
      downloadEl.style.left = '-9999px'
      downloadEl.style.opacity = '0'

      const dataUrl = format === 'jpg'
        ? canvas.toDataURL('image/jpeg', 0.95)
        : canvas.toDataURL('image/png')

      const fileName = `invitation-${cleanedName.displayName.replace(/\s+/g, '-').toLowerCase()}`

      if (format === 'pdf') {
        const img = new window.Image(); img.src = dataUrl
        await new Promise(r => { img.onload = r })
        const cardAspect = img.width / img.height
        const isLandscape = cardAspect > 1
        const pdf = new jsPDF({
          orientation: isLandscape ? 'landscape' : 'portrait',
          unit: 'mm',
          format: 'a5',
        })
        const pageW = isLandscape ? 210 : 148
        const pageH = isLandscape ? 148 : 210
        const margin = 5
        const maxW = pageW - margin * 2
        const maxH = pageH - margin * 2
        let cardW = maxW
        let cardH = cardW / cardAspect
        if (cardH > maxH) { cardH = maxH; cardW = cardH * cardAspect }
        const offsetX = (pageW - cardW) / 2
        const offsetY = (pageH - cardH) / 2
        pdf.addImage(dataUrl, 'PNG', offsetX, offsetY, cardW, cardH)
        pdf.save(`${fileName}.pdf`)
      } else {
        const link = document.createElement('a')
        link.download = `${fileName}.${format}`; link.href = dataUrl; link.click()
      }
    } catch (error) { console.error('Download error:', error) }
    finally { setDownloading(false) }
  }, [cleanedName.displayName])

  const shareUrl = typeof window !== 'undefined' ? window.location.href : ''
  const shareText = `${cleanedName.shortGreeting} — Mariage de ${groomName} & ${brideName}, ${dateDisplay}`

  const handleShare = useCallback(async (channel: 'whatsapp' | 'messenger' | 'telegram' | 'email') => {
    const encodedUrl = encodeURIComponent(shareUrl)
    const encodedText = encodeURIComponent(shareText)
    const urls: Record<string, string> = {
      whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
      messenger: `https://www.facebook.com/dialog/send?link=${encodedUrl}&app_id=0&redirect_uri=${encodedUrl}`,
      telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
      email: `mailto:?subject=${encodeURIComponent(`Invitation — Mariage ${groomName} & ${brideName}`)}&body=${encodedText}%0A%0A${encodedUrl}`,
    }
    window.open(urls[channel], '_blank')
    setShareMenuOpen(false)
  }, [shareUrl, shareText, groomName, brideName])

  /* ══════════════════════════════════════════════════════════════
     HIDDEN DOWNLOAD-READY INVITATION
     Canvas-friendly: solid colors (no backgroundClip: text),
     emoji icons (no SVG), no Framer Motion
     ══════════════════════════════════════════════════════════════ */
  const downloadInvitation = (
    <div
      ref={downloadRef}
      style={{
        position: 'fixed',
        left: '-9999px',
        top: '0',
        zIndex: -9999,
        opacity: 0,
        pointerEvents: 'none',
        width: '700px',
        fontFamily: 'Playfair Display, Georgia, serif',
      }}
    >
      <div style={{
        width: '700px',
        display: 'flex',
        background: 'linear-gradient(175deg, #FDFAF3 0%, #FBF7EC 30%, #F7F1E5 60%, #FDFAF3 100%)',
        border: '2px solid rgba(196, 162, 101, 0.5)',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'relative', display: 'flex', width: '100%' }}>
          {/* Inner gold border */}
          <div style={{ position: 'absolute', inset: '5px', border: '1px solid rgba(196, 162, 101, 0.2)', pointerEvents: 'none', zIndex: 2 }} />

          {/* ZONE 1: PHOTOS (54%) */}
          <div style={{ width: '54%', position: 'relative', minHeight: '320px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
              {photo1Base64 && <img src={photo1Base64} alt={groomName} style={{ width: '50%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />}
              {photo2Base64 && <img src={photo2Base64} alt={brideName} style={{ width: '50%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />}
            </div>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(253,250,243,0.97) 0%, rgba(253,250,243,0.6) 30%, rgba(253,250,243,0.1) 50%, transparent 65%)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, transparent 55%, rgba(253,250,243,0.5) 75%, rgba(253,250,243,0.95) 95%)' }} />

            {/* Couple names */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 16px', zIndex: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#8B6914' }}>J & H</span>
                <div style={{ height: '1px', flex: 1, background: 'linear-gradient(to right, rgba(196,162,101,0.45), transparent)' }} />
              </div>
              <h1 style={{ fontSize: '30px', fontWeight: 'bold', color: '#8B6914', lineHeight: 1.1, margin: 0, fontFamily: 'Playfair Display, Georgia, serif' }}>
                {groomName} & {brideName}
              </h1>
              <p style={{ fontSize: '10px', letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(166,124,61,0.65)', fontWeight: 600, marginTop: '4px', fontFamily: 'Cormorant Garamond, sans-serif' }}>
                {dateDisplay}
              </p>
            </div>
          </div>

          {/* Gold separator */}
          <div style={{ width: '1px', alignSelf: 'stretch', background: 'linear-gradient(to bottom, transparent, rgba(196,162,101,0.3) 20%, rgba(196,162,101,0.4) 50%, rgba(196,162,101,0.3) 80%, transparent)' }} />

          {/* ZONES 2-4: INFO PANEL (46%) */}
          <div style={{ width: '46%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '16px 20px', gap: '10px' }}>

            {/* ZONE 2: GUEST INFO */}
            <div style={{ padding: '10px 12px', background: 'linear-gradient(180deg, rgba(196,162,101,0.05) 0%, rgba(196,162,101,0.1) 50%, rgba(196,162,101,0.05) 100%)', border: '1px solid rgba(196,162,101,0.2)', position: 'relative' }}>
              <div style={{ position: 'absolute', inset: '2px', border: '1px solid rgba(196,162,101,0.07)', pointerEvents: 'none' }} />
              <p style={{ fontSize: '8px', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(166,124,61,0.6)', fontWeight: 600, margin: 0, fontFamily: 'Cormorant Garamond, sans-serif' }}>
                {cleanedName.isCouple ? 'Invitation pour le' : cleanedName.isFamille ? 'Invitation pour la' : 'Invitation pour'}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#8B6914', lineHeight: 1.2, margin: 0, fontFamily: 'Playfair Display, Georgia, serif' }}>
                  {cleanedName.displayName}
                </h2>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '999px', fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 'bold', background: cleanedName.categoryDisplay.bgColor, border: `1px solid ${cleanedName.categoryDisplay.borderColor}`, color: cleanedName.categoryDisplay.color }}>
                  <span style={{ fontSize: '11px' }}>{cleanedName.categoryDisplay.emoji}</span>
                  {cleanedName.categoryDisplay.label}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '14px' }}>&#127979;</span>
                  <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#8B6914', fontFamily: 'Playfair Display, Georgia, serif' }}>
                    Table {guest.table?.number ?? '—'}
                  </span>
                </div>
                <div style={{ height: '16px', width: '1px', background: 'rgba(196,162,101,0.25)' }} />
                <span style={{ fontSize: '10px', letterSpacing: '0.05em', color: 'rgba(166,124,61,0.65)', fontWeight: 500, fontFamily: 'Cormorant Garamond, sans-serif' }}>
                  {guest.seats} place{guest.seats > 1 ? 's' : ''} r&#233;serv&#233;e{guest.seats > 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* ZONE 3: WEDDING INFO */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', padding: '0 2px' }}>
              <div style={{ display: 'flex', alignItems: 'start', gap: '6px' }}>
                <span style={{ fontSize: '14px', marginTop: '1px' }}>&#128197;</span>
                <div>
                  <p style={{ fontSize: '7px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(166,124,61,0.5)', fontWeight: 600, margin: 0, fontFamily: 'Cormorant Garamond, sans-serif' }}>Date</p>
                  <p style={{ fontSize: '11px', fontWeight: 600, color: '#5C4A1E', lineHeight: 1.3, margin: 0, fontFamily: 'Playfair Display, Georgia, serif' }}>{dateDisplay}</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'start', gap: '6px' }}>
                <span style={{ fontSize: '14px', marginTop: '1px' }}>&#128336;</span>
                <div>
                  <p style={{ fontSize: '7px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(166,124,61,0.5)', fontWeight: 600, margin: 0, fontFamily: 'Cormorant Garamond, sans-serif' }}>Heure</p>
                  <p style={{ fontSize: '11px', fontWeight: 600, color: '#5C4A1E', lineHeight: 1.3, margin: 0, fontFamily: 'Playfair Display, Georgia, serif' }}>{venueTime}</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'start', gap: '6px', gridColumn: '1 / -1' }}>
                <span style={{ fontSize: '14px', marginTop: '1px' }}>&#128205;</span>
                <div>
                  <p style={{ fontSize: '7px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(166,124,61,0.5)', fontWeight: 600, margin: 0, fontFamily: 'Cormorant Garamond, sans-serif' }}>Lieu</p>
                  <p style={{ fontSize: '11px', fontWeight: 600, color: '#5C4A1E', lineHeight: 1.3, margin: 0, fontFamily: 'Playfair Display, Georgia, serif' }}>{venueName}</p>
                  <p style={{ fontSize: '9px', color: 'rgba(122,106,74,0.55)', lineHeight: 1.3, margin: 0, fontFamily: 'Cormorant Garamond, sans-serif' }}>{venueAddress}</p>
                  {venueReference && (
                    <p style={{ fontSize: '8px', color: 'rgba(122,106,74,0.4)', fontStyle: 'italic', lineHeight: 1.3, margin: 0, marginTop: '2px', fontFamily: 'Cormorant Garamond, sans-serif' }}>{venueReference}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Gold divider */}
            <div style={{ height: '1px', width: '100%', background: 'linear-gradient(to right, transparent, rgba(196,162,101,0.25) 30%, rgba(196,162,101,0.25) 70%, transparent)' }} />

            {/* ZONE 4: QR CODE + CLOSING */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
              <div style={{ flexShrink: 0 }}>
                <p style={{ fontSize: '7px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(166,124,61,0.5)', fontWeight: 600, margin: 0, marginBottom: '4px', fontFamily: 'Cormorant Garamond, sans-serif' }}>Votre acc&#232;s personnel</p>
                <div style={{ display: 'inline-block', padding: '6px', background: '#fff', boxShadow: '0 1px 8px rgba(196,162,101,0.12)' }}>
                  {qrCodeUrl ? (
                    <img src={qrCodeUrl} alt="QR Code" style={{ width: '64px', height: '64px' }} />
                  ) : (
                    <div style={{ width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', color: 'rgba(196,162,101,0.2)' }}>&#9633;</div>
                  )}
                </div>
                <p style={{ fontSize: '6px', color: 'rgba(166,124,61,0.35)', textAlign: 'center', margin: 0, marginTop: '4px', fontFamily: 'Cormorant Garamond, sans-serif' }}>Pr&#233;sentez &#224; l&apos;entr&#233;e</p>
              </div>
              <div style={{ flex: 1, minWidth: 0, paddingBottom: '4px' }}>
                <p style={{ fontSize: '8px', color: 'rgba(122,106,74,0.45)', fontStyle: 'italic', lineHeight: 1.5, margin: 0, fontFamily: 'Cormorant Garamond, sans-serif' }}>{closingMessage}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
                  <span style={{ fontSize: '10px', color: 'rgba(196,162,101,0.3)' }}>&#9829;</span>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#8B6914', fontFamily: 'Playfair Display, Georgia, serif' }}>{groomName} & {brideName}</span>
                </div>
                <p style={{ fontSize: '7px', letterSpacing: '0.1em', color: 'rgba(196,162,101,0.3)', fontWeight: 600, margin: 0, marginTop: '2px', fontFamily: 'Cormorant Garamond, sans-serif' }}>{hashtag}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  /* ══════════════════════════════════════════════════════════════
     RENDER — ENVELOPE REVEAL PHASE
     ══════════════════════════════════════════════════════════════ */
  if (revealPhase === 'envelope' || revealPhase === 'opening') {
    return (
      <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #0A0A0F 0%, #141420 40%, #0F0D18 100%)' }} />
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(12)].map((_, i) => (
            <motion.div key={i}
              className="absolute rounded-full"
              style={{ left: `${8 + i * 8}%`, top: `${10 + (i % 4) * 25}%`, width: `${1 + (i % 3)}px`, height: `${1 + (i % 3)}px`, backgroundColor: `rgba(196, 162, 101, ${0.15 + (i % 3) * 0.08})` }}
              animate={{ y: [-15, 15, -15], opacity: [0.1, 0.3, 0.1] }}
              transition={{ duration: 5 + i * 0.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.4 }}
            />
          ))}
        </div>
        <motion.div initial={{ opacity: 0, y: 40, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.8, ease: "easeOut" }} className="relative z-10">
          <div className="relative w-[320px] sm:w-[380px]">
            <motion.div className="relative" style={{ background: 'linear-gradient(175deg, #F5EFE3 0%, #EDE5D5 50%, #E8DCC8 100%)', borderRadius: '8px', boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 40px rgba(196,162,101,0.15)' }}>
              <div className="absolute inset-0 rounded-[8px]" style={{ border: '1.5px solid rgba(196,162,101,0.4)' }} />
              <div className="absolute inset-[4px] rounded-[6px]" style={{ border: '1px solid rgba(196,162,101,0.15)' }} />
              <div className="relative p-8 text-center">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.5, type: 'spring', stiffness: 200, damping: 15 }} className="absolute -top-6 left-1/2 -translate-x-1/2 z-20">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8B6914, #C4A265, #D4B87A)', boxShadow: '0 4px 12px rgba(196,162,101,0.4), inset 0 1px 2px rgba(255,255,255,0.3)' }}>
                    <Heart className="size-5 text-white fill-white" />
                  </div>
                </motion.div>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8, duration: 0.6 }} className="font-display text-[10px] tracking-[0.3em] uppercase mt-4 mb-3" style={{ color: 'rgba(139,105,20,0.5)' }}>Vous &#234;tes invit&#233;(e)</motion.p>
                <motion.h2 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.0, duration: 0.8 }} className="font-serif text-3xl sm:text-4xl font-bold mb-2" style={goldText}>{groomName} & {brideName}</motion.h2>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2, duration: 0.6 }} className="font-display text-[10px] tracking-[0.2em] uppercase mb-6" style={{ color: 'rgba(139,105,20,0.6)' }}>{dateDisplay}</motion.p>
                {revealPhase === 'opening' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center gap-2">
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }} className="w-5 h-5 border-2 rounded-full" style={{ borderColor: 'rgba(196,162,101,0.2)', borderTopColor: '#C4A265' }} />
                    <span className="font-display text-[10px] tracking-[0.15em] uppercase" style={{ color: 'rgba(139,105,20,0.5)' }}>Ouverture...</span>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </div>
        </motion.div>
      </section>
    )
  }

  /* ══════════════════════════════════════════════════════════════
     RENDER — REVEALING / COMPLETE PHASE
     ══════════════════════════════════════════════════════════════ */
  return (
    <section className="relative overflow-hidden min-h-screen flex flex-col items-center justify-start py-4 sm:py-6 px-3 sm:px-4">
      {/* Hidden download-ready version for canvas capture */}
      {downloadInvitation}

      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, #FAF6EE 0%, #F5EFE3 40%, #F0E8D8 70%, #FAF6EE 100%)' }} />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(8)].map((_, i) => (
          <motion.div key={i} className="absolute rounded-full" style={{ left: `${10 + i * 12}%`, top: `${5 + i * 12}%`, width: `${1 + (i % 2)}px`, height: `${1 + (i % 2)}px`, backgroundColor: `rgba(196, 162, 101, ${0.08 + (i % 2) * 0.04})` }} animate={{ y: [0, -10, 0], opacity: [0.08, 0.2, 0.08] }} transition={{ duration: 4 + i * 0.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.8 }} />
        ))}
      </div>

      <div className="relative z-10 w-full max-w-2xl">
        <motion.div initial={{ opacity: 0, y: 30, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.8, ease: "easeOut" }}>
          <div ref={invitationRef} className="relative w-full overflow-hidden shadow-2xl" style={{ background: 'linear-gradient(175deg, #FDFAF3 0%, #FBF7EC 30%, #F7F1E5 60%, #FDFAF3 100%)', boxShadow: '0 20px 60px rgba(0,0,0,0.12), 0 0 30px rgba(196,162,101,0.08)' }}>
            <div className="absolute inset-0 z-[1] pointer-events-none" style={{ border: '2px solid rgba(196, 162, 101, 0.5)' }} />
            <div className="absolute inset-[5px] z-[1] pointer-events-none" style={{ border: '1px solid rgba(196, 162, 101, 0.2)' }} />
            <motion.div className="absolute inset-0 z-[2] pointer-events-none" style={{ background: 'linear-gradient(105deg, transparent 40%, rgba(196,162,101,0.05) 45%, rgba(196,162,101,0.02) 50%, transparent 55%)', backgroundSize: '200% 100%' }} animate={{ backgroundPosition: ['200% 0', '-200% 0'] }} transition={{ duration: 8, repeat: Infinity, ease: 'linear', repeatDelay: 6 }} />

            <div className="relative z-10 flex flex-col md:flex-row">
              {/* ZONE 1: PHOTOS */}
              <div className="relative md:w-[54%] shrink-0 overflow-hidden aspect-[16/10] md:aspect-auto md:min-h-[300px] lg:min-h-[340px]">
                <div className="absolute inset-0 flex">
                  <div className="w-1/2 h-full relative overflow-hidden">
                    <img src={photo1Base64 || '/uploads/couple-photo-1.jpeg'} alt={groomName} className="w-full h-full object-cover object-top" />
                  </div>
                  <div className="w-1/2 h-full relative overflow-hidden">
                    <img src={photo2Base64 || '/uploads/couple-photo-2.jpeg'} alt={brideName} className="w-full h-full object-cover object-top" />
                  </div>
                </div>
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(253,250,243,0.97) 0%, rgba(253,250,243,0.6) 30%, rgba(253,250,243,0.1) 50%, transparent 65%)' }} />
                <div className="hidden md:block absolute inset-0" style={{ background: 'linear-gradient(to right, transparent 55%, rgba(253,250,243,0.5) 75%, rgba(253,250,243,0.95) 95%)' }} />
                <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 z-10">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-serif text-xl sm:text-2xl font-bold" style={goldText}>J & H</span>
                    <div className="h-px flex-1" style={{ background: 'linear-gradient(to right, rgba(196,162,101,0.45), transparent)' }} />
                  </div>
                  <h1 className="font-serif text-2xl sm:text-3xl md:text-[32px] font-bold leading-tight" style={goldText}>{groomName} & {brideName}</h1>
                  <p className="font-display text-[8px] sm:text-[10px] tracking-[0.25em] uppercase text-[#A67C3D]/65 font-semibold mt-1">{dateDisplay}</p>
                </div>
              </div>

              <div className="hidden md:block w-px self-stretch" style={{ background: 'linear-gradient(to bottom, transparent, rgba(196,162,101,0.3) 20%, rgba(196,162,101,0.4) 50%, rgba(196,162,101,0.3) 80%, transparent)' }} />
              <div className="md:hidden h-px w-full" style={{ background: 'linear-gradient(to right, transparent, rgba(196,162,101,0.3) 20%, rgba(196,162,101,0.4) 50%, rgba(196,162,101,0.3) 80%, transparent)' }} />

              {/* ZONES 2-4: INFO PANEL */}
              <div className="md:w-[46%] flex flex-col justify-between p-3 sm:p-4 md:p-5 gap-2 sm:gap-2.5">
                {/* ZONE 2: GUEST INFO */}
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3, duration: 0.6 }} className="relative py-2.5 px-3" style={{ background: 'linear-gradient(180deg, rgba(196,162,101,0.05) 0%, rgba(196,162,101,0.1) 50%, rgba(196,162,101,0.05) 100%)', border: '1px solid rgba(196,162,101,0.2)' }}>
                  <div className="absolute inset-0.5 pointer-events-none" style={{ border: '1px solid rgba(196,162,101,0.07)' }} />
                  <p className="font-display text-[7px] sm:text-[8px] tracking-[0.3em] uppercase text-[#A67C3D]/60 font-semibold">{cleanedName.isCouple ? 'Invitation pour le' : cleanedName.isFamille ? 'Invitation pour la' : 'Invitation pour'}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <h2 className="font-serif text-lg sm:text-xl font-bold leading-tight" style={goldText}>{cleanedName.displayName}</h2>
                    <CategoryBadge catDisplay={cleanedName.categoryDisplay} />
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex items-center gap-1.5">
                      <Users className="size-3.5 text-[#C4A265]/65" />
                      <span className="font-serif text-sm sm:text-base font-bold" style={{ color: '#8B6914' }}>Table {guest.table?.number ?? '—'}</span>
                    </div>
                    <div className="h-4 w-px" style={{ background: 'rgba(196,162,101,0.25)' }} />
                    <span className="font-display text-[9px] sm:text-[10px] tracking-wider text-[#A67C3D]/65 font-medium">{guest.seats} place{guest.seats > 1 ? 's' : ''} r&#233;serv&#233;e{guest.seats > 1 ? 's' : ''}</span>
                  </div>
                </motion.div>

                {/* ZONE 3: WEDDING INFO */}
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5, duration: 0.6 }} className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-0.5">
                  <div className="flex items-start gap-2">
                    <Calendar className="size-3.5 text-[#C4A265]/65 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-display text-[7px] tracking-[0.2em] uppercase text-[#A67C3D]/50 font-semibold">Date</p>
                      <p className="font-serif text-[10px] sm:text-[11px] font-semibold text-[#5C4A1E] leading-tight">{dateDisplay}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Clock className="size-3.5 text-[#C4A265]/65 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-display text-[7px] tracking-[0.2em] uppercase text-[#A67C3D]/50 font-semibold">Heure</p>
                      <p className="font-serif text-[10px] sm:text-[11px] font-semibold text-[#5C4A1E] leading-tight">{venueTime}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 col-span-2">
                    <MapPin className="size-3.5 text-[#C4A265]/65 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-display text-[7px] tracking-[0.2em] uppercase text-[#A67C3D]/50 font-semibold">Lieu</p>
                      <p className="font-serif text-[10px] sm:text-[11px] font-semibold text-[#5C4A1E] leading-tight">{venueName}</p>
                      <p className="font-display text-[8px] sm:text-[9px] text-[#7A6A4A]/55 leading-tight">{venueAddress}</p>
                      {venueReference && <p className="font-display text-[7px] sm:text-[8px] text-[#7A6A4A]/40 italic leading-tight mt-0.5">{venueReference}</p>}
                    </div>
                  </div>
                </motion.div>

                <div className="h-px w-full" style={{ background: 'linear-gradient(to right, transparent, rgba(196,162,101,0.25) 30%, rgba(196,162,101,0.25) 70%, transparent)' }} />

                {/* ZONE 4: QR CODE + CLOSING */}
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.7, duration: 0.6 }} className="flex items-end gap-3">
                  <div className="shrink-0">
                    <p className="font-display text-[7px] tracking-[0.2em] uppercase text-[#A67C3D]/50 font-semibold mb-1">Votre acc&#232;s personnel</p>
                    <div className="inline-block p-1.5 bg-white" style={{ boxShadow: '0 1px 8px rgba(196,162,101,0.12)' }}>
                      <AnimatePresence mode="wait">
                        {qrLoading ? (
                          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-[52px] h-[52px] sm:w-[64px] sm:h-[64px] flex items-center justify-center">
                            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }} className="size-4 border-2 border-[#C4A265]/20 border-t-[#C4A265] rounded-full" />
                          </motion.div>
                        ) : qrCodeUrl ? (
                          <motion.div key="qr" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 20 }}>
                            <img src={qrCodeUrl} alt="QR Code" className="w-[52px] h-[52px] sm:w-[64px] sm:h-[64px]" />
                          </motion.div>
                        ) : (
                          <motion.div key="fallback" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-[52px] h-[52px] sm:w-[64px] sm:h-[64px] flex items-center justify-center">
                            <QrCode className="size-6 text-[#C4A265]/20" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    <p className="font-display text-[6px] text-[#A67C3D]/35 mt-1 text-center">Pr&#233;sentez &#224; l&apos;entr&#233;e</p>
                  </div>
                  <div className="flex-1 min-w-0 pb-1">
                    <p className="font-display text-[7px] sm:text-[8px] text-[#7A6A4A]/45 italic leading-snug">{closingMessage}</p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Heart className="size-2.5 text-[#C4A265]/30 fill-[#C4A265]/15" />
                      <span className="font-serif text-[11px] sm:text-xs font-bold" style={goldText}>{groomName} & {brideName}</span>
                    </div>
                    <p className="font-display text-[6px] sm:text-[7px] tracking-wider text-[#C4A265]/30 font-semibold mt-0.5">{hashtag}</p>
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* RSVP SECTION */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8, duration: 0.6 }} className="mt-5">
          <div className="relative p-5 sm:p-6 text-center" style={{ background: 'linear-gradient(175deg, rgba(196,162,101,0.04) 0%, rgba(196,162,101,0.08) 50%, rgba(196,162,101,0.04) 100%)', border: '1px solid rgba(196,162,101,0.2)' }}>
            <div className="absolute inset-1 pointer-events-none" style={{ border: '1px solid rgba(196,162,101,0.06)' }} />
            <h3 className="font-serif text-xl sm:text-2xl font-bold mb-2" style={goldText}>Confirmer ma pr&#233;sence</h3>
            <p className="font-display text-[10px] sm:text-[11px] text-[#7A6A4A]/55 mb-5">{groomName} & {brideName} souhaitent conna&#238;tre votre r&#233;ponse</p>
            {rsvpDone || rsvpStatus === 'CONFIRMED' || rsvpStatus === 'DECLINED' ? (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full" style={{ background: rsvpStatus === 'CONFIRMED' ? 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(16,185,129,0.15))' : 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(239,68,68,0.12))', border: `1px solid ${rsvpStatus === 'CONFIRMED' ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.2)'}` }}>
                {rsvpStatus === 'CONFIRMED' ? (
                  <><CheckCircle2 className="size-4 text-emerald-500" /><span className="font-display text-xs font-bold text-emerald-700">Pr&#233;sence confirm&#233;e !</span><Sparkles className="size-3 text-emerald-400" /></>
                ) : (
                  <><XCircle className="size-4 text-red-400" /><span className="font-display text-xs font-bold text-red-600">D&#233;clin&#233;</span></>
                )}
              </motion.div>
            ) : (
              <div className="space-y-4">
                <div className="max-w-sm mx-auto">
                  <Textarea placeholder="Un petit mot pour les mari&#233;s (optionnel)..." value={rsvpMessage} onChange={(e) => setRsvpMessage(e.target.value)} className="h-16 text-[11px] font-display resize-none bg-[#FDFAF3] border-[rgba(196,162,101,0.15)] text-[#5C4A1E] placeholder:text-[#A67C3D]/30 focus:border-[#C4A265]/40" />
                </div>
                <div className="flex items-center justify-center gap-3">
                  <Button onClick={() => handleRSVP('CONFIRMED')} disabled={rsvpLoading} className="gap-2 px-5 py-2.5 font-display text-[10px] tracking-[0.1em] uppercase font-bold shadow-lg transition-all duration-300 rounded-sm h-10" style={{ background: 'linear-gradient(135deg, #059669, #10B981, #34D399)', color: '#FDFAF3', boxShadow: '0 4px 15px rgba(16,185,129,0.25)' }}>
                    {rsvpLoading ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}Je serai pr&#233;sent
                  </Button>
                  <Button onClick={() => handleRSVP('DECLINED')} disabled={rsvpLoading} variant="outline" className="gap-2 px-5 py-2.5 font-display text-[10px] tracking-[0.1em] uppercase font-semibold transition-all duration-300 rounded-sm h-10" style={{ borderColor: 'rgba(239,68,68,0.2)', color: '#DC2626' }}>
                    <XCircle className="size-4" />Je ne pourrai pas
                  </Button>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* ACTION BUTTONS */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.0, duration: 0.5 }} className="mt-3 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-2.5">
          <div className="relative">
            <Button onClick={() => { setDownloadMenuOpen(!downloadMenuOpen); setShareMenuOpen(false) }} disabled={downloading} className="gap-2 px-4 py-2 font-display text-[10px] tracking-[0.1em] uppercase font-semibold shadow-lg transition-all duration-300 rounded-sm h-9" style={{ background: 'linear-gradient(135deg, #A67C3D, #C4A265, #D4B87A)', color: '#FDFAF3', boxShadow: '0 3px 12px rgba(196,162,101,0.2)' }}>
              {downloading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}{downloading ? 'G&#233;n&#233;ration...' : 'T&#233;l&#233;charger'}<ChevronDown className={`size-2.5 transition-transform duration-200 ${downloadMenuOpen ? 'rotate-180' : ''}`} />
            </Button>
            <AnimatePresence>
              {downloadMenuOpen && (
                <motion.div initial={{ opacity: 0, y: -4, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.95 }} transition={{ duration: 0.12 }} className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-40 py-1 shadow-xl z-50 rounded-sm" style={{ background: '#FDFAF3', border: '1px solid rgba(196,162,101,0.25)' }}>
                  {([{ format: 'pdf' as const, icon: FileText, label: 'PDF HD' }, { format: 'png' as const, icon: FileImage, label: 'PNG HD' }, { format: 'jpg' as const, icon: FileImage, label: 'JPG' }]).map((item) => (
                    <button key={item.format} onClick={() => handleDownload(item.format)} disabled={downloading} className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[rgba(196,162,101,0.06)] transition-colors">
                      <item.icon className="size-3 text-[#C4A265]" /><span className="font-display text-[10px] tracking-wide text-[#5C4A1E] font-medium">{item.label}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="relative">
            <Button onClick={() => { setShareMenuOpen(!shareMenuOpen); setDownloadMenuOpen(false) }} variant="outline" className="gap-2 px-4 py-2 font-display text-[10px] tracking-[0.1em] uppercase font-semibold transition-all duration-300 rounded-sm h-9" style={{ borderColor: 'rgba(196,162,101,0.3)', color: '#A67C3D' }}>
              <Share2 className="size-3.5" />Partager<ChevronDown className={`size-2.5 transition-transform duration-200 ${shareMenuOpen ? 'rotate-180' : ''}`} />
            </Button>
            <AnimatePresence>
              {shareMenuOpen && (
                <motion.div initial={{ opacity: 0, y: -4, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.95 }} transition={{ duration: 0.12 }} className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-40 py-1 shadow-xl z-50 rounded-sm" style={{ background: '#FDFAF3', border: '1px solid rgba(196,162,101,0.25)' }}>
                  {([{ channel: 'whatsapp' as const, icon: MessageSquare, label: 'WhatsApp', color: '#25D366' }, { channel: 'telegram' as const, icon: Send, label: 'Telegram', color: '#0088CC' }, { channel: 'email' as const, icon: Mail, label: 'Email', color: '#A67C3D' }]).map((item) => (
                    <button key={item.channel} onClick={() => handleShare(item.channel)} className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[rgba(196,162,101,0.06)] transition-colors">
                      <item.icon className="size-3" style={{ color: item.color }} /><span className="font-display text-[10px] tracking-wide text-[#5C4A1E] font-medium">{item.label}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {guest.encryptedLink && (
            <Button onClick={() => handleCopyLink(encryptedLinkUrl)} variant="outline" className="gap-2 px-4 py-2 font-display text-[10px] tracking-[0.1em] uppercase font-semibold transition-all duration-300 rounded-sm h-9" style={{ borderColor: 'rgba(196,162,101,0.3)', color: '#A67C3D' }}>
              {copiedLink ? <Check className="size-3.5 text-emerald-500" /> : <Link2 className="size-3.5" />}{copiedLink ? 'Copi&#233; !' : 'Lien'}
            </Button>
          )}
        </motion.div>

        {/* ENCRYPTED LINK */}
        {guest.encryptedLink && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2, duration: 0.5 }} className="mt-2">
            <div className="flex items-center gap-2 p-2.5 rounded-sm" style={{ background: 'rgba(196,162,101,0.04)', border: '1px solid rgba(196,162,101,0.1)' }}>
              <Link2 className="size-3 text-[#C4A265]/50" />
              <span className="font-display text-[9px] text-[#7A6A4A]/55">Lien personnel :</span>
              <Input readOnly value={encryptedLinkUrl} className="h-6 text-[9px] font-mono bg-transparent border-none p-0 text-[#A67C3D]/70 focus:ring-0" />
              <Button variant="outline" size="sm" onClick={() => handleCopyLink(encryptedLinkUrl)} className="h-6 px-2 text-[9px] font-display" style={{ borderColor: 'rgba(196,162,101,0.2)', color: '#A67C3D' }}>{copiedLink ? '✓' : 'Copier'}</Button>
            </div>
          </motion.div>
        )}

        {/* LOGOUT */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5, duration: 0.5 }} className="mt-4 text-center">
          <Button variant="ghost" size="sm" onClick={onLogout} className="gap-1.5 font-display text-[10px] tracking-wider uppercase text-[#7A6A4A]/40 hover:text-[#7A6A4A]/70">
            <LogOut className="size-2.5" />D&#233;connexion
          </Button>
        </motion.div>
      </div>
    </section>
  )
}
