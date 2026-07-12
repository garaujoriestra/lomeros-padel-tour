'use client';
import { useState } from 'react';
import { slugFromName } from '@/lib/groups/slug';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

// Form de creación de grupo. El slug se auto-deriva del nombre pero es editable;
// una vez el usuario lo toca, deja de auto-derivarse.
export function CreateGroupForm({ t }: { t: string }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/onboarding/create-group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug, t }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      window.location.assign(`/g/${data.slug}/admin`);
    } else {
      setError(data.error ?? 'Error al crear el grupo');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" style={{ marginTop: 16 }}>
      <div className="space-y-2">
        <Label htmlFor="cg-name">Nombre del grupo</Label>
        <Input
          id="cg-name"
          value={name}
          required
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugFromName(e.target.value));
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cg-slug">Nombre corto (para la dirección web)</Label>
        <Input
          id="cg-slug"
          value={slug}
          required
          onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }}
        />
        <p className="small muted" style={{ marginTop: 4 }}>Tu grupo vivirá en /g/{slug || '…'}</p>
      </div>
      {error && <p className="small" style={{ color: 'var(--loss-text, var(--loss))' }}>{error}</p>}
      <Button type="submit" disabled={busy} className="min-h-11" style={{ width: '100%' }}>
        Crear grupo
      </Button>
    </form>
  );
}
