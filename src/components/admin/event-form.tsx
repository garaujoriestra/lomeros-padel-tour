'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface RosterPlayer { id: string; name: string; nickname: string | null }

export function EventForm({ kind, roster }: { kind: 'pozo' | 'torneo'; roster: RosterPlayer[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [courts, setCourts] = useState([{ label: '', availableFrom: '17:00', availableTo: '20:00' }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Config por tipo
  const [format, setFormat] = useState(kind === 'pozo' ? 'americano' : 'single_elim');
  const [rounds, setRounds] = useState(4);                 // pozo
  const [numGroups, setNumGroups] = useState(2);           // torneo groups_elim
  const [advancePerGroup, setAdvancePerGroup] = useState(2);
  const [thirdPlace, setThirdPlace] = useState(false);     // torneo

  function toggle(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function setCourt(i: number, patch: Partial<typeof courts[number]>) {
    setCourts((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  }

  function buildConfig() {
    if (kind === 'pozo') {
      return { rounds, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } };
    }
    const base = { matchFormat: { kind: 'best_of_3' }, thirdPlace };
    return format === 'groups_elim' ? { ...base, numGroups, advancePerGroup } : base;
  }

  async function submit() {
    setLoading(true); setError(null);
    const res = await fetch('/api/tournaments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, date, location: location || null, kind, format,
        config: buildConfig(),
        courts: courts.map((c, i) => ({ label: c.label, order: i + 1, availableFrom: c.availableFrom, availableTo: c.availableTo })),
        participantPlayerIds: [...selected],
      }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error || 'Error'); setLoading(false); return; }
    router.push(kind === 'pozo' ? '/admin/pozos' : '/admin/torneos');
  }

  return (
    <div className="space-y-6">
      {/* Meta */}
      <div className="space-y-3 max-w-2xl">
        <div><Label htmlFor="name">Nombre *</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div><Label htmlFor="date">Fecha *</Label><Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
        <div><Label htmlFor="location">Lugar</Label><Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} /></div>
      </div>

      {/* Config por tipo */}
      <div className="space-y-3 max-w-2xl">
        <Label htmlFor="format">Formato *</Label>
        <select id="format" aria-label="Formato" value={format} onChange={(e) => setFormat(e.target.value)} className="border border-line rounded-md px-2 py-1.5">
          {kind === 'pozo' ? (
            <>
              <option value="americano">Americano (parejas rotativas)</option>
              <option value="fixed_pairs">Parejas fijas</option>
            </>
          ) : (
            <>
              <option value="single_elim">Eliminación directa</option>
              <option value="groups_elim">Grupos → eliminación</option>
            </>
          )}
        </select>

        {kind === 'pozo' && (
          <div><Label htmlFor="rounds">Nº de rondas</Label>
            <Input id="rounds" type="number" value={rounds} onChange={(e) => setRounds(Number(e.target.value))} /></div>
        )}
        {kind === 'torneo' && format === 'groups_elim' && (
          <div className="flex gap-3">
            <div><Label htmlFor="numGroups">Nº de grupos</Label><Input id="numGroups" type="number" value={numGroups} onChange={(e) => setNumGroups(Number(e.target.value))} /></div>
            <div><Label htmlFor="advancePerGroup">Pasan por grupo</Label><Input id="advancePerGroup" type="number" value={advancePerGroup} onChange={(e) => setAdvancePerGroup(Number(e.target.value))} /></div>
          </div>
        )}
        {kind === 'torneo' && (
          <label className="flex items-center gap-2"><input type="checkbox" checked={thirdPlace} onChange={(e) => setThirdPlace(e.target.checked)} /> <span className="text-sm">Partido por el 3er/4º puesto</span></label>
        )}
      </div>

      {/* Pistas: el ORDEN = la escalera del pozo */}
      <div className="max-w-2xl space-y-2">
        <Label>Pistas (con su nombre real; el orden es la escalera del pozo)</Label>
        {courts.map((c, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="text-xs">Nombre</Label>
              <Input aria-label="Nombre de la pista" value={c.label} onChange={(e) => setCourt(i, { label: e.target.value })} />
            </div>
            <div><Label className="text-xs">Desde</Label><Input type="time" value={c.availableFrom} onChange={(e) => setCourt(i, { availableFrom: e.target.value })} /></div>
            <div><Label className="text-xs">Hasta</Label><Input type="time" value={c.availableTo} onChange={(e) => setCourt(i, { availableTo: e.target.value })} /></div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setCourts((cs) => [...cs, { label: '', availableFrom: '17:00', availableTo: '20:00' }])}>Añadir pista</Button>
      </div>

      {/* Participantes */}
      <div className="max-w-2xl">
        <Label>Participantes ({selected.size})</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto">
          {roster.map((p) => (
            <label key={p.id} className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5 hover:bg-surface">
              <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
              <span className="text-sm">{p.name}{p.nickname ? ` (${p.nickname})` : ''}</span>
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button onClick={submit} disabled={loading}>{loading ? 'Creando...' : (kind === 'pozo' ? 'Crear pozo' : 'Crear torneo')}</Button>
    </div>
  );
}
