import { NextRequest, NextResponse } from 'next/server';
import { requireGroupAdmin } from '@/lib/auth/guard';
import { groupIdFromValue } from '@/lib/groups/request-group';
import { sendToGroup } from '@/lib/push/send';

export const runtime = 'nodejs';

// POST /api/push/broadcast — envía un aviso a los miembros del grupo del admin (admin DEL
// grupo objetivo; grupo en body.g). Body: { title, body, url?, g? }
export async function POST(request: NextRequest) {
  const reqBody = await request.json().catch(() => null);
  if (!reqBody) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });

  const auth = await requireGroupAdmin(await groupIdFromValue(reqBody.g));
  if ('response' in auth) return auth.response;
  try {
    const { title, body, url } = reqBody;
    if (!title || !body) {
      return NextResponse.json({ error: 'Título y cuerpo son obligatorios' }, { status: 400 });
    }
    const sent = await sendToGroup(auth.ctx.groupId, {
      title: String(title),
      body: String(body),
      url: typeof url === 'string' && url.length > 0 ? url : '/',
      tag: 'broadcast',
    });
    return NextResponse.json({ success: true, sent });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al enviar el aviso' }, { status: 500 });
  }
}
