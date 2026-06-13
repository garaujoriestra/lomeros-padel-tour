// Fallback de carga por defecto para toda la app (perfil /me, /admin, /login y
// cualquier sección sin su propio loading.tsx). Las rutas de (public) tienen el
// suyo, idéntico. Así el loader de marca aparece en CUALQUIER navegación.
export { default } from '@/components/shared/screen-loader';
