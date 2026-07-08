import Link from 'next/link';
import { ViewTransition } from 'react';
import { PlayerAvatar } from '@/components/shared/player-avatar';
import { Calendar, Check, Bandage, Trophy, ChevronRight, type LucideIcon } from 'lucide-react';

/* ── Tipos compartidos ── */
export interface LptPlayer {
  id: string;
  name: string;
  nickname?: string | null;
  avatarUrl?: string | null;
}

export function displayName(p: { name: string; nickname?: string | null } | undefined) {
  if (!p) return '?';
  return p.nickname || p.name;
}

/* ── Fecha corta estilo marcador: "vie 13 jun" ── */
export function formatMatchDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
}

/* ── Color determinista para el fallback de iniciales ── */
export function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `oklch(0.52 0.09 ${h})`;
}

/* ── Avatar ── */
/**
 * `vtName` activa el morph de elemento compartido (View Transitions): mismo
 * `name` en la fila de la lista y en la ficha → el avatar «vuela» al navegar.
 * Debe ser único por página: no lo pongas en dos avatares del mismo jugador
 * montados a la vez (p. ej. podio + lista) o el morph se rompe.
 */
export function LptAvatar({ player, size = 36, className, vtName }: { player: LptPlayer | undefined; size?: number; className?: string; vtName?: string }) {
  if (!player) return null;
  const avatar = (
    <div
      className={`lpt-avatar ${className ?? ''}`}
      style={{ width: size, height: size, fontSize: size * 0.36, background: avatarColor(player.name) }}
    >
      <PlayerAvatar
        name={player.name}
        avatarUrl={player.avatarUrl}
        className="w-full h-full rounded-full"
        fallbackClassName="text-white font-extrabold"
        sizes={`${size * 2}px`}
      />
    </div>
  );
  return vtName ? (
    <ViewTransition name={vtName} share="morph" default="none">
      {avatar}
    </ViewTransition>
  ) : (
    avatar
  );
}

export function AvatarStack({ players, size = 30 }: { players: (LptPlayer | undefined)[]; size?: number }) {
  return (
    <div className="avatar-stack">
      {players.filter(Boolean).map((p) => (
        <LptAvatar key={p!.id} player={p} size={size} />
      ))}
    </div>
  );
}

/* ── Delta ▲▼ ── */
export function Delta({ value, pulse }: { value: number | null | undefined; pulse?: boolean }) {
  if (value == null || Math.round(value) === 0) return <span className="delta muted">—</span>;
  const v = Math.round(value);
  const up = v > 0;
  return (
    <span className={`delta ${up ? 'up' : 'down'} ${pulse ? 'pulse' : ''}`}>
      {up ? '▲' : '▼'} {up ? '+' : ''}{v}
    </span>
  );
}

/* ── Cabecera de sección ── */
export function SectionHead({
  icon: Icon,
  title,
  linkLabel,
  linkHref,
}: {
  icon?: LucideIcon;
  title: string;
  linkLabel?: string;
  linkHref?: string;
}) {
  return (
    <div className="sec-head">
      <h2 className="sec-title" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        {Icon && <Icon size={19} strokeWidth={2.4} style={{ color: 'var(--acc-text)' }} />}
        {title}
      </h2>
      <div className="sec-rule" />
      {linkLabel && linkHref && (
        <Link href={linkHref} className="sec-link">
          {linkLabel} <ChevronRight size={14} />
        </Link>
      )}
    </div>
  );
}

/* ── Barra de stat ── */
export function StatBar({ pct, tone = 'accent', height }: { pct: number; tone?: 'accent' | 'win' | 'loss'; height?: number }) {
  return (
    <div className="stat-bar" style={height ? { height } : undefined}>
      <div className={`bar-fill ${tone === 'accent' ? '' : tone}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

/* ── Forma reciente W/L ── */
export function FormDots({ form, size = 26 }: { form: ('W' | 'L')[]; size?: number }) {
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {form.map((r, i) => (
        <div
          key={i}
          className={`form-dot ${r === 'W' ? 'w' : 'l'}`}
          style={{ width: size, height: size, animation: `fadeUp 0.4s ${i * 0.05}s both` }}
        >
          {r === 'W' ? 'V' : 'D'}
        </div>
      ))}
    </div>
  );
}

/* ── Pill de estado ── */
export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { cls: string; Icon: LucideIcon; label: string }> = {
    scheduled: { cls: 'scheduled', Icon: Calendar, label: 'Programado' },
    completed: { cls: 'completed', Icon: Check, label: 'Completado' },
    injury_aborted: { cls: 'injury', Icon: Bandage, label: 'No terminado' },
  };
  const m = map[status] ?? map.completed;
  return (
    <span className={`status-pill ${m.cls}`}>
      <m.Icon size={12} strokeWidth={2.6} /> {m.label}
    </span>
  );
}

/* ── Marcador (equipos × sets) ── */
export interface ScoreSet {
  team1Games: number;
  team2Games: number;
}

export function ScoreGrid({
  team1,
  team2,
  sets,
  winnerTeam,
  injuredPlayerId,
  compact,
}: {
  team1: (LptPlayer | undefined)[];
  team2: (LptPlayer | undefined)[];
  sets: ScoreSet[];
  winnerTeam?: number | null;
  injuredPlayerId?: string | null;
  compact?: boolean;
}) {
  const n = Math.max(sets.length, 1);
  const row = (players: (LptPlayer | undefined)[], teamIdx: 1 | 2) => {
    const winner = winnerTeam === teamIdx;
    const loser = winnerTeam != null && winnerTeam !== teamIdx;
    return (
      <div className={`score-row ${loser ? 'loser' : ''}`} style={{ '--nsets': n } as React.CSSProperties}>
        <div className="team">
          <AvatarStack players={players} size={compact ? 24 : 28} />
          <span className="team-names">
            {players.map((p, i) => (
              <span key={p?.id ?? i}>
                {i > 0 && <span className="muted"> · </span>}
                {displayName(p)}
                {injuredPlayerId && p?.id === injuredPlayerId && (
                  <span title="Lesión" style={{ marginLeft: 4 }}>🤕</span>
                )}
              </span>
            ))}
          </span>
          {winner && <Trophy size={13} strokeWidth={2.6} style={{ color: 'var(--acc-text)', flexShrink: 0 }} />}
        </div>
        {sets.length > 0 ? (
          sets.map((s, i) => {
            const mine = teamIdx === 1 ? s.team1Games : s.team2Games;
            const theirs = teamIdx === 1 ? s.team2Games : s.team1Games;
            return (
              <span key={i} className={`set-cell ${mine > theirs ? 'w' : ''}`}>
                {mine}
              </span>
            );
          })
        ) : (
          <span className="set-cell" style={{ fontSize: 14, color: 'var(--ink-3)' }}>–</span>
        )}
      </div>
    );
  };
  return (
    <div className="score-grid">
      {row(team1, 1)}
      {row(team2, 2)}
    </div>
  );
}

/* ── Sparkline ── */
export function Sparkline({ data, w = 72, h = 24, stroke = 'var(--acc)' }: { data: number[]; w?: number; h?: number; stroke?: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - 3 - ((v - min) / span) * (h - 6)}`)
    .join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Líneas de pista (hero) ── */
export function HeroLines() {
  return (
    <svg className="hero-lines" viewBox="0 0 600 240" preserveAspectRatio="none" aria-hidden="true">
      <line x1="300" y1="0" x2="300" y2="240" stroke="currentColor" strokeWidth="1" opacity="0.12" />
      <rect x="60" y="30" width="480" height="180" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.10" />
      <line x1="60" y1="120" x2="540" y2="120" stroke="currentColor" strokeWidth="1" opacity="0.08" />
    </svg>
  );
}
