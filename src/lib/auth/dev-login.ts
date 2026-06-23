/**
 * Guard de dev-tooling: habilita el dev-login y el seed de staging SOLO fuera de
 * producción. En Vercel, VERCEL_ENV vale 'production' | 'preview' | 'development';
 * en local (`npm run dev`) es undefined. Producción es el único entorno bloqueado.
 * Es un check de ENTORNO (no un flag activable por error en prod).
 */
export function isDevToolingEnabled(): boolean {
  return process.env.VERCEL_ENV !== 'production';
}
