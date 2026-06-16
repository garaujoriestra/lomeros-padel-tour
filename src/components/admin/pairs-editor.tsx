'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface Participant { id: string; name: string }
interface Props {
  tournamentId: string;
  participants: Participant[];
  initialPairs: [string, string][];
}

export function PairsEditor({ tournamentId, participants, initialPairs }: Props) {
  const router = useRouter();
  const [pairs, setPairs] = useState<[string, string][]>(initialPairs);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const nameOf = (id: string) => participants.find((p) => p.id === id)?.name ?? id;
  const pairedIds = new Set(pairs.flat());
  const available = participants.filter((p) => !pairedIds.has(p.id));

  function addPair() {
    if (!a || !b || a === b) return;
    setPairs((ps) => [...ps, [a, b]]);
    setA(''); setB(''); setSaved(false);
  }
  function removePair(i: number) {
    setPairs((ps) => ps.filter((_, j) => j !== i)); setSaved(false);
  }

  async function save() {
    setSaving(true); setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/pairs`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairs }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error || 'Error'); setSaving(false); return; }
    setSaving(false); setSaved(true);
    router.refresh();
  }

  return (
    <div className="space-y-3 max-w-xl border border-line rounded-md p-3">
      <p className="font-medium">Definir parejas</p>
      <ul className="space-y-1">
        {pairs.map((pr, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span>{nameOf(pr[0])} + {nameOf(pr[1])}</span>
            <button type="button" aria-label={`Quitar pareja ${i + 1}`} className="text-red-500"
              onClick={() => removePair(i)}>✕</button>
          </li>
        ))}
        {pairs.length === 0 && <li className="text-sm text-ink-3">Aún no hay parejas.</li>}
      </ul>

      {available.length >= 2 && (
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">Jugador A</Label>
            <select aria-label="Jugador A" value={a} onChange={(e) => setA(e.target.value)}
              className="border border-line rounded-md px-2 py-1.5 block">
              <option value="">—</option>
              {available.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs">Jugador B</Label>
            <select aria-label="Jugador B" value={b} onChange={(e) => setB(e.target.value)}
              className="border border-line rounded-md px-2 py-1.5 block">
              <option value="">—</option>
              {available.filter((p) => p.id !== a).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addPair}>Añadir pareja</Button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar parejas'}</Button>
        {saved && <span className="text-sm text-green-600">Guardado ✓</span>}
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
