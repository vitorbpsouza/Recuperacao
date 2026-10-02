# Deploy no Easypanel

Alternativa ao Google Cloud ([infra.md](infra.md)) para rodar a ReCredita num servidor próprio com Easypanel. É a mesma imagem (`Dockerfile` na raiz): a API atende `/api` e serve a central na mesma origem.

## Armazenamento (montagens)

**O aplicativo não precisa de montagem nenhuma.** O container não grava nada em disco: todo dado vive no Postgres. Deixe a tela "Armazenamento" do app vazia.

O que precisa persistir é o **serviço Postgres** (`db-recuperacao`). O Easypanel já cria um volume para ele. Configure ali os **backups**: é o único dado da operação.

## 1. Fonte e build

- Fonte: repositório GitHub `vitorbpsouza/Recuperacao`, branch `main`.
- Build: **Dockerfile** (caminho `Dockerfile`).

## 2. Variáveis de ambiente

Em **Ambiente**, uma variável por linha, no formato `NOME=valor`:

```
DATABASE_URL=postgres://postgres:<senha do postgres>@lion_db-recuperacao:5432/lion?sslmode=disable
SEGREDO_SESSAO=<saída de: openssl rand -hex 32>
ADMIN_EMAIL=admin@recredita.local
ADMIN_SENHA=<senha forte, 12 ou mais caracteres>
```

- Opcional: `GOOGLE_CLOUD_PROJECT` liga a CAMILA via Vertex AI. Sem ela, a CAMILA fica indisponível e o resto funciona.
- `NODE_ENV=production`, `PORT=8080`, `CENTRAL_DIR` e `MIGRACOES_DIR` já vêm da imagem.
- `sslmode=disable` só vale porque o banco está na rede interna do Easypanel. Nunca exponha a porta do Postgres para fora.
- As senhas ficam só no Easypanel, nunca no repositório.

## 3. Domínio

Em **Domínios**, configure o seu domínio com **HTTPS ligado** e porta de destino **8080**. Sem HTTPS o login não se mantém: o cookie de sessão é `__Host-sessao` (Secure).

## 4. Implantar

Clique em **Implantar**. Na subida, a API prepara o banco sozinha:

1. aplica as migrações pendentes;
2. cria o admin de `ADMIN_EMAIL`/`ADMIN_SENHA`, se ele ainda não existir.

No log aparecem `migrações aplicadas: …` (ou `banco em dia: nenhuma migração pendente`) e `admin criado: …`. Confira `https://<domínio>/api/saude` e entre com o admin.

Para uma homologação com dados de demonstração, acrescente `SEMEAR_DADOS_SINTETICOS=sim`. Nunca faça isso em produção.

A cada versão nova, basta **Implantar**: as migrações pendentes rodam na subida.

- Migração já aplicada nunca é editada: o migrador confere o checksum.
- Várias instâncias sobem sem conflito: um advisory lock do Postgres faz uma migrar de cada vez.

## 5. Endurecer depois (recomendado)

O `postgres` é superusuário. O isolamento entre Plano A e B continua valendo, porque toda transação da API roda como `recredita_app` sob RLS. Ainda assim, o ideal é a API conectar com um papel sem permissão de DDL:

1. No console do banco, crie o papel da API:

   ```sql
   create role recredita_api login password '<senha>';
   ```

2. No console do app (`>_`), migre com a URL do `postgres` e conceda o papel:

   ```bash
   DATABASE_URL='postgres://postgres:<senha>@lion_db-recuperacao:5432/lion?sslmode=disable' \
   LOGIN_DA_API=recredita_api node dist/migrar.js
   ```

3. No app, troque `DATABASE_URL` para o usuário `recredita_api` e acrescente `MIGRAR_NA_SUBIDA=nao`.

Daí em diante, rode o passo 2 a cada versão que trouxer migração nova.

## Segurança

- A senha do `postgres` circulou em conversa: **troque-a** (`alter role postgres password '…'`) e atualize-a no Easypanel.
- Mantenha os backups do volume do banco agendados. Sem eles, perder o servidor é perder a operação.
