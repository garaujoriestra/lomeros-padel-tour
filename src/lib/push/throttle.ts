import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

// Reclama el turno de enviar un aviso identificado por `key`, como mucho una vez
// cada `windowHours`. Devuelve true solo a UN llamante: quien lo reciba envía.
//
// Es atómico a propósito. El planificador autoguarda por día con debounce, así
// que pintar una semana entera dispara hasta 7 escrituras casi simultáneas; un
// «lee y luego escribe» dejaría pasar varias y el grupo recibiría la ráfaga
// entera. Aquí el UPDATE condicional decide en la propia base de datos:
//
//   1. UPDATE ... WHERE sent_at es más viejo que la ventana → si toca una fila,
//      turno concedido (y la ventana queda reiniciada en el mismo paso).
//   2. Si no tocó ninguna fila, o no existe (primer aviso) o está en cooldown:
//      se intenta INSERT con ON CONFLICT DO NOTHING. Insertó → turno concedido;
//      no insertó → la fila ya estaba (en cooldown, o recién creada por otra
//      escritura de la misma ráfaga) → turno denegado.
//
// El ON CONFLICT evita a propósito hacer control de flujo con excepciones: el
// choque de clave es el caso NORMAL aquí (ocurre en cada guardado dentro de la
// ventana), y además Drizzle envuelve los errores de libsql, así que detectarlo
// por el texto del mensaje no es fiable.
export async function claimNotificationSlot(key: string, windowHours: number): Promise<boolean> {
  const window = `-${windowHours} hours`;
  const updated = await db.run(sql`
    UPDATE notification_throttle
       SET sent_at = datetime('now')
     WHERE key = ${key}
       AND sent_at <= datetime('now', ${window})
  `);
  if (updated.rowsAffected > 0) return true;

  const inserted = await db.run(sql`
    INSERT INTO notification_throttle (key, sent_at) VALUES (${key}, datetime('now'))
    ON CONFLICT (key) DO NOTHING
  `);
  return inserted.rowsAffected > 0;
}
