import { eq, asc, desc, sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '@/lib/db/schema';
import {
  tournaments, tournamentCourts, tournamentParticipants,
  tournamentGroups, tournamentPairs, tournamentMatches,
} from '@/lib/db/schema';
import type { EventKind, EventConfig } from './types';

type Db = LibSQLDatabase<typeof schema>;

export interface EventCourtInput {
  label: string;
  sortOrder: number;
  availableFrom: string;
  availableTo: string;
}

export interface CreateEventInput {
  name: string;
  date: string;
  location: string | null;
  kind: EventKind;
  format: string;
  config: EventConfig;
  createdBy: string | null;
  courts: EventCourtInput[];
  participantPlayerIds: string[];
}

export interface UpdateEventInput {
  name: string;
  date: string;
  location: string | null;
  config: EventConfig;
  courts: EventCourtInput[];
  participantPlayerIds: string[];
}

export interface LoadedEvent {
  id: string;
  name: string;
  date: string;
  location: string | null;
  kind: EventKind;
  format: string;
  config: EventConfig;
  status: string;
  courts: { id: string; label: string; sortOrder: number; availableFrom: string; availableTo: string }[];
  participantPlayerIds: string[];
}

export async function createEvent(db: Db, input: CreateEventInput): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(tournaments).values({
    id, name: input.name, date: input.date, location: input.location ?? null,
    kind: input.kind, format: input.format, config: JSON.stringify(input.config),
    status: 'draft', createdBy: input.createdBy ?? null,
  });
  await insertCourtsAndParticipants(db, id, input.courts, input.participantPlayerIds);
  return id;
}

async function insertCourtsAndParticipants(
  db: Db, tournamentId: string, courts: EventCourtInput[], participantPlayerIds: string[],
): Promise<void> {
  for (const c of courts) {
    await db.insert(tournamentCourts).values({
      id: crypto.randomUUID(), tournamentId, label: c.label, order: c.sortOrder,
      availableFrom: c.availableFrom, availableTo: c.availableTo,
    });
  }
  for (const pid of participantPlayerIds) {
    await db.insert(tournamentParticipants).values({
      id: crypto.randomUUID(), tournamentId, playerId: pid,
    });
  }
}

export async function loadEvent(db: Db, id: string): Promise<LoadedEvent> {
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, id));
  if (!t) throw new Error('NOT_FOUND');
  const courts = await db.select().from(tournamentCourts)
    .where(eq(tournamentCourts.tournamentId, id)).orderBy(asc(tournamentCourts.order));
  const parts = await db.select().from(tournamentParticipants)
    .where(eq(tournamentParticipants.tournamentId, id));
  return {
    id: t.id, name: t.name, date: t.date, location: t.location ?? null,
    kind: t.kind as EventKind, format: t.format,
    config: JSON.parse(t.config) as EventConfig, status: t.status,
    courts: courts.map((c) => ({
      id: c.id, label: c.label, sortOrder: c.order,
      availableFrom: c.availableFrom, availableTo: c.availableTo,
    })),
    participantPlayerIds: parts.map((p) => p.playerId),
  };
}

export async function listEvents(db: Db, kind: EventKind): Promise<LoadedEvent[]> {
  const rows = await db.select().from(tournaments)
    .where(eq(tournaments.kind, kind)).orderBy(asc(tournaments.date));
  const out: LoadedEvent[] = [];
  // N+1 aceptable: uso exclusivo admin, N = nº de eventos (decenas como mucho).
  for (const r of rows) out.push(await loadEvent(db, r.id));
  return out;
}

// Resumen ligero de un evento para listados públicos (sin recargar pistas/participantes/config).
export interface EventSummary {
  id: string;
  name: string;
  date: string;
  location: string | null;
  kind: EventKind;
  format: string;
  status: string;
  totalMatches: number;
  completedMatches: number;
}

// Lista TODOS los eventos (cualquier kind) ordenados por fecha DESC (más recientes primero).
// Sin N+1: una query a `tournaments` + UNA query agrupada a `tournament_matches` para los
// conteos (total y completados por torneo), y luego mapeo en memoria.
export async function listEventSummaries(db: Db): Promise<EventSummary[]> {
  const rows = await db.select({
    id: tournaments.id, name: tournaments.name, date: tournaments.date,
    location: tournaments.location, kind: tournaments.kind, format: tournaments.format,
    status: tournaments.status,
  }).from(tournaments).orderBy(desc(tournaments.date));

  const counts = await db.select({
    tournamentId: tournamentMatches.tournamentId,
    total: sql<number>`count(*)`,
    completed: sql<number>`sum(case when ${tournamentMatches.status} = 'completed' then 1 else 0 end)`,
  }).from(tournamentMatches).groupBy(tournamentMatches.tournamentId);

  const countById = new Map(counts.map((c) => [c.tournamentId, c] as const));

  return rows.map((r) => {
    const c = countById.get(r.id);
    return {
      id: r.id, name: r.name, date: r.date, location: r.location ?? null,
      kind: r.kind as EventKind, format: r.format, status: r.status,
      totalMatches: Number(c?.total ?? 0),
      completedMatches: Number(c?.completed ?? 0),
    };
  });
}

// Edita la meta + reemplaza pistas/participantes. NO toca kind/format (inmutables tras crear)
// ni status (las transiciones de estado las gestionan operaciones de dominio aparte).
export async function updateEvent(db: Db, id: string, input: UpdateEventInput): Promise<void> {
  await db.update(tournaments).set({
    name: input.name, date: input.date, location: input.location ?? null,
    config: JSON.stringify(input.config),
  }).where(eq(tournaments.id, id));
  // Reemplaza pistas y participantes (FK OFF en Turso/harness → borrar explícito).
  await db.delete(tournamentCourts).where(eq(tournamentCourts.tournamentId, id));
  await db.delete(tournamentParticipants).where(eq(tournamentParticipants.tournamentId, id));
  await insertCourtsAndParticipants(db, id, input.courts, input.participantPlayerIds);
}

// Borra el evento y TODOS sus hijos. FK puede estar OFF en Turso/harness, así que NO
// confiamos en ON DELETE CASCADE: borramos cada tabla hija explícitamente (hijos antes
// que el padre) y por último la fila de tournaments.
export async function deleteEvent(db: Db, id: string): Promise<void> {
  await db.delete(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
  await db.delete(tournamentPairs).where(eq(tournamentPairs.tournamentId, id));
  await db.delete(tournamentGroups).where(eq(tournamentGroups.tournamentId, id));
  await db.delete(tournamentParticipants).where(eq(tournamentParticipants.tournamentId, id));
  await db.delete(tournamentCourts).where(eq(tournamentCourts.tournamentId, id));
  await db.delete(tournaments).where(eq(tournaments.id, id));
}
