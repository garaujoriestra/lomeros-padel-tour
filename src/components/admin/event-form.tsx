'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

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
  function removeCourt(i: number) {
    setCourts((cs) => cs.filter((_, j) => j !== i));
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
    <div className="space-y-4 max-w-2xl">
      {/* Datos básicos */}
      <div className="lpt-card card-pad space-y-3">
        <p className="kicker">Datos</p>
        <div><Label htmlFor="name">Nombre *</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} required className="bg-surface-2 border border-line rounded-md px-2 h-9 text-sm" /></div>
        <div><Label htmlFor="date">Fecha *</Label><Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="bg-surface-2 border border-line rounded-md px-2 h-9 text-sm" /></div>
        <div><Label htmlFor="location">Lugar</Label><Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} className="bg-surface-2 border border-line rounded-md px-2 h-9 text-sm" /></div>
      </div>

      {/* Formato y configuración */}
      <div className="lpt-card card-pad space-y-3">
        <p className="kicker">Formato</p>
        <div>
          <Label htmlFor="format">Formato *</Label>
          <select id="format" aria-label="Formato" value={format} onChange={(e) => setFormat(e.target.value)} className="border border-line rounded-md px-2 py-1.5 bg-surface-2 text-sm w-full mt-1">
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
        </div>

        {kind === 'pozo' && (
          <div><Label htmlFor="rounds">Nº de rondas</Label>
            <Input id="rounds" type="number" value={rounds} onChange={(e) => setRounds(Number(e.target.value))} className="bg-surface-2 border border-line rounded-md px-2 h-9 text-sm" /></div>
        )}
        {kind === 'torneo' && format === 'groups_elim' && (
          <div className="flex gap-3">
            <div><Label htmlFor="numGroups">Nº de grupos</Label><Input id="numGroups" type="number" value={numGroups} onChange={(e) => setNumGroups(Number(e.target.value))} className="bg-surface-2 border border-line rounded-md px-2 h-9 text-sm" /></div>
            <div><Label htmlFor="advancePerGroup">Pasan por grupo</Label><Input id="advancePerGroup" type="number" value={advancePerGroup} onChange={(e) => setAdvancePerGroup(Number(e.target.value))} className="bg-surface-2 border border-line rounded-md px-2 h-9 text-sm" /></div>
          </div>
        )}
        {kind === 'torneo' && (
          <label className="flex items-center gap-2"><input type="checkbox" checked={thirdPlace} onChange={(e) => setThirdPlace(e.target.checked)} /> <span className="text-sm">Partido por el 3er/4º puesto</span></label>
        )}
      </div>

      {/* Pistas */}
      <div className="lpt-card card-pad space-y-2">
        <p className="kicker">Pistas</p>
        <p className="text-xs text-ink-3 -mt-1">El orden es la escalera del pozo</p>
        {courts.map((c, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="text-xs">Nombre</Label>
              <Input aria-label="Nombre de la pista" value={c.label} onChange={(e) => setCourt(i, { label: e.target.value })} className="bg-surface-2 border border-line rounded-md px-2 h-9 text-sm" />
            </div>
            <div><Label className="text-xs">Desde</Label><Input type="time" value={c.availableFrom} onChange={(e) => setCourt(i, { availableFrom: e.target.value })} className="bg-surface-2 border border-line rounded-md px-2 h-9 text-sm" /></div>
            <div><Label className="text-xs">Hasta</Label><Input type="time" value={c.availableTo} onChange={(e) => setCourt(i, { availableTo: e.target.value })} className="bg-surface-2 border border-line rounded-md px-2 h-9 text-sm" /></div>
            {courts.length > 1 && (
              <button type="button" aria-label={`Quitar pista ${i + 1}`} className="text-ink-3 hover:text-loss h-9 px-1 shrink-0"
                onClick={() => removeCourt(i)}>✕</button>
            )}
          </div>
        ))}
        <button type="button" className="lpt-btn text-sm mt-1" onClick={() => setCourts((cs) => [...cs, { label: '', availableFrom: '17:00', availableTo: '20:00' }])}>Añadir pista</button>
      </div>

      {/* Participantes */}
      <div className="lpt-card card-pad space-y-2">
        <p className="kicker">Participantes ({selected.size})</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-80 overflow-y-auto">
          {roster.map((p) => (
            <label key={p.id} className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5 hover:bg-surface">
              <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
              <span className="text-sm">{p.name}{p.nickname ? ` (${p.nickname})` : ''}</span>
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-loss">{error}</p>}
      <button type="button" className="lpt-btn primary" onClick={submit} disabled={loading}>{loading ? 'Creando...' : (kind === 'pozo' ? 'Crear pozo' : 'Crear torneo')}</button>
    </div>
  );
}
