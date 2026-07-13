import type { Metadata } from 'next';
import { PLATFORM_NAME } from '@/lib/groups/constants';

export const metadata: Metadata = { title: `Privacidad · ${PLATFORM_NAME}` };

export default function PrivacidadPage() {
  return (
    <article>
      <h1 className="display" style={{ fontSize: 30 }}>Privacidad</h1>
      <p className="small muted" style={{ marginTop: 4 }}>Aviso mínimo de la beta. No es asesoría legal.</p>
      <h2 className="sec-title" style={{ fontSize: 20, marginTop: 28 }}>Qué guardamos</h2>
      <p>Tu cuenta de Google (nombre, email y foto que Google comparte al iniciar sesión) y los
        datos de juego de tu grupo que tú y tu peña introducís: partidos, resultados, rankings,
        logros, disponibilidad y las fichas de La Timba.</p>
      <h2 className="sec-title" style={{ fontSize: 20, marginTop: 28 }}>Para qué</h2>
      <p>Solo para hacer funcionar {PLATFORM_NAME}: mostrar el ranking, el historial y las apuestas
        de tu grupo. No vendemos tus datos ni los usamos para publicidad de terceros.</p>
      <h2 className="sec-title" style={{ fontSize: 20, marginTop: 28 }}>La Timba</h2>
      <p>Las apuestas de La Timba usan fichas de juego sin ningún valor monetario. No es dinero real
        ni hay premios en metálico.</p>
      <h2 className="sec-title" style={{ fontSize: 20, marginTop: 28 }}>Tus datos y contacto</h2>
      <p>Puedes pedir la baja de tu grupo o la eliminación de tus datos escribiendo al organizador
        de tu grupo o a quien gestiona {PLATFORM_NAME}.</p>
    </article>
  );
}
