/** Grupo ancla (tenant #1). Sus filas existentes se backfillan a este id en la
 *  migración 1A; el id se usa además como DEFAULT de la columna group_id. */
export const LOMEROS_GROUP_ID = 'lomeros';
export const LOMEROS_GROUP_SLUG = 'lomeros';
export const LOMEROS_GROUP_NAME = 'Lomeros Padel Tour';

/** Slug del grupo canónico de la raíz (env configurable; por defecto el insignia).
 *  Lo usan el proxy (canonicalización /g/<slug> ↔ '/') y la landing (CTA «Ver un
 *  tour en marcha», que enlaza el tour insignia como prueba social). */
export function defaultGroupSlug(): string {
  return (process.env.DEFAULT_GROUP_SLUG ?? LOMEROS_GROUP_SLUG).trim();
}

/** Nombre neutro de la PLATAFORMA (lo que ve un grupo ajeno en login, atribución
 *  «hecho con …» y la PWA). Distinto de LOMEROS_GROUP_NAME, que es el nombre del
 *  grupo insignia. La marca de cada grupo (nombre/logo/color) la resuelve la Fase 3. */
export const PLATFORM_NAME = 'Bandejazo';
