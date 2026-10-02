import { createFileRoute, Outlet } from '@tanstack/react-router';

/** Telas que valem para os dois planos: dados, fontes, colisões e contas. */
export const Route = createFileRoute('/_app/gestao')({
  staticData: { titulo: 'Gestão' },
  component: Outlet,
});
