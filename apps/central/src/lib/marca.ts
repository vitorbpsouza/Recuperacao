/**
 * Marca exibida antes do login, quando ainda não se sabe o tenant.
 *
 * Com um tenant só, é a da ReCredita. Quando a plataforma atender outras
 * empresas, a tela de login resolve o tenant pelo subdomínio.
 */
export const MARCA_PADRAO = { nome: 'ReCredita', sigla: 'RC', logoUrl: null } as const;
