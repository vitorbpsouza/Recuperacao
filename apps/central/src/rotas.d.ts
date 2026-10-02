import '@tanstack/react-router';

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** Título da rota no breadcrumb. */
    titulo?: string;
  }
}
