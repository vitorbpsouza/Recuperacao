# ReCredita

Plataforma de veículos com garantia em dois canais que nunca se misturam:

- **Plano A — recuperação para o credor.** Carteira recebida de bancos e financeiras; localização e retomada do bem pelo rito judicial, extrajudicial ou amigável.
- **Plano B — aquisição via quitação.** Lead próprio: a ReCredita quita o financiamento, o veículo passa a ser dela e segue para estoque e revenda.

A visão de produto, as regras de negócio (jurídicas e bancárias) e o roteiro estão em [docs/PLANO-RECREDITA.md](docs/PLANO-RECREDITA.md). A infraestrutura está em [docs/infra.md](docs/infra.md).

## Estrutura

Monorepo com pnpm e Turborepo.

| Pasta | O que é |
| --- | --- |
| `apps/central` | backoffice (React, TanStack Router e Query, shadcn/ui) |
| `apps/api` | API (Fastify, zod, OpenAPI); em produção também serve a central |
| `packages/db` | migrações SQL, schema Drizzle, seed sintético, testes de invariantes |
| `packages/domain` | regras compartilhadas: fronteira entre planos, status, schemas, KPIs |
| `packages/ui` | componentes shadcn/ui e de marca, tokens da identidade visual |
| `packages/api-client` | cliente tipado gerado do OpenAPI da API |
| `packages/config` | tsconfig compartilhado |
| `e2e` | jornadas no navegador (Playwright) |

## Desenvolvimento

Requisitos: Node 24+ e pnpm 12 (`npm install -g pnpm@12`).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # preencha ADMIN_SENHA (12+ caracteres)
pnpm --filter @workspace/api dev         # API em http://localhost:3001
pnpm --filter @workspace/central dev     # central em http://localhost:3000
```

Sem `DATABASE_URL`, a API usa o PGlite — o próprio PostgreSQL compilado para WASM, rodando no processo — em `~/.recredita/pglite-dev`, fora do repositório. Na subida, ela migra, semeia dados sintéticos e cria o admin do `.env`. Não precisa de Docker.

O PGlite aceita um processo por vez: pare a API antes de rodar um comando que abre o banco (`pnpm --filter @workspace/db migrar`, `… seed`, `pnpm --filter @workspace/api criar-usuario`).

A documentação da API (Swagger) fica em <http://localhost:3001/docs> fora de produção.

## Testes

```bash
pnpm turbo run lint typecheck test build      # o que o CI roda
```

- **Invariantes e API** (`packages/db`, `apps/api`): por padrão em PGlite. Com `TEST_DATABASE_URL` apontando para um Postgres, cada arquivo de teste cria e apaga o próprio banco ali — é assim no CI:

  ```bash
  docker run -d --name pg -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:18
  TEST_DATABASE_URL=postgres://postgres:postgres@localhost:55432/postgres pnpm turbo run test
  ```

- **Jornadas no navegador** (`e2e`): sobem uma API e uma central próprias (portas 3100/3101, banco temporário) e não tocam no ambiente de desenvolvimento. No Windows usam o Edge instalado; nos demais sistemas, o Chromium do Playwright (`pnpm --filter @workspace/e2e exec playwright install chromium`).

  ```bash
  pnpm --filter @workspace/e2e test:e2e
  E2E_BASE_URL=http://localhost:8080 pnpm --filter @workspace/e2e test:e2e   # contra um servidor já no ar
  ```

  Além das jornadas, um teste conta as renderizações do React com cada tela parada: um laço de renderização não aparece em teste funcional e congela a página quando cai dentro de um clique.

- **Capturas de tela** para revisar a identidade visual, com a API e a central de desenvolvimento no ar:

  ```bash
  E2E_EMAIL=… E2E_SENHA=… pnpm --filter @workspace/e2e capturas   # salva em e2e/capturas/
  ```

## Mudou a API?

O cliente da central é gerado do OpenAPI. Depois de mudar rota ou contrato:

```bash
pnpm --filter @workspace/api openapi && pnpm --filter @workspace/api-client gerar
```

O CI falha se o cliente versionado não bater com a API.

## Banco

- Migrações em `packages/db/migrations`, em SQL, aplicadas em ordem e conferidas por checksum. Migração aplicada não se edita: escreve-se uma nova.
- As regras críticas vivem no banco, não só na rota: a fronteira entre os planos (origem → finalidade), a colisão entre canais, a trilha de auditoria append-only e o RLS por tenant e por canal.
- A API conecta com um papel sem privilégio e roda cada transação como `recredita_app`, com o contexto da sessão; nunca como dono das tabelas. Detalhes em [docs/infra.md](docs/infra.md#papéis-do-banco).
- Dado pessoal de devedor e vendedor só aparece sob demanda, com finalidade declarada, e cada acesso fica registrado.

## Imagem e deploy

```bash
docker build -t recredita .
```

Uma imagem para staging e produção: a API serve a central na mesma origem, e migração, criação de usuário e seed são a mesma imagem com outro comando. O passo a passo no Google Cloud está em [docs/infra.md](docs/infra.md).
