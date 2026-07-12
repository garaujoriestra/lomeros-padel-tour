// Ruta del blob de avatar namespaceada por grupo: avatars/{groupId}/{uuid}.{ext}.
// La extensión se normaliza (sin punto, minúsculas) y cae a 'jpg' si viene vacía.
export function buildAvatarKey(groupId: string, uuid: string, ext: string): string {
  const clean = ext.replace(/^\./, '').toLowerCase() || 'jpg';
  return `avatars/${groupId}/${uuid}.${clean}`;
}

// Ruta del blob del logo de grupo: logos/{groupId}/{uuid}.{ext} (Fase 3).
export function buildLogoKey(groupId: string, uuid: string, ext: string): string {
  const clean = ext.replace(/^\./, '').toLowerCase() || 'jpg';
  return `logos/${groupId}/${uuid}.${clean}`;
}
