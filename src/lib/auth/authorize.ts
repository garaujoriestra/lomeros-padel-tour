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
  // Paso 2: /g/<slug>/me (y sub-rutas) exigen sesión, igual que /me en raíz.
  // La landing pública /g/<slug> (sin /me) no entra aquí.
  if (/^\/g\/[^/]+\/me(?:\/|$)/.test(path)) {
    return payload ? 'allow' : 'redirect-login';
  }
  // Paso 3: /g/<slug>/admin (y sub-rutas) exigen sesión, igual que /admin en raíz.
  // El rol admin DEL GRUPO lo exige g/[slug]/admin/layout.tsx server-side.
  if (/^\/g\/[^/]+\/admin(?:\/|$)/.test(path)) {
    return payload ? 'allow' : 'redirect-login';
  }
  if (path === '/planificador' || path.startsWith('/planificador/')) {
    return payload ? 'allow' : 'redirect-login';
  }
  // /g/<slug>/planificador exige sesión, igual que la raíz.
  if (/^\/g\/[^/]+\/planificador(?:\/|$)/.test(path)) {
    return payload ? 'allow' : 'redirect-login';
  }
  return 'allow';
}
