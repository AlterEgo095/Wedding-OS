'use client';

// ══════════════════════════════════════════════════════════════════════════════
// NewWeddingForm — Sprint P0-1 client island (audit 2026-09-01)
// ══════════════════════════════════════════════════════════════════════════════
//
// Minimal no-code wedding creation for org operators. POSTs to the existing
// POST /api/org/[slug]/weddings endpoint (auth + quota enforced server-side,
// 201 → { wedding }).
//
// CSRF double-submit: the csrf_token cookie is readable (NOT httpOnly) and is
// echoed in the X-CSRF-Token header — same pattern as OrgMembersManager.

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface NewWeddingFormProps {
  org: { slug: string; name: string };
  canCreate: boolean;
}

export function NewWeddingForm({ org, canCreate }: NewWeddingFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [brideName, setBrideName] = useState('');
  const [groomName, setGroomName] = useState('');
  const [coupleLabel, setCoupleLabel] = useState('');
  const [weddingDate, setWeddingDate] = useState('');
  const [venueName, setVenueName] = useState('');
  const [venueCity, setVenueCity] = useState('');
  const [error, setError] = useState<string | null>(null);

  const getCsrfToken = (): string => {
    if (typeof document === 'undefined') return '';
    const match = document.cookie
      .split('; ')
      .find((row) => row.startsWith('csrf_token='));
    return match ? match.split('=').slice(1).join('=') : '';
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!coupleLabel.trim() && !brideName.trim() && !groomName.trim()) {
      setError("Renseignez au moins le nom d'un des mariés ou le label du couple.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/org/${org.slug}/weddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
        },
        credentials: 'include',
        body: JSON.stringify({
          brideName: brideName.trim() || undefined,
          groomName: groomName.trim() || undefined,
          coupleLabel: coupleLabel.trim() || undefined,
          weddingDate: weddingDate || undefined,
          venueName: venueName.trim() || undefined,
          venueCity: venueCity.trim() || undefined,
        }),
      });

      const data = (await res.json().catch(() => null)) as
        | { wedding?: { coupleLabel?: string | null }; error?: string }
        | null;

      if (res.status === 201 && data?.wedding) {
        toast.success(
          `Mariage « ${data.wedding.coupleLabel ?? 'nouveau'} » créé avec succès`,
        );
        router.push(`/org/${org.slug}/admin`);
        router.refresh();
        return;
      }

      setError(
        data?.error ||
          `Erreur ${res.status} — veuillez réessayer ou contacter le support.`,
      );
    } catch {
      setError('Erreur réseau — veuillez réessayer.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-5 w-5" />
          Créer un mariage
        </CardTitle>
        <CardDescription>
          Nouveau mariage sous {org.name}. Il sera créé en statut DRAFT — vous
          pourrez le configurer, le prévisualiser, puis le publier.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!canCreate ? (
          <p className="text-sm text-muted-foreground">
            Votre rôle ne permet pas de créer un mariage. Contactez
            l&apos;administrateur de l&apos;organisation.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="brideName">Prénom de la mariée</Label>
                <Input
                  id="brideName"
                  value={brideName}
                  onChange={(e) => setBrideName(e.target.value)}
                  placeholder="Aline"
                  maxLength={100}
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="groomName">Prénom du marié</Label>
                <Input
                  id="groomName"
                  value={groomName}
                  onChange={(e) => setGroomName(e.target.value)}
                  placeholder="Bertrand"
                  maxLength={100}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="coupleLabel">
                Label du couple{' '}
                <span className="text-muted-foreground">
                  (optionnel — sinon « Prénom mariée &amp; Prénom marié »)
                </span>
              </Label>
              <Input
                id="coupleLabel"
                value={coupleLabel}
                onChange={(e) => setCoupleLabel(e.target.value)}
                placeholder="Aline &amp; Bertrand"
                maxLength={200}
                disabled={saving}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="weddingDate">Date du mariage</Label>
                <Input
                  id="weddingDate"
                  type="date"
                  value={weddingDate}
                  onChange={(e) => setWeddingDate(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="venueCity">Ville</Label>
                <Input
                  id="venueCity"
                  value={venueCity}
                  onChange={(e) => setVenueCity(e.target.value)}
                  placeholder="Kinshasa"
                  maxLength={120}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="venueName">Lieu (nom de la salle)</Label>
              <Input
                id="venueName"
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                placeholder="Salle Showbuzz, TP Or"
                maxLength={200}
                disabled={saving}
              />
            </div>

            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" disabled={saving} className="bg-gradient-gold hover:opacity-90 text-white">
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Création…
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Créer le mariage
                </>
              )}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
