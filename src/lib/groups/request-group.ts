import type { NextRequest } from 'next/server';
import { getGroupBySlug } from './resolve-slug';

// Grupo objetivo de una request por query (?g=<slug>). Para métodos sin body (GET, DELETE).
// Devuelve el groupId, o null si no se indicó grupo o el slug no existe (el caller cae al
// grupo por defecto / única membership).
export async function groupIdFromQuery(request: NextRequest): Promise<string | null> {
  return groupIdFromValue(request.nextUrl.searchParams.get('g'));
}

// Grupo objetivo a partir de un valor (campo `g` del body de una mutación, o un query param).
export async function groupIdFromValue(value: unknown): Promise<string | null> {
  if (typeof value !== 'string' || !value) return null;
  const group = await getGroupBySlug(value);
  return group?.id ?? null;
}
