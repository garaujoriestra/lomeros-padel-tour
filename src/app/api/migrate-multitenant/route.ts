import { NextResponse } from 'next/server';
import { client } from '@/lib/db';
import { migrateMultitenant } from '@/lib/db/migrations/multitenant';

// POST /api/migrate-multitenant
// Migración 1A (groups + memberships + group_id). Idempotente. Ejecutar UNA vez
// tras desplegar:  curl -X POST https://<dominio>/api/migrate-multitenant
// El JSON de respuesta es el check de integridad (membershipsTotal debe igualar
// usersTotal, y para cada tabla withGroup debe igualar total).
export async function POST() {
  try {
    const report = await migrateMultitenant(client);
    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al migrar multitenant' }, { status: 500 });
  }
}
