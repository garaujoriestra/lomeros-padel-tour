'use client';

import { useRef, useState } from 'react';
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

interface EditResultFormProps {
  matchId: string;
  date: string;
  location?: string | null;
  team1Name: string;
  team2Name: string;
  winnerTeam: 1 | 2;
  initialSets: { team1Games: number; team2Games: number }[];
  initialPhotoUrl: string | null;
}

// Corrección de un resultado ya registrado: juegos (sin cambiar el ganador) y foto.
export function EditResultForm({
  matchId, date, location, team1Name, team2Name, winnerTeam, initialSets, initialPhotoUrl,
}: EditResultFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // photoUrl: undefined = sin cambios; string = nueva foto; null = quitarla.
  const [photoUrl, setPhotoUrl] = useState<string | null | undefined>(undefined);
  const [preview, setPreview] = useState<string>(initialPhotoUrl ?? '');
  const [sets, setSets] = useState<SetScore[]>(
    initialSets.map((s) => ({ team1Games: s.team1Games, team2Games: s.team2Games })),
  );

  function handleSetChange(idx: number, team: 'team1' | 'team2', value: string) {
    const parsed = value === '' ? '' : Math.max(0, Math.min(7, parseInt(value) || 0));
    const updated = [...sets];
    updated[idx] = { ...updated[idx], [`${team}Games`]: parsed };
    setSets(updated);
  }

  function validateSets() {
    let t1 = 0, t2 = 0;
    for (const set of sets) {
      if (set.team1Games === '' || set.team2Games === '') return null;
      if (set.team1Games === set.team2Games) return null;
      if (set.team1Games > set.team2Games) t1++;
      else t2++;
    }
    if (t1 === 2 || t2 === 2) return { t1, t2, winner: t1 === 2 ? 1 : 2 };
    return null;
  }

  const matchResult = validateSets();
  const winnerChanged = matchResult !== null && matchResult.winner !== winnerTeam;
  const setsDirty =
    sets.length !== initialSets.length ||
    sets.some((s, i) => s.team1Games !== initialSets[i]?.team1Games || s.team2Games !== initialSets[i]?.team2Games);

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
      setPreview(initialPhotoUrl ?? '');
      setPhotoUrl(undefined);
    }
    setUploading(false);
  }

  function handleRemovePhoto() {
    setPhotoUrl(null);
    setPreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (setsDirty && !matchResult) {
      toast.error('El resultado no es válido');
      return;
    }
    if (winnerChanged) return;
    if (!setsDirty && photoUrl === undefined) {
      toast.info('No hay cambios que guardar');
      return;
    }
    setLoading(true);

    const payload: Record<string, unknown> = {};
    if (setsDirty) {
      payload.sets = sets.map((s, i) => ({
        setNumber: i + 1,
        team1Games: Number(s.team1Games),
        team2Games: Number(s.team2Games),
      }));
    }
    if (photoUrl !== undefined) payload.photoUrl = photoUrl;

    const res = await fetch(`/api/matches/${matchId}/result`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      toast.success('Resultado corregido ✓');
      router.push('/admin/matches');
      router.refresh();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Error al corregir el resultado');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {/* Match info */}
      <div className="hero rounded-2xl p-6">
        <p className="text-acc-text text-xs uppercase tracking-widest mb-3">Corregir resultado de</p>
        <div className="flex items-center justify-between">
          <p className="font-black text-xl">🔵 {team1Name}</p>
          <span className="text-2xl font-black text-acc-text">VS</span>
          <p className="font-black text-xl text-right">🔴 {team2Name}</p>
        </div>
        <div className="flex gap-4 mt-3 text-acc-text text-sm">
          <span>📅 {date}</span>
          {location && <span>📍 {location}</span>}
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
            <Input type="number" min={0} max={7} className="text-center"
              placeholder="0" value={set.team1Games}
              onChange={(e) => handleSetChange(idx, 'team1', e.target.value)} required />
            <Input type="number" min={0} max={7} className="text-center"
              placeholder="0" value={set.team2Games}
              onChange={(e) => handleSetChange(idx, 'team2', e.target.value)} required />
          </div>
        ))}

        {matchResult && !winnerChanged && (
          <div className="mt-2 p-3 rounded-xl bg-win/10 border border-win/30 text-sm text-center">
            <p className="font-bold text-win">
              🏆 Gana {matchResult.winner === 1 ? `🔵 ${team1Name}` : `🔴 ${team2Name}`}{' '}
              <Badge variant="outline" className="ml-1">
                {matchResult.t1} — {matchResult.t2}
              </Badge>
            </p>
          </div>
        )}

        {winnerChanged && (
          <div className="mt-2 p-3 rounded-xl bg-loss/10 border border-loss/30 text-sm text-center">
            <p className="font-bold text-loss">
              ⚠️ Esta corrección cambiaría el equipo ganador. El ELO y las apuestas ya se
              liquidaron con el ganador original: para cambiarlo, borra el partido y
              regístralo de nuevo.
            </p>
          </div>
        )}
      </div>

      {/* Photo */}
      <div className="bg-card rounded-2xl border border-line shadow-sm p-5 space-y-4">
        <p className="text-xs font-black text-ink-3 uppercase tracking-widest">📷 Foto del partido</p>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="relative w-24 h-24 rounded-xl overflow-hidden shrink-0 border-2 border-dashed border-line hover:border-acc transition-colors group bg-surface-2"
            aria-label="Seleccionar foto"
          >
            {preview ? (
              <Image src={preview} alt="Foto del partido" fill className="object-cover" unoptimized />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-ink-3 text-3xl">📷</div>
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold">
              {uploading ? '⏳' : preview ? '🔄 Cambiar' : '📁 Elegir'}
            </div>
          </button>

          <div className="flex-1 space-y-1">
            <div className="flex gap-2 flex-wrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? 'Subiendo...' : preview ? 'Cambiar foto' : '📁 Seleccionar imagen'}
              </Button>
              {preview && (
                <Button type="button" variant="ghost" size="sm" onClick={handleRemovePhoto}>
                  🗑️ Quitar foto
                </Button>
              )}
            </div>
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

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={loading || uploading || winnerChanged || (setsDirty && !matchResult)}
          className="flex-1 min-h-11 px-4 text-sm bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
        >
          {loading ? 'Guardando...' : '✓ Guardar corrección'}
        </Button>
        <Button type="button" variant="outline" className="min-h-11 px-4 text-sm" onClick={() => router.push('/admin/matches')}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
