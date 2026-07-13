import type { Metadata } from 'next';
import { PLATFORM_NAME } from '@/lib/groups/constants';

export const metadata: Metadata = { title: `Términos · ${PLATFORM_NAME}` };

export default function TerminosPage() {
  return (
    <article>
      <h1 className="display" style={{ fontSize: 30 }}>Términos de uso</h1>
      <p className="small muted" style={{ marginTop: 4 }}>Condiciones mínimas de la beta. No es asesoría legal.</p>
      <h2 className="sec-title" style={{ fontSize: 20, marginTop: 28 }}>Qué es {PLATFORM_NAME}</h2>
      <p>Una herramienta gratuita para llevar el ranking, los partidos y las apuestas con fichas de
        tu grupo de pádel. Se ofrece «tal cual», sin garantías, durante la beta.</p>
      <h2 className="sec-title" style={{ fontSize: 20, marginTop: 28 }}>Uso responsable</h2>
      <p>Creas tu grupo con tu cuenta de Google y eres responsable de a quién invitas y de los datos
        que introducís. No uses la plataforma para nada ilegal ni para acosar a otras personas.</p>
      <h2 className="sec-title" style={{ fontSize: 20, marginTop: 28 }}>Fichas, no dinero</h2>
      <p>La Timba funciona con fichas de juego sin valor monetario. No es una casa de apuestas ni hay
        transacciones con dinero real entre jugadores.</p>
      <h2 className="sec-title" style={{ fontSize: 20, marginTop: 28 }}>Pase de Temporada</h2>
      <p>Todo lo funcional es gratis. El Pase de Temporada (opcional) solo desbloquea la identidad
        visual de tu grupo (nombre, logo y colores propios) y se paga vía Stripe.</p>
    </article>
  );
}
