/**
 * Loader de marca entre pantallas — mismo aspecto que el splash de arranque
 * (logo LPT + ring sobre el verde oscuro). Se usa como fallback de los
 * loading.tsx de cada sección, de modo que la navegación muestra siempre el
 * mismo loader consistente en vez de skeletons. El estilo y el retraso de
 * aparición viven en `.screen-loader` (globals.css).
 */
export default function ScreenLoader() {
  return (
    <div className="screen-loader" role="status" aria-busy="true" aria-label="Cargando">
      <div className="screen-loader__logo">LPT</div>
      <div className="screen-loader__ring" aria-hidden="true" />
    </div>
  );
}
