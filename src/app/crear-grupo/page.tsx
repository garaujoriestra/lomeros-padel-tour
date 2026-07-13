import { getSession } from '@/lib/auth/session';
import { verifyInviteToken } from '@/lib/onboarding/invite-token';
import { isPublicSignupEnabled } from '@/lib/onboarding/public-signup';
import { CreateGroupForm } from '@/components/onboarding/create-group-form';

export const dynamic = 'force-dynamic';

// Onboarding. Alta ABIERTA (PUBLIC_SIGNUP_ENABLED): cualquier usuario logueado crea grupo.
// Respaldo de beta cerrada: enlace /crear-grupo?t=<token firmado>. Ramas: no permitido /
// sin sesión / formulario.
export default async function CrearGrupoPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const tokenValid = await verifyInviteToken(t);
  const allowed = tokenValid || isPublicSignupEnabled();

  return (
    <div className="min-h-dvh flex items-center justify-center p-4" style={{ background: 'var(--hero-bg)' }}>
      <div className="lpt-card card-pad w-full max-w-sm">
        <h1 className="display" style={{ fontSize: 26, margin: 0 }}>Crea tu grupo</h1>
        {!allowed ? (
          <p className="small muted" style={{ marginTop: 12 }}>
            Para crear un grupo necesitas una invitación. Pide un enlace al organizador.
          </p>
        ) : (
          <Gate t={tokenValid ? t : undefined} />
        )}
      </div>
    </div>
  );
}

async function Gate({ t }: { t?: string }) {
  const session = await getSession();
  if (session) return <CreateGroupForm t={t} />;

  // Sin sesión: el botón pasa por /api/onboarding/intent (Route Handler) para dejar la
  // cookie signup_intent y redirigir a Google conservando el retorno. En alta abierta va
  // sin token; con invitación conserva el token.
  const href = t ? `/api/onboarding/intent?t=${t}` : '/api/onboarding/intent';
  return (
    <div style={{ marginTop: 12 }}>
      <p className="small muted">Entra con tu cuenta de Google para continuar.</p>
      <a className="lpt-btn primary" style={{ width: '100%', marginTop: 16 }} href={href}>
        Entrar con Google
      </a>
    </div>
  );
}
