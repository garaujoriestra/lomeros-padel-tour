import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-950 to-green-800 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="text-4xl mb-2">🚫</div>
          <CardTitle className="text-2xl">Cuenta no autorizada</CardTitle>
          <CardDescription>
            Tu cuenta de Google no está dada de alta. Pide al organizador que te añada.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <Link href="/" className="inline-flex items-center justify-center min-h-[40px] px-4 rounded-md border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-colors">
            Volver al inicio
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
