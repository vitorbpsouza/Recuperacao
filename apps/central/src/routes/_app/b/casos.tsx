import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/b/casos')({
  staticData: { titulo: 'Negociações' },
  component: Outlet,
});
