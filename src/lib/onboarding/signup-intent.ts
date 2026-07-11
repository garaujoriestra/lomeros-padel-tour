import { SignJWT, jwtVerify } from 'jose';

// Cookie firmada que autoriza al callback OAuth a CREAR CUENTA para un email
// desconocido (la deja /crear-grupo tras validar el enlace de invitación).
// NO autoriza crear grupo: eso lo re-valida el POST con el token del enlace.
export const SIGNUP_INTENT_COOKIE = 'signup_intent';
const PURPOSE = 'signup';
const TTL = '30m';

const key = () => new TextEncoder().encode(process.env.AUTH_SECRET);

export async function signSignupIntent(): Promise<string> {
  return new SignJWT({ purpose: PURPOSE })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(key());
}

export async function verifySignupIntent(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    return payload.purpose === PURPOSE;
  } catch {
    return false;
  }
}

// Pura: tabla de verdad de la rama nueva del callback.
export function shouldCreateUser(input: { userExists: boolean; intentValid: boolean }): boolean {
  return !input.userExists && input.intentValid;
}
