'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface SetScore {
  team1Games: number | '';
  team2Games: number | '';
}

interface ResultFormPlayer {
  id: string;
  name: string;
}

interface ResultFormProps {
  matchId: string;
  date: string;
  location?: string | null;
  groupSlug?: string;
  // Order from the scheduled match: [team1Player1, team1Player2, team2Player1, team2Player2]
  matchPlayers: [ResultFormPlayer, ResultFormPlayer, ResultFormPlayer, ResultFormPlayer];
  initialSides: {
    team1Player1Side: string | null;
    team1Player2Side: string | null;
    team2Player1Side: string | null;
    team2Player2Side: string | null;
  };
}

type Pairing = {
  team1: readonly [ResultFormPlayer, ResultFormPlayer];
  team2: readonly [ResultFormPlayer, ResultFormPlayer];
};

function makePairingOptions(
  players: readonly [ResultFormPlayer, ResultFormPlayer, ResultFormPlayer, ResultFormPlayer],
): Pairing[] {
  const [a, b, c, d] = players;
  return [
    { team1: [a, b], team2: [c, d] },
    { team1: [a, c], team2: [b, d] },
    { team1: [a, d], team2: [b, c] },
  ];
}

export function ResultForm({ matchId, date, location, matchPlayers, initialSides, groupSlug }: ResultFormProps) {
  const router = useRouter();
  const basePath = groupSlug ? `/g/${groupSlug}` : '';
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'normal' | 'injury'>('normal');
  const [injuredPlayerId, setInjuredPlayerId] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [preview, setPreview] = useState<string>('');
  const [sets, setSets] = useState<SetScore[]>([
    { team1Games: '', team2Games: '' },
    { team1Games: '', team2Games: '' },
  ]);

  const pairingOptions = useMemo(() => makePairingOptions(matchPlayers), [matchPlayers]);
  // Option 0 corresponds to the scheduled pairing because matchPlayers preserves that order.
  const [pairingIdx, setPairingIdx] = useState<number>(0);
  const pairing = pairingOptions[pairingIdx];

  const [sidesByPlayerId, setSidesByPlayerId] = useState<Record<string, string>>({
    [matchPlayers[0].id]: initialSides.team1Player1Side ?? '',
    [matchPlayers[1].id]: initialSides.team1Player2Side ?? '',
    [matchPlayers[2].id]: initialSides.team2Player1Side ?? '',
    [matchPlayers[3].id]: initialSides.team2Player2Side ?? '',
  });

  const team1Name = `${pairing.team1[0].name} / ${pairing.team1[1].name}`;
  const team2Name = `${pairing.team2[0].name} / ${pairing.team2[1].name}`;

  function handleSetChange(idx: number, team: 'team1' | 'team2', value: string) {
    const parsed = value === '' ? '' : Math.max(0, Math.min(7, parseInt(value) || 0));
    const updated = [...sets];
    updated[idx] = { ...updated[idx], [`${team}Games`]: parsed };
    setSets(updated);
  }

  // `winner: null` = empate 1-1: se jugaron 2 sets, uno cada equipo, y no dio
  // tiempo al tercero.
  function validateSets(): { t1: number; t2: number; winner: 1 | 2 | null } | null {
    let t1 = 0, t2 = 0;
    for (const set of sets) {
      if (set.team1Games === '' || set.team2Games === '') return null;
      if (set.team1Games === set.team2Games) return null;
      if (set.team1Games > set.team2Games) t1++;
      else t2++;
    }
    if (t1 === 2 || t2 === 2) return { t1, t2, winner: t1 === 2 ? 1 : 2 };
    if (sets.length === 2 && t1 === 1 && t2 === 1) return { t1, t2, winner: null };
    return null;
  }

  const matchResult = validateSets();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPreview(URL.createObjectURL(file));
    setUploading(true);

    const fd = new FormData();
    fd.append('file', file);

    const res = await fetch('/api/upload/match-photo', { method: 'POST', body: fd });
    const data = await res.json();

    if (res.ok) {
      setPhotoUrl(data.url);
      toast.success('Foto subida');
    } else {
      toast.error(data.error || 'Error al subir la foto');
      setPreview('');
    }
    setUploading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!matchResult) {
      toast.error('El resultado no es válido');
      return;
    }
    setLoading(true);

    const res = await fetch(`/api/matches/${matchId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(groupSlug && { g: groupSlug }),
        sets: sets.map((s, i) => ({
          setNumber: i + 1,
          team1Games: Number(s.team1Games),
          team2Games: Number(s.team2Games),
        })),
        team1Player1Id: pairing.team1[0].id,
        team1Player2Id: pairing.team1[1].id,
        team2Player1Id: pairing.team2[0].id,
        team2Player2Id: pairing.team2[1].id,
        team1Player1Side: sidesByPlayerId[pairing.team1[0].id] || null,
        team1Player2Side: sidesByPlayerId[pairing.team1[1].id] || null,
        team2Player1Side: sidesByPlayerId[pairing.team2[0].id] || null,
        team2Player2Side: sidesByPlayerId[pairing.team2[1].id] || null,
        photoUrl: photoUrl || null,
      }),
    });

    if (res.ok) {
      toast.success(
        matchResult.winner === null
          ? 'Empate guardado ✓ (no mueve el ranking)'
          : 'Resultado guardado y ratings actualizados ✓',
      );
      router.push(`${basePath}/admin/matches`);
      router.refresh();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Error al guardar el resultado');
      setLoading(false);
    }
  }

  async function handleInjurySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!injuredPlayerId) {
      toast.error('Selecciona el jugador lesionado');
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/matches/${matchId}/abandon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(groupSlug && { g: groupSlug }), injuredPlayerId }),
    });

    if (res.ok) {
      toast.success('Partido marcado como no terminado por lesión');
      router.push(`${basePath}/admin/matches`);
      router.refresh();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Error al marcar la lesión');
      setLoading(false);
    }
  }

  if (mode === 'injury') {
    return (
      <form onSubmit={handleInjurySubmit} className="space-y-6 max-w-2xl">
        <div className="rounded-2xl p-6 border border-loss/30 bg-loss/10">
          <p className="text-loss-text text-xs font-black uppercase tracking-widest mb-3">🤕 No terminado por lesión</p>
          <div className="flex items-center justify-between">
            <p className="font-black text-xl text-ink">🔵 {team1Name}</p>
            <span className="text-2xl font-black text-loss">VS</span>
            <p className="font-black text-xl text-right text-ink">🔴 {team2Name}</p>
          </div>
          <div className="flex gap-4 mt-3 text-ink-3 text-sm">
            <span>📅 {date}</span>
            {location && <span>📍 {location}</span>}
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-line shadow-sm p-5 space-y-4">
          <div>
            <p className="text-xs font-black text-ink-3 uppercase tracking-widest mb-3">Jugador lesionado</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {matchPlayers.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setInjuredPlayerId(p.id)}
                  className={`flex items-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-bold text-left transition-colors ${
                    injuredPlayerId === p.id
                      ? 'border-loss bg-loss/15 text-loss-text'
                      : 'border-line hover:border-line-strong text-ink-2'
                  }`}
                >
                  <span className="text-lg">🤕</span>
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-ink-3 leading-relaxed">
            Este partido no contará para ELO, victorias/derrotas, ni achievements.
            Aparecerá en la lista de partidos con un distintivo de lesión.
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            type="submit"
            disabled={loading || !injuredPlayerId}
            className="flex-1 min-h-11 px-4 text-sm bg-loss hover:bg-loss/90 text-white font-bold"
          >
            {loading ? 'Guardando...' : '🤕 Marcar como lesión'}
          </Button>
          <Button type="button" variant="outline" className="min-h-11 px-4 text-sm" onClick={() => setMode('normal')}>
            ← Volver a resultado
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {/* Match info */}
      <div className="hero rounded-2xl p-6">
        <p className="text-acc-text text-xs uppercase tracking-widest mb-3">Añadir resultado a</p>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-black text-xl">🔵 {team1Name}</p>
          </div>
          <span className="text-2xl font-black text-acc-text">VS</span>
          <div className="text-right">
            <p className="font-black text-xl">🔴 {team2Name}</p>
          </div>
        </div>
        <div className="flex gap-4 mt-3 text-acc-text text-sm">
          <span>📅 {date}</span>
          {location && <span>📍 {location}</span>}
        </div>
      </div>

      {/* Mode toggle: switch to injury flow */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setMode('injury')}
          className="text-xs font-bold text-loss-text hover:opacity-80 underline underline-offset-2 min-h-11 inline-flex items-center"
        >
          🤕 No terminado por lesión →
        </button>
      </div>

      {/* Pairing selector */}
      <div className="bg-card rounded-2xl border border-line shadow-sm p-5 space-y-3">
        <div>
          <p className="text-xs font-black text-ink-3 uppercase tracking-widest">👥 Parejas que jugaron</p>
          <p className="text-xs text-ink-3 mt-1">Elige cómo se emparejaron los 4 jugadores en pista</p>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {pairingOptions.map((opt, i) => {
            const active = i === pairingIdx;
            return (
              <button
                type="button"
                key={i}
                onClick={() => setPairingIdx(i)}
                aria-pressed={active}
                className={`rounded-xl border-2 px-4 py-3 text-sm font-bold text-left transition-colors ${
                  active
                    ? 'border-acc bg-win/10 text-win'
                    : 'border-line hover:border-line text-ink-2'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex-1 truncate">
                    🔵 {opt.team1[0].name} / {opt.team1[1].name}
                  </span>
                  <span className={`text-xs ${active ? 'text-win' : 'text-ink-3'}`}>VS</span>
                  <span className="flex-1 truncate text-right">
                    🔴 {opt.team2[0].name} / {opt.team2[1].name}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Photo upload (optional) */}
      <div className="bg-card rounded-2xl border border-line shadow-sm p-5 space-y-4">
        <p className="text-xs font-black text-ink-3 uppercase tracking-widest">📷 Foto del partido (opcional)</p>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="relative w-24 h-24 rounded-xl overflow-hidden shrink-0 border-2 border-dashed border-line hover:border-acc transition-colors group bg-surface-2"
            aria-label="Seleccionar foto"
          >
            {preview ? (
              <Image src={preview} alt="Preview" fill className="object-cover" unoptimized />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-ink-3 text-3xl">📷</div>
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:bg-black/25 transition-opacity flex items-center justify-center text-white text-xs font-bold">
              {uploading ? '⏳' : preview ? '🔄 Cambiar' : '📁 Elegir'}
            </div>
          </button>

          <div className="flex-1 space-y-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? 'Subiendo...' : preview ? 'Cambiar foto' : '📁 Seleccionar imagen'}
            </Button>
            <p className="text-xs text-ink-3">JPG, PNG, WEBP · Máx. 5MB</p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>

      {/* Sets */}
      <div className="bg-card rounded-2xl border border-line shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-black text-ink-3 uppercase tracking-widest">🏆 Resultado (sets)</p>
          <div className="flex gap-2">
            {sets.length === 2 && (
              <Button type="button" variant="outline" className="min-h-11 px-3 text-xs"
                onClick={() => setSets([...sets, { team1Games: '', team2Games: '' }])}>
                + 3er set
              </Button>
            )}
            {sets.length === 3 && (
              <Button type="button" variant="ghost" className="min-h-11 px-3 text-xs"
                onClick={() => setSets(sets.slice(0, 2))}>
                Quitar 3er set
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs font-medium text-ink-3 text-center">
          <span className="text-left">Set</span>
          <span className="text-acc-text truncate">🔵 {team1Name}</span>
          <span className="text-loss truncate">🔴 {team2Name}</span>
        </div>

        {sets.map((set, idx) => (
          <div key={idx} className="grid grid-cols-3 gap-2 items-center">
            <span className="text-sm font-medium">Set {idx + 1}</span>
            <Input type="number" min={0} max={7} inputMode="numeric" enterKeyHint="next" className="text-center"
              aria-label={`Juegos de ${team1Name}, set ${idx + 1}`}
              placeholder="0" value={set.team1Games}
              onChange={(e) => handleSetChange(idx, 'team1', e.target.value)} required />
            <Input type="number" min={0} max={7} inputMode="numeric" enterKeyHint="next" className="text-center"
              aria-label={`Juegos de ${team2Name}, set ${idx + 1}`}
              placeholder="0" value={set.team2Games}
              onChange={(e) => handleSetChange(idx, 'team2', e.target.value)} required />
          </div>
        ))}

        {matchResult && matchResult.winner === null && (
          <div className="mt-2 p-3 rounded-xl bg-surface-2 border border-line text-sm text-center">
            <p className="font-bold text-ink-2">
              🤝 Empate{' '}
              <Badge variant="outline" className="ml-1">
                {matchResult.t1} — {matchResult.t2}
              </Badge>
            </p>
            <p className="text-xs text-ink-3 mt-1">Cuenta como partido jugado, pero no mueve el Elo</p>
          </div>
        )}

        {matchResult && matchResult.winner !== null && (
          <div className="mt-2 p-3 rounded-xl bg-win/10 border border-win/30 text-sm text-center">
            <p className="font-bold text-win">
              🏆 Gana {matchResult.winner === 1 ? `🔵 ${team1Name}` : `🔴 ${team2Name}`}{' '}
              <Badge variant="outline" className="ml-1">
                {matchResult.t1} — {matchResult.t2}
              </Badge>
            </p>
          </div>
        )}
      </div>

      <div className="bg-card rounded-2xl border border-line shadow-sm p-5 space-y-4">
        <p className="text-xs font-black text-ink-3 uppercase tracking-widest">🎾 Lado de pista (opcional)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-3">
            <p className="font-semibold text-sm text-acc-text">🔵 {team1Name}</p>
            {pairing.team1.map((player) => (
              <div key={player.id} className="grid grid-cols-[1fr_auto] gap-2 items-center">
                <span className="text-sm text-ink-2 truncate">{player.name}</span>
                <select
                  className="border rounded-md px-2 py-1 text-sm bg-card"
                  aria-label={`Lado de ${player.name}`}
                  value={sidesByPlayerId[player.id] ?? ''}
                  onChange={(e) =>
                    setSidesByPlayerId({ ...sidesByPlayerId, [player.id]: e.target.value })
                  }
                >
                  <option value="">—</option>
                  <option value="drive">Drive</option>
                  <option value="reves">Revés</option>
                </select>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <p className="font-semibold text-sm text-loss-text">🔴 {team2Name}</p>
            {pairing.team2.map((player) => (
              <div key={player.id} className="grid grid-cols-[1fr_auto] gap-2 items-center">
                <span className="text-sm text-ink-2 truncate">{player.name}</span>
                <select
                  className="border rounded-md px-2 py-1 text-sm bg-card"
                  aria-label={`Lado de ${player.name}`}
                  value={sidesByPlayerId[player.id] ?? ''}
                  onChange={(e) =>
                    setSidesByPlayerId({ ...sidesByPlayerId, [player.id]: e.target.value })
                  }
                >
                  <option value="">—</option>
                  <option value="drive">Drive</option>
                  <option value="reves">Revés</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={loading || !matchResult}
          className="flex-1 min-h-11 px-4 text-sm bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
        >
          {loading ? 'Guardando...' : '✓ Guardar resultado y actualizar rankings'}
        </Button>
        <Button type="button" variant="outline" className="min-h-11 px-4 text-sm" onClick={() => router.push(`${basePath}/admin/matches`)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
