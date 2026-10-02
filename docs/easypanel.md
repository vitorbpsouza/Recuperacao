# Deploy no Easypanel

Alternativa ao Google Cloud ([infra.md](infra.md)) para rodar a ReCredita num servidor próprio com Easypanel. É a mesma imagem (`Dockerfile` na raiz): a API atende `/api` e serve a central na mesma origem.

## Armazenamento (montagens)

**O aplicativo não precisa de montagem nenhuma.** O container não grava nada em disco: todo dado vive no Postgres. Deixe a tela "Armazenamento" do app vazia.

O que precisa persistir é o **serviço Postgres** (`db-recuperacao`). O Easypanel já cria um volume para ele. Configure ali os **backups** (Armazenamento → Criar Backup de Volume, ou o backup do próprio serviço de banco). É o único dado da operação.

## 1. Fonte e build

- Fonte: repositório GitHub `vitorbpsouza/Recuperacao`, branch `main`.
- Build: **Dockerfile** (caminho `Dockerfile`).

## 2. Banco: papel da API

A API não deve conectar como `postgres` (superusuário). O isolamento entre canais e tenants é imposto pelo RLS do banco, e o login da API deve ter só o papel da aplicação.

No console do serviço de banco (`psql -U postgres -d lion`), uma vez:

```sql
create role recredita_api login password '<senha gerada: openssl rand -hex 24>';
```

## 3. Variáveis de ambiente do app

| Variável | Valor |
| --- | --- |
| `DATABASE_URL` | `postgres://recredita_api:<senha da API>@lion_db-recuperacao:5432/lion?sslmode=disable` |
| `SEGREDO_SESSAO` | `openssl rand -hex 32` (32+ caracteres; o mesmo em todas as réplicas) |
| `GOOGLE_CLOUD_PROJECT` | opcional — liga a CAMILA via Vertex AI; sem ela, a CAMILA fica indisponível e o resto funciona |

`NODE_ENV=production`, `PORT=8080`, `CENTRAL_DIR` e `MIGRACOES_DIR` já vêm da imagem.

`sslmode=disable` só vale porque o banco está na rede interna do Easypanel (`lion_db-recuperacao`). Nunca exponha a porta do Postgres para fora.

A URL com a senha do `postgres` fica só no Easypanel e no console, nunca no repositório.

## 4. Domínio

- Domínios → adicionar o domínio com **HTTPS ligado** e a porta de destino **8080**.
- HTTPS é obrigatório: o cookie de sessão é `__Host-sessao` (Secure). Sem HTTPS, o login não se mantém.

## 5. Implantar e migrar

1. **Implantar**.
2. No console do app (ícone `>_`), rode as migrações com o superusuário. Elas criam as tabelas e o papel `recredita_app`, e concedem esse papel ao `recredita_api`:

   ```bash
   DATABASE_URL='postgres://postgres:<senha do postgres>@lion_db-recuperacao:5432/lion?sslmode=disable' \
   LOGIN_DA_API=recredita_api node dist/migrar.js
   ```

   A saída termina com `recredita_api conecta como recredita_app`.

3. Primeiro admin (mesmo console; a senha vai por variável para não ficar no histórico de argumentos):

   ```bash
   DATABASE_URL='postgres://postgres:<senha do postgres>@lion_db-recuperacao:5432/lion?sslmode=disable' \
   SENHA_INICIAL='<senha forte>' node dist/criar-usuario.js admin@<domínio> "Nome Completo" admin
   ```

4. Só para homologação, dados sintéticos de demonstração:

   ```bash
   DATABASE_URL='…postgres…' SEMEAR_DADOS_SINTETICOS=sim node dist/seed.js
   ```

   Nunca faça isso no banco de produção.

5. Confira `https://<domínio>/api/saude`: a resposta é `{"ok":true,…}`.

## Versão nova

1. **Implantar** (o Easypanel refaz a imagem da `main`).
2. Rode `node dist/migrar.js` no console com a URL do `postgres`, como no passo 5.

As migrações são compatíveis com a versão anterior, e migração já aplicada nunca é editada (o migrador confere o checksum).

## Segurança

- A senha do `postgres` circulou em conversa: **troque-a** (`alter role postgres password '…'`) e atualize-a no Easypanel.
- Backups do volume do banco agendados. Sem eles, perder o servidor é perder a operação.
