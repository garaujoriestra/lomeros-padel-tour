import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { requireSession } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { buildAvatarKey } from '@/lib/upload/blob-path';

export async function POST(req: NextRequest) {
  // Subida de avatar: la usa el admin (fichas de jugador) y también el propio
  // jugador desde /me/edit, así que basta con estar autenticado (no solo admin).
  const auth = await requireSession();
  if ('response' in auth) return auth.response;
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No se recibió ningún archivo' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Solo se permiten imágenes' }, { status: 400 });
    }

    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'La imagen no puede superar 2MB' }, { status: 400 });
    }

    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const filename = buildAvatarKey(groupId, randomUUID(), ext);

    const blob = await put(filename, file, {
      access: 'public',
      contentType: file.type,
    });

    return NextResponse.json({ url: blob.url });
  } catch (e) {
    console.error('Upload error:', e);
    return NextResponse.json({ error: 'Error al subir la imagen' }, { status: 500 });
  }
}
