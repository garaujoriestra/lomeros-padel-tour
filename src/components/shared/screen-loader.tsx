import Crest from './crest';

/**
 * Loader de marca entre pantallas — el escudo LPT (ya dibujado) sobre el verde
 * oscuro, con un pulso suave. Se usa como fallback de los loading.tsx de cada
 * sección. NO re-traza el escudo (a diferencia del splash de arranque): en
 * navegaciones rápidas un re-trazado se vería como un parpadeo. El estilo y el
 * retraso de aparición viven en `.screen-loader` (globals.css).
 */
export default function ScreenLoader() {
  return (
    <div className="screen-loader" role="status" aria-busy="true" aria-label="Cargando">
      <Crest size={104} className="screen-loader__crest" />
    </div>
  );
}
