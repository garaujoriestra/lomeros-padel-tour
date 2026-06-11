import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// POST /api/migrate-avatars?confirm=YES
// Convierte avatares antiguos guardados como data:image base64 (pesados, inline
// en la fila de players) a URLs de Vercel Blob (ligeras + optimizables por
// next/image). Idempotente: solo afecta a filas cuyo avatar empieza por "data:".
export async function POST(req: NextRequest) {
  if (req.nextUrl.searchParams.get('confirm') !== 'YES') {
    return NextResponse.json(
      { error: 'Missing ?confirm=YES — migración one-shot de avatares' },
      { status: 400 },
    );
  }

  try {
    const all = await db.select().from(players);
    const legacy = all.filter((p) => (p.avatarUrl ?? '').startsWith('data:'));

    const results: Array<{ id: string; name: string; ok: boolean; url?: string; kb?: number; reason?: string }> = [];

    for (const p of legacy) {
      const match = (p.avatarUrl ?? '').match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!match) {
        results.push({ id: p.id, name: p.name, ok: false, reason: 'data-uri no parseable' });
        continue;
      }
      const mime = match[1].toLowerCase();
      const ext = mime === 'jpeg' ? 'jpg' : mime;
      const buffer = Buffer.from(match[2], 'base64');

      const blob = await put(`avatars/${randomUUID()}.${ext}`, buffer, {
        access: 'public',
        contentType: `image/${mime}`,
      });

      await db.update(players).set({ avatarUrl: blob.url }).where(eq(players.id, p.id));
      results.push({ id: p.id, name: p.name, ok: true, url: blob.url, kb: Math.round(buffer.length / 1024) });
    }

    return NextResponse.json({ success: true, converted: results.filter((r) => r.ok).length, results });
  } catch (error) {
    console.error('migrate-avatars error', error);
    return NextResponse.json({ error: 'Error al migrar avatares' }, { status: 500 });
  }
}
