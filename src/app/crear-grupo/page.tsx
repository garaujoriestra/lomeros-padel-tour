import { getSession } from '@/lib/auth/session';
import { verifyInviteToken } from '@/lib/onboarding/invite-token';
import { CreateGroupForm } from '@/components/onboarding/create-group-form';

export const dynamic = 'force-dynamic';

// Onboarding (beta cerrada): página a la que llega un admin invitado con
// /crear-grupo?t=<token firmado>. Tres ramas: sin token válido / sin sesión / form.
export default async function CrearGrupoPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const valid = await verifyInviteToken(t);

  return (
    <div className="min-h-dvh flex items-center justify-center p-4" style={{ background: 'var(--hero-bg)' }}>
      <div className="lpt-card card-pad w-full max-w-sm">
        <h1 className="display" style={{ fontSize: 26, margin: 0 }}>Crea tu grupo</h1>
        {!valid ? (
          <p className="small muted" style={{ marginTop: 12 }}>
            Para crear un grupo necesitas una invitación. Pide un enlace al organizador.
          </p>
        ) : (
          <Gate t={t!} />
        )}
      </div>
    </div>
  );
}

async function Gate({ t }: { t: string }) {
  const session = await getSession();
  if (session) return <CreateGroupForm t={t} />;

  // Sin sesión: no podemos escribir la cookie signup_intent desde un Server Component
  // (Next solo lo permite en Server Functions/Route Handlers) — el botón de Google pasa
  // por /api/onboarding/intent, que la deja y redirige conservando el token en el retorno.
  return (
    <div style={{ marginTop: 12 }}>
      <p className="small muted">Entra con tu cuenta de Google para continuar.</p>
      <a className="lpt-btn primary" style={{ width: '100%', marginTop: 16 }} href={`/api/onboarding/intent?t=${t}`}>
        Entrar con Google
      </a>
    </div>
  );
}
