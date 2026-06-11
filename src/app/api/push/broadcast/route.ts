import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { sendToAll } from '@/lib/push/send';

// POST /api/push/broadcast — envía un aviso a todas las suscripciones (solo admin).
// Body: { title, body, url? }
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { title, body, url } = await request.json();
    if (!title || !body) {
      return NextResponse.json({ error: 'Título y cuerpo son obligatorios' }, { status: 400 });
    }
    await sendToAll({
      title: String(title),
      body: String(body),
      url: typeof url === 'string' && url.length > 0 ? url : '/',
      tag: 'broadcast',
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al enviar el aviso' }, { status: 500 });
  }
}
