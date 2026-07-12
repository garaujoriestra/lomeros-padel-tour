import { SignJWT, jwtVerify } from 'jose';

// Enlace de invitación para CREAR GRUPO (beta cerrada): JWT firmado con el AUTH_SECRET
// existente, multiuso, caduca solo a los 7 días (sin env vars que rotar ni tablas).
// El purpose evita que una cookie de sesión u otro JWT del sistema cuele como invitación.
const PURPOSE = 'create-group';
const TTL = '7d';

const key = () => new TextEncoder().encode(process.env.AUTH_SECRET);

export async function signInviteToken(): Promise<string> {
  return new SignJWT({ purpose: PURPOSE })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(key());
}

export async function verifyInviteToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    return payload.purpose === PURPOSE;
  } catch {
    return false;
  }
}
