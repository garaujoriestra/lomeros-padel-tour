import { SignJWT, jwtVerify } from 'jose';

export type Role = 'admin' | 'player';

export interface SessionPayload {
  userId: string;
  role: Role;
  [key: string]: unknown; // requerido por jose JWTPayload
}

const key = () => new TextEncoder().encode(process.env.AUTH_SECRET);

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(key());
}

export async function verifySession(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    if (typeof payload.userId !== 'string' || typeof payload.role !== 'string') {
      return null;
    }
    return { userId: payload.userId, role: payload.role as Role };
  } catch {
    return null;
  }
}
