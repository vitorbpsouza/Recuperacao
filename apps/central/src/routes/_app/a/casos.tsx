import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/a/casos')({
  staticData: { titulo: 'Casos' },
  component: Outlet,
});
