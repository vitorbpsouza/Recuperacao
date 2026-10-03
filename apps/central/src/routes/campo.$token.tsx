import { createFileRoute } from '@tanstack/react-router';

import { PaginaCampo } from '@/features/campo/pagina-campo.tsx';

/** Link de campo para o terceiro: fora do layout autenticado, sem login. */
export const Route = createFileRoute('/campo/$token')({
  staticData: { titulo: 'Envio de campo' },
  component: Pagina,
});

function Pagina() {
  const { token } = Route.useParams();
  return <PaginaCampo token={token} />;
}
