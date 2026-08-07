'use client';

// ══════════════════════════════════════════════════════════════════════════════
// OrgSettings — client island for the org settings page
// ══════════════════════════════════════════════════════════════════════════════
//
// Three sections:
//   1. Informations générales — name, email, phone, description, websiteUrl, address
//   2. Identité visuelle (Branding) — logoUrl, brandColor (with live preview)
//   3. Domaine personnalisé (White Label) — customDomain (with DNS setup note)
//
// All edits PATCH /api/org/[slug]. After successful save, the new org state
// replaces the local state (optimistic UI updates + revert on failure).
//
// brandColor preview: a small swatch + the live <style> override (just for
// the preview box) demonstrates how the wedding pages will look once the
// white-label domain is configured. The actual production override is done
// by <ThemeInjector> (P1.10) when the request arrives via customDomain.

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Save, Loader2, Palette, Globe, AlertCircle, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PLAN_LABELS } from '@/lib/ui-labels';
import type { Plan } from '@/lib/types';

// Org-status labels (Organization.status is ACTIVE/SUSPENDED/ARCHIVED).
const ORG_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Actif',
  SUSPENDED: 'Suspendu',
  ARCHIVED: 'Archivé',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SettingsOrg {
  id: string;
  slug: string;
  name: string;
  email: string;
  phone: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  customDomain: string | null;
  status: string;
  plan: string;
  maxWeddings: number;
  maxMembers: number;
  description: string | null;
  websiteUrl: string | null;
  address: string | null;
}

export interface OrgSettingsProps {
  org: SettingsOrg;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OrgSettings({ org: initialOrg }: OrgSettingsProps) {
  const router = useRouter();
  const [org, setOrg] = useState<SettingsOrg>(initialOrg);
  const [saving, setSaving] = useState(false);

  // ─── Form state (one field per org attribute, initialized from org) ────
  const [form, setForm] = useState({
    name: initialOrg.name,
    email: initialOrg.email,
    phone: initialOrg.phone ?? '',
    logoUrl: initialOrg.logoUrl ?? '',
    brandColor: initialOrg.brandColor ?? '',
    customDomain: initialOrg.customDomain ?? '',
    description: initialOrg.description ?? '',
    websiteUrl: initialOrg.websiteUrl ?? '',
    address: initialOrg.address ?? '',
  });

  // Track dirty state to enable/disable the save button.
  const isDirty =
    form.name !== org.name ||
    form.email !== org.email ||
    (form.phone || null) !== org.phone ||
    (form.logoUrl || null) !== org.logoUrl ||
    (form.brandColor || null) !== org.brandColor ||
    (form.customDomain || null) !== org.customDomain ||
    (form.description || null) !== org.description ||
    (form.websiteUrl || null) !== org.websiteUrl ||
    (form.address || null) !== org.address;

  // ─── Helpers ──────────────────────────────────────────────────────────
  const getCsrfToken = useCallback((): string => {
    if (typeof document === 'undefined') return '';
    const match = document.cookie
      .split('; ')
      .find((row) => row.startsWith('csrf_token='));
    return match ? match.split('=').slice(1).join('=') : '';
  }, []);

  const updateField = useCallback(
    <K extends keyof typeof form>(key: K, value: string) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isDirty) return;

      // Basic validation.
      if (!form.name.trim()) {
        toast.error('Le nom est requis');
        return;
      }
      if (!form.email.trim()) {
        toast.error("L'email est requis");
        return;
      }
      // Validate email format.
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(form.email.trim())) {
        toast.error("Format d'email invalide");
        return;
      }
      // Validate brandColor if provided (hex only — server enforces same regex).
      if (form.brandColor && !/^#[0-9a-fA-F]{3,8}$/.test(form.brandColor)) {
        toast.error('La couleur de marque doit être au format hexadécimal (ex: #D4A853)');
        return;
      }

      setSaving(true);
      try {
        // Build the patch payload — only include changed fields, normalize
        // empty strings to null for nullable fields.
        const payload: Record<string, unknown> = {
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
        };
        if (form.phone !== (org.phone ?? '')) payload.phone = form.phone.trim() || null;
        if (form.logoUrl !== (org.logoUrl ?? '')) payload.logoUrl = form.logoUrl.trim() || null;
        if (form.brandColor !== (org.brandColor ?? '')) payload.brandColor = form.brandColor.trim() || null;
        if (form.customDomain !== (org.customDomain ?? '')) payload.customDomain = form.customDomain.trim() || null;
        if (form.description !== (org.description ?? '')) payload.description = form.description.trim() || null;
        if (form.websiteUrl !== (org.websiteUrl ?? '')) payload.websiteUrl = form.websiteUrl.trim() || null;
        if (form.address !== (org.address ?? '')) payload.address = form.address.trim() || null;

        const res = await fetch(`/api/org/${org.slug}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': getCsrfToken(),
          },
          credentials: 'include',
          body: JSON.stringify(payload),
        });

        if (res.status === 401) {
          toast.error('Session expirée');
          router.replace(`/org/${org.slug}/admin/login`);
          return;
        }

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 403) {
            toast.error(data?.error || "Vous n'avez pas la permission de modifier ces paramètres");
          } else if (res.status === 409) {
            toast.error(data?.error || 'Cette valeur est déjà utilisée');
          } else {
            toast.error(data?.error || 'Échec de la sauvegarde');
          }
          return;
        }

        // Update local state from the server response.
        const updated = data.organization as SettingsOrg;
        setOrg(updated);
        setForm({
          name: updated.name,
          email: updated.email,
          phone: updated.phone ?? '',
          logoUrl: updated.logoUrl ?? '',
          brandColor: updated.brandColor ?? '',
          customDomain: updated.customDomain ?? '',
          description: updated.description ?? '',
          websiteUrl: updated.websiteUrl ?? '',
          address: updated.address ?? '',
        });
        toast.success('Paramètres enregistrés');
        // Refresh server-rendered chrome (sidebar logo/name) via router.refresh.
        router.refresh();
      } catch {
        toast.error('Erreur de connexion au serveur');
      } finally {
        setSaving(false);
      }
    },
    [form, org, isDirty, getCsrfToken, router]
  );

  const planLabel = PLAN_LABELS[org.plan as Plan] || org.plan;
  const statusLabel = ORG_STATUS_LABELS[org.status] || org.status;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-8">
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <header>
        <h1 className="text-2xl font-bold gold-gradient font-display tracking-wide flex items-center gap-2">
          <Building2 className="w-6 h-6" />
          Paramètres
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {org.name} · {planLabel} · {statusLabel} · {org.maxWeddings} mariages max · {org.maxMembers} membres max
        </p>
      </header>

      <form onSubmit={handleSave} className="space-y-8">
        {/* ─── Section 1: General info ────────────────────────────── */}
        <SettingsSection
          title="Informations générales"
          description="Identité et coordonnées de l'organisation."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nom de l'organisation" htmlFor="name" required>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                disabled={saving}
                required
                maxLength={120}
              />
            </Field>
            <Field label="Email" htmlFor="email" required>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                disabled={saving}
                required
                maxLength={200}
              />
            </Field>
            <Field label="Téléphone" htmlFor="phone">
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                disabled={saving}
                placeholder="+33 6 12 34 56 78"
                maxLength={40}
              />
            </Field>
            <Field label="Site web" htmlFor="websiteUrl">
              <Input
                id="websiteUrl"
                value={form.websiteUrl}
                onChange={(e) => updateField('websiteUrl', e.target.value)}
                disabled={saving}
                placeholder="https://agence-mariage.fr"
                maxLength={500}
              />
            </Field>
            <Field label="Adresse" htmlFor="address" full>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => updateField('address', e.target.value)}
                disabled={saving}
                placeholder="12 rue des Vœux, 75001 Paris"
                maxLength={500}
              />
            </Field>
            <Field label="Description" htmlFor="description" full>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                disabled={saving}
                rows={3}
                placeholder="Présentation courte de l'agence (utilisée dans les footers et emails)."
                maxLength={2000}
              />
            </Field>
          </div>
        </SettingsSection>

        {/* ─── Section 2: Branding ─────────────────────────────────── */}
        <SettingsSection
          title="Identité visuelle"
          description="Logo et couleur de marque. La couleur de marque remplace la couleur principale (or) sur toutes les pages de vos mariages lorsqu'elles sont consultées via votre domaine personnalisé."
          icon={<Palette className="w-4 h-4" />}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="URL du logo" htmlFor="logoUrl">
              <Input
                id="logoUrl"
                value={form.logoUrl}
                onChange={(e) => updateField('logoUrl', e.target.value)}
                disabled={saving}
                placeholder="https://cdn.exemple.com/logo.png"
                maxLength={1000}
              />
            </Field>
            <Field label="Couleur de marque (hex)" htmlFor="brandColor">
              <div className="flex items-center gap-2">
                <Input
                  id="brandColor"
                  value={form.brandColor}
                  onChange={(e) => updateField('brandColor', e.target.value)}
                  disabled={saving}
                  placeholder="#D4A853"
                  maxLength={20}
                  className="font-mono"
                />
                <div
                  className="w-10 h-10 rounded-lg border border-white/15 shrink-0"
                  style={{ backgroundColor: form.brandColor || 'transparent' }}
                  aria-hidden
                />
              </div>
            </Field>
          </div>

          {/* Live preview box */}
          <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.02] p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Aperçu</p>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl border border-white/15 bg-white/5 flex items-center justify-center overflow-hidden shrink-0">
                {form.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <Building2 className="w-6 h-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{form.name || 'Mon organisation'}</div>
                <Button
                  type="button"
                  size="sm"
                  className="mt-1 h-7 text-xs"
                  style={
                    form.brandColor
                      ? { backgroundColor: form.brandColor, borderColor: form.brandColor }
                      : undefined
                  }
                >
                  Bouton d&apos;action
                </Button>
              </div>
              <Badge
                variant="outline"
                className="text-[10px] uppercase"
                style={
                  form.brandColor
                    ? { color: form.brandColor, borderColor: form.brandColor, backgroundColor: `${form.brandColor}22` }
                    : undefined
                }
              >
                Exemple
              </Badge>
            </div>
            {!form.brandColor && (
              <p className="text-[11px] text-muted-foreground/70 mt-3">
                Astuce : saisissez un code hexadécimal (ex: <code className="font-mono">#D4A853</code>) pour voir l&apos;aperçu.
              </p>
            )}
          </div>
        </SettingsSection>

        {/* ─── Section 3: Custom domain (white label) ────────────── */}
        <SettingsSection
          title="Domaine personnalisé"
          description="Activez le white-label : vos pages de mariage seront servies depuis votre propre domaine (ex: mariage.mon-agence.fr), sans branding de la plateforme."
          icon={<Globe className="w-4 h-4" />}
        >
          <Field label="Domaine personnalisé" htmlFor="customDomain">
            <Input
              id="customDomain"
              value={form.customDomain}
              onChange={(e) => updateField('customDomain', e.target.value)}
              disabled={saving}
              placeholder="mariage.mon-agence.fr"
              maxLength={255}
            />
          </Field>
          <div className="mt-3 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 flex items-start gap-2 text-sm text-sky-200">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <p className="font-medium">Configuration DNS requise</p>
              <p>Après avoir défini votre domaine ici, vous devez :</p>
              <ol className="list-decimal ml-4 space-y-0.5">
                <li>Créer un enregistrement CNAME pointant vers <code className="font-mono">wedding.hpph.net</code></li>
                <li>Contacter l&apos;équipe plateforme pour activer le certificat SSL</li>
                <li>Attendre la propagation DNS (10-60 minutes)</li>
              </ol>
              <p className="text-sky-200/80 mt-1">Tant que le DNS n&apos;est pas configuré, le domaine reste inactif.</p>
            </div>
          </div>
          {org.customDomain && (
            <div className="mt-3 flex items-center gap-2 text-xs text-emerald-300">
              <Check className="w-3.5 h-3.5" />
              <span>Domaine actuel : {org.customDomain}</span>
            </div>
          )}
        </SettingsSection>

        {/* ─── Save bar ─────────────────────────────────────────────── */}
        <div className="sticky bottom-0 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-background/80 backdrop-blur border-t border-white/10 flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            disabled={saving || !isDirty}
            onClick={() => {
              setForm({
                name: org.name,
                email: org.email,
                phone: org.phone ?? '',
                logoUrl: org.logoUrl ?? '',
                brandColor: org.brandColor ?? '',
                customDomain: org.customDomain ?? '',
                description: org.description ?? '',
                websiteUrl: org.websiteUrl ?? '',
                address: org.address ?? '',
              });
            }}
          >
            Réinitialiser
          </Button>
          <Button
            type="submit"
            disabled={saving || !isDirty}
            className="bg-gradient-gold hover:opacity-90 text-white"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enregistrement…
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Enregistrer
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SettingsSection({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
      <header className="mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          {icon}
          {title}
        </h2>
        <p className="text-xs text-muted-foreground mt-1 max-w-2xl">{description}</p>
      </header>
      <Separator className="bg-white/5 mb-4" />
      {children}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  required,
  full,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
