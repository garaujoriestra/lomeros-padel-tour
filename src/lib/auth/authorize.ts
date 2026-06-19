import type { SessionPayload } from './jwt';

export type AccessDecision = 'allow' | 'redirect-login' | 'redirect-home';

export function decideAccess(
  path: string,
  payload: SessionPayload | null,
): AccessDecision {
  if (path === '/admin' || path.startsWith('/admin/')) {
    // El edge solo comprueba que haya sesión; el rol admin lo exige
    // `admin/layout.tsx` server-side (el JWT ya no lleva role en 1C).
    return payload ? 'allow' : 'redirect-login';
  }
  if (path === '/me' || path.startsWith('/me/')) {
    return payload ? 'allow' : 'redirect-login';
  }
  return 'allow';
}
