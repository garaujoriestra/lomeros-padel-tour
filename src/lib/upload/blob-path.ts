// Ruta del blob de avatar namespaceada por grupo: avatars/{groupId}/{uuid}.{ext}.
// La extensión se normaliza (sin punto, minúsculas) y cae a 'jpg' si viene vacía.
export function buildAvatarKey(groupId: string, uuid: string, ext: string): string {
  const clean = ext.replace(/^\./, '').toLowerCase() || 'jpg';
  return `avatars/${groupId}/${uuid}.${clean}`;
}
