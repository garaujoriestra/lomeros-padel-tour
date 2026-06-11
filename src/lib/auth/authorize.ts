import type { SessionPayload } from './jwt';

export type AccessDecision = 'allow' | 'redirect-login' | 'redirect-home';

export function decideAccess(
  path: string,
  payload: SessionPayload | null,
): AccessDecision {
  if (path === '/admin' || path.startsWith('/admin/')) {
    if (!payload) return 'redirect-login';
    return payload.role === 'admin' ? 'allow' : 'redirect-home';
  }
  if (path === '/me' || path.startsWith('/me/')) {
    return payload ? 'allow' : 'redirect-login';
  }
  return 'allow';
}
