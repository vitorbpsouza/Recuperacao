# syntax=docker/dockerfile:1

# Imagem de staging e produção da ReCredita.
#
# Um container só: a API atende /api e serve o build da central na mesma
# origem. As tarefas de operação usam esta mesma imagem com outro comando
# (Cloud Run Jobs — ver docs/infra.md):
#
#   node dist/migrar.js          migrações, com a credencial de dono das tabelas
#   node dist/criar-usuario.js   usuário pela linha de comando
#   node dist/seed.js            dados sintéticos, só em staging
#
#   docker build -t recredita .

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-slim AS build
ENV TURBO_TELEMETRY_DISABLED=1
RUN npm install --global pnpm@12.3.4
WORKDIR /repo

# Primeiro só o lockfile: baixar dependências vira uma camada que sobrevive a
# qualquer mudança de código.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch --store-dir /pnpm/store

COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline --store-dir /pnpm/store
RUN pnpm turbo run build --filter=@workspace/api --filter=@workspace/central
# Pasta autossuficiente da API: o bundle (dist) e só as dependências de produção.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter=@workspace/api deploy --prod --legacy --prefer-offline --store-dir /pnpm/store /saida

FROM node:${NODE_VERSION}-slim
ENV NODE_ENV=production \
    PORT=8080 \
    CENTRAL_DIR=/app/central \
    MIGRACOES_DIR=/app/dist/migrations
WORKDIR /app
COPY --from=build /saida ./
COPY --from=build /repo/apps/central/dist ./central
USER node
EXPOSE 8080
CMD ["node", "dist/principal.js"]
