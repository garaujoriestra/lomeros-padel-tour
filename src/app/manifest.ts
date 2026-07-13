import type { MetadataRoute } from 'next';
import { buildGroupManifest } from '@/lib/groups/manifest';
import { LOMEROS_GROUP_NAME, LOMEROS_GROUP_SLUG } from '@/lib/groups/constants';

// La raíz `/` es el grupo insignia (Lomeros). Identidad estática desde constantes
// (build-safe, sin DB): el grupo por defecto no tiene marca de pago propia. Un
// despliegue con un grupo por defecto branded necesitaría leer DB (fuera de alcance).
export default function manifest(): MetadataRoute.Manifest {
  return buildGroupManifest({
    brand: { name: LOMEROS_GROUP_NAME, slug: LOMEROS_GROUP_SLUG, logoUrl: null, accentColor: null },
    basePath: '',
    paid: true,
  });
}
