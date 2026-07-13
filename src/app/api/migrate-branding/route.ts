import { NextResponse } from 'next/server';
import { client } from '@/lib/db';
import { migrateBranding } from '@/lib/db/migrations/branding';

// POST /api/migrate-branding
// Fase 3 (logo/color/pase en groups + billing_events). Idempotente. Ejecutar UNA vez
// tras desplegar:  curl -X POST https://<dominio>/api/migrate-branding
export async function POST() {
  try {
    const report = await migrateBranding(client);
    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al migrar branding' }, { status: 500 });
  }
}
