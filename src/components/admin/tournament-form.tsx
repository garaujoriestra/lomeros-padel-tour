'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface RosterPlayer {
  id: string;
  name: string;
  nickname: string | null;
}

interface CourtRow {
  label: string;
  availableFrom: string;
  availableTo: string;
}

export function TournamentForm({ roster }: { roster: RosterPlayer[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [courts, setCourts] = useState<CourtRow[]>([
    { label: 'Pista 1', availableFrom: '17:00', availableTo: '20:00' },
  ]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function addCourt() {
    setCourts((cs) => [...cs, { label: `Pista ${cs.length + 1}`, availableFrom: '17:00', availableTo: '20:00' }]);
  }
  function removeCourt(i: number) {
    setCourts((cs) => cs.filter((_, idx) => idx !== i));
  }
  function setCourt(i: number, patch: Partial<CourtRow>) {
    setCourts((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const body = {
      name,
      date,
      location,
      notes,
      courts: courts.map((c, i) => ({ label: c.label, order: i + 1, availableFrom: c.availableFrom, availableTo: c.availableTo })),
      participantPlayerIds: [...selected],
    };

    const res = await fetch('/api/tournaments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      toast.success('Torneo creado');
      router.push('/admin/tournaments');
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || 'Error al crear el torneo');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card className="max-w-2xl">
        <CardHeader><CardTitle>Datos del torneo</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre *</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Torneo de cumpleaños" required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Fecha *</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Lugar</Label>
              <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Club de pádel" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader><CardTitle>Pistas y horarios</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {courts.map((c, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Nombre</Label>
                <Input value={c.label} onChange={(e) => setCourt(i, { label: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Desde</Label>
                <Input type="time" value={c.availableFrom} onChange={(e) => setCourt(i, { availableFrom: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hasta</Label>
                <Input type="time" value={c.availableTo} onChange={(e) => setCourt(i, { availableTo: e.target.value })} />
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeCourt(i)} disabled={courts.length === 1} aria-label="Quitar pista">
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addCourt}>
            <Plus size={15} /> Añadir pista
          </Button>
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader><CardTitle>Participantes ({selected.size})</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto">
            {roster.map((p) => (
              <label key={p.id} className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5 hover:bg-surface">
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 rounded border-line" />
                <span className="text-sm">{p.name}{p.nickname ? ` (${p.nickname})` : ''}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2 max-w-2xl">
        <Button type="submit" disabled={loading} className="min-h-[40px] px-4 text-sm">
          {loading ? 'Creando...' : 'Crear torneo'}
        </Button>
        <Button type="button" variant="outline" className="min-h-[40px] px-4 text-sm" onClick={() => router.push('/admin/tournaments')}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
