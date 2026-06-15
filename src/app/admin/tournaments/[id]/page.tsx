import { db } from '@/lib/db';
import { loadEvent } from '@/lib/tournament/event-store';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function EventPanel({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let ev;
  try { ev = await loadEvent(db, id); } catch { notFound(); }
  if (!ev) notFound();
  return (
    <div className="space-y-4">
      <h1 className="sec-title">{ev.name}</h1>
      <p className="muted text-sm">{ev.date}{ev.location ? ` · ${ev.location}` : ''} · {ev.kind === 'pozo' ? 'Pozo' : 'Torneo'} ({ev.format})</p>
      <div className="text-sm">
        <p className="font-medium">Pistas (escalera):</p>
        <ol className="list-decimal ml-5">{ev.courts.map((c) => <li key={c.id}>{c.label} · {c.availableFrom}–{c.availableTo}</li>)}</ol>
        <p className="font-medium mt-3">Participantes: {ev.participantPlayerIds.length}</p>
      </div>
      <p className="text-ink-3 text-sm">La generación de parrilla llega en el siguiente plan.</p>
    </div>
  );
}
