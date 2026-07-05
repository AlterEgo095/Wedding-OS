'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, GripVertical, Calendar, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

// ══════════════════════════════════════════════════════════════════════════════
// CoupleStoryManager — Admin CRUD for the couple's story (Slice 4)
// ══════════════════════════════════════════════════════════════════════════════
// The /api/couple-story API already has GET/POST/PUT/DELETE.
// This component provides the admin UI. Changes appear on the public
// /w/[slug] page via the OurStory section (manifest-driven).
// ══════════════════════════════════════════════════════════════════════════════

interface CoupleStory {
  id: string;
  title: string;
  description: string;
  date?: string | null;
  imageUrl?: string | null;
  order: number;
}

export function CoupleStoryManager({ weddingSlug }: { weddingSlug: string }) {
  const [stories, setStories] = useState<CoupleStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [editing, setEditing] = useState<CoupleStory | null>(null);
  const [form, setForm] = useState({ title: '', description: '', date: '', imageUrl: '' });

  const fetchStories = useCallback(async () => {
    try {
      const res = await fetch('/api/couple-story', { headers: { 'X-Wedding-Slug': weddingSlug } });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setStories(data.stories || data || []);
    } catch {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [weddingSlug]);

  useEffect(() => { fetchStories(); }, [fetchStories]);

  const openCreate = () => {
    setForm({ title: '', description: '', date: '', imageUrl: '' });
    setEditing(null);
    setShowEdit(true);
  };

  const openEdit = (s: CoupleStory) => {
    setForm({
      title: s.title,
      description: s.description,
      date: s.date || '',
      imageUrl: s.imageUrl || '',
    });
    setEditing(s);
    setShowEdit(true);
  };

  const save = async () => {
    if (!form.title) { toast.error('Titre requis'); return; }
    try {
      const body = {
        title: form.title,
        description: form.description,
        date: form.date || null,
        imageUrl: form.imageUrl || null,
      };
      const url = editing ? `/api/couple-story?id=${editing.id}` : '/api/couple-story';
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Wedding-Slug': weddingSlug },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(editing ? 'Chapitre mis à jour' : 'Chapitre ajouté');
      setShowEdit(false);
      fetchStories();
    } catch {
      toast.error('Erreur de sauvegarde');
    }
  };

  const remove = async (s: CoupleStory) => {
    if (!confirm(`Supprimer "${s.title}" ?`)) return;
    try {
      const res = await fetch(`/api/couple-story?id=${s.id}`, {
        method: 'DELETE',
        headers: { 'X-Wedding-Slug': weddingSlug },
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Chapitre supprimé');
      fetchStories();
    } catch {
      toast.error('Erreur de suppression');
    }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Chargement…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-serif">Notre Histoire</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Les chapitres de votre histoire, affichés sur la page publique
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" /> Nouveau chapitre
        </Button>
      </div>

      {stories.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <p>Aucun chapitre. Ajoutez le premier !</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {stories.sort((a, b) => a.order - b.order).map((s, i) => (
            <Card key={s.id} className="p-4 flex items-start gap-3">
              <div className="flex items-center text-muted-foreground mt-1">
                <GripVertical className="w-4 h-4" />
                <span className="text-sm font-medium ml-1">{i + 1}</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm">{s.title}</h3>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.description}</p>
                {s.date && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {s.date}
                  </p>
                )}
                {s.imageUrl && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" /> {s.imageUrl}
                  </p>
                )}
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => openEdit(s)}>
                  <Edit className="w-3 h-3" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => remove(s)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Éditer le chapitre' : 'Nouveau chapitre'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Titre</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Notre première rencontre" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={4} placeholder="Il était une fois…" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Date</Label>
                <Input value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} placeholder="Juin 2023" />
              </div>
              <div>
                <Label>URL de l'image</Label>
                <Input value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value })} placeholder="/uploads/..." />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Annuler</Button>
            <Button onClick={save}>{editing ? 'Mettre à jour' : 'Ajouter'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
