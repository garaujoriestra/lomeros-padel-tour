import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; error?: string }>;
}) {
  const { from, error } = await searchParams;
  const loginHref = from ? `/api/auth/login?from=${encodeURIComponent(from)}` : '/api/auth/login';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-950 to-green-800 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="text-4xl mb-2">🎾</div>
          <CardTitle className="text-2xl">Lomeros Padel Tour</CardTitle>
          <CardDescription>Inicia sesión para ver tu perfil · LPT</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <p className="text-sm text-red-500 text-center">
              No se pudo iniciar sesión. Inténtalo de nuevo.
            </p>
          )}
          <Link
            href={loginHref}
            className="flex items-center justify-center gap-3 w-full min-h-[44px] rounded-md border border-gray-300 bg-white text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/>
              <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"/>
            </svg>
            Entrar con Google
          </Link>
          <p className="text-xs text-gray-400 text-center">
            Solo cuentas autorizadas por el organizador.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
