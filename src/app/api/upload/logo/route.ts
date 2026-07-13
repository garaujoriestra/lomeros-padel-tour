import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { requireGroupAdmin } from '@/lib/auth/guard';
import { groupIdFromValue } from '@/lib/groups/request-group';
import { buildLogoKey } from '@/lib/upload/blob-path';

// Subida del logo del grupo (Fase 3): solo el admin DEL grupo (campo g del form).
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const auth = await requireGroupAdmin(await groupIdFromValue(formData.get('g')));
    if ('response' in auth) return auth.response;

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

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const filename = buildLogoKey(auth.ctx.groupId, randomUUID(), ext);
    const blob = await put(filename, file, { access: 'public', contentType: file.type });
    return NextResponse.json({ url: blob.url });
  } catch (e) {
    console.error('Logo upload error:', e);
    return NextResponse.json({ error: 'Error al subir la imagen' }, { status: 500 });
  }
}
