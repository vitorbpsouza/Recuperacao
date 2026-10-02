# Plano — ReCredita: plataforma de Recuperação (Plano A) e Aquisição (Plano B)

> Status: aprovado em 2026-10-02. Este documento é a referência viva do produto e muda junto com o código.

## Contexto

O ERP nasceu como protótipo "3A Soluções" (Google AI Studio). A 3A não existe mais: a primeira empresa da plataforma é a **ReCredita**. O objetivo é transformar o protótipo na melhor ferramenta do mercado para os dois canais. Todas as telas passam a usar shadcn/ui, mantendo a identidade de cor atual: slate-950 + azul-600, Inter, cartões arredondados, PlacaMercosul e CAMILA.

### Decisões tomadas

- Ordem: primeiro a fundação comum, depois o Plano A, depois o Plano B.
- Escopo: central (backoffice) + App de Campo (PWA) + Portal do Credor + Portal do Vendedor + Portal de Parceiros.
- Uso próprio agora e SaaS depois: `tenant_id` + RLS desde já, com a ReCredita como tenant 1.
- Plano B: depois da quitação, o veículo é da ReCredita (estoque próprio e revenda).
- A stack pode mudar (seção 2): fica o que é bom (React, TypeScript, Tailwind, regras impostas no banco) e troca o que limita (Express + SQLite, app único, mapa).

### O que preservar (já está certo)

- Fronteira origem→finalidade imposta no banco: CHECKs `fronteira_origem_finalidade` e `campos_por_finalidade` e trigger `trg_colisao_exige_evidencia`. A finalidade nunca vem do cliente.
- Segregação por canal entre pessoas (`exigirCanal`, `canaisVisiveis`). O auditor é somente leitura.
- Trilha LGPD append-only, com procedência derivada do caso (`registrarConsulta`).
- Sessão opaca com hash de token e scrypt. Testes de invariantes da fronteira.
- Nenhum número inventado na tela.

### O que falta

- As telas rodam sobre mocks e simulações com `setTimeout` (distribuição, enriquecimento, chat da CAMILA, aceite do agente).
- Os KPIs têm tendência fixa e o mapa desloca marcadores com `Math.random`.
- Há textos fixos: "Monitorando 12 ativos", "8 Operadores Online" e o usuário "Vitor Bruno" na Sidebar.
- A UI é artesanal e duplicada (modais, tabelas, badges, toast). Usa `confirm()` nativo e não tem rotas nem design system.
- A fonte Inter está declarada mas não é carregada. Os micro-textos `text-[10px] text-slate-500` ficam abaixo do contraste AA.
- O banco é SQLite em arquivo. O template do AI Studio publica em Cloud Run, que tem disco efêmero. Não há RLS e só uma conexão escreve por vez.
- O Plano B só tem o registro do caso e `podeTransferir`. O Plano A não tem rito, prazos, custódia nem faturamento real.

---

## 1. Requisitos de negócio (visão jurídica e bancária)

### Plano A — Recuperação para o credor (alienação fiduciária, DL 911/69)

Fluxo: recepção → saneamento e enriquecimento com base legal → rito habilitado → distribuição → localização → retomada → custódia → entrega ao credor ou leiloeiro → faturamento → prestação de contas.

#### Ritos (habilitados por credor/contrato)

- **Judicial**
  - nº CNJ, vara/comarca, liminar, mandado, oficial, depositário e auto de busca e apreensão.
  - Apreensão em outra comarca (art. 3º §12) e RENAJUD (§9º).
  - **5 dias para purga da mora**, com pagamento integral (§§1º-2º; STJ Tema 722), e 15 dias para resposta.
  - Bem não localizado: conversão em execução (art. 4º).
  - Movimentações pela API pública do DataJud.
- **Extrajudicial** — Lei 14.711/2023, arts. 8º-B a 8º-E; validado pelo STF nas ADIs 7600/7601/7608 em jun/2025, com interpretação conforme.
  - Cláusula em destaque no contrato e prova da mora.
  - Notificação pelo cartório de RTD, com 20 dias de prazo, e consolidação averbada.
  - Certidão de busca e apreensão + restrição no RENAVAM.
  - A ReCredita atua como "empresa especializada na localização", mandatária do credor (art. 8º-C §§4º-5º): **mandato vigente é obrigatório**.
  - Purga em 5 dias úteis após a apreensão. Via alternativa no DETRAN (art. 8º-E).
- **Amigável**
  - Termo de entrega voluntária assinado, com vistoria e inventário.

#### Regras impostas pelo servidor (Plano A)

Nenhuma delas depende de alguém lembrar do procedimento.

1. **Recall imediato.** Quando o credor retira o caso (pagamento ou acordo), a OS é cancelada no app em tempo real e a API recusa a retomada. Apreender bem quitado gera dano moral.
2. **Prova da mora antes da retomada.** A notificação com AR no endereço do contrato basta (STJ Tema 1.132). É obrigatória no extrajudicial.
3. **Limites do STF no extrajudicial.** Sem violência, sem ingresso em domicílio e sem exposição do devedor. O botão "Resistência" no app aborta a retomada e converte o caso para o rito judicial.
4. **Devedor PJ em RJ ou falência.** Checagem antes da retomada: no stay period, bem de capital essencial não sai (Lei 11.101, art. 49 §3º e art. 6º §§4º e 7º-A). O caso fica suspenso para o jurídico.
5. **Cadeia de custódia.** Cada diligência registra GPS, hora do servidor e fotos com SHA-256.
   - Vistoria de remoção: km, combustível, avarias e fotos por ângulo.
   - **Inventário de pertences**, com devolução registrada.
   - Entrada e saída de pátio, com diárias.
6. **Conduta de cobrança** (CDC arts. 42 e 71; Res. CMN 4.949/2021, que os bancos exigem dos fornecedores):
   - janela de contato e roteiros aprovados;
   - proibido revelar a dívida a terceiros;
   - todo contato fica registrado.
7. **Vínculo e redistribuição.**
   - `prazo_vinculo` e `prazo_maximo` vencidos redistribuem o caso.
   - Só recebe OS o recuperador com cadastro em dia: antecedentes, contrato, seguro, treinamento e, no extrajudicial, mandato.
   - O recuperador só é rastreado com OS ativa (minimização LGPD).

#### KPIs que o banco compra (Painel A e Portal do Credor)

- Taxa de localização e taxa de recuperação (apreensão + entrega amigável).
- **Taxa de cura**: pagamento ou acordo durante o caso também conta como sucesso.
- Tempo por etapa e aging por safra de recebimento.
- SLA cumprido, devoluções e reclamações.
- Valor recuperado (FIPE) ÷ saldo.

Argumento comercial: resolver mais rápido reduz a perda esperada que o banco provisiona (Res. CMN 4.966/2021, vigente desde 01/2025).

#### Economia do Plano A

- Contrato por credor: honorário de êxito por retomada (e por cura, quando contratado) × categoria × UF × rito, SLA, despesas reembolsáveis com teto e glosa.
- Fatura com NFS-e e conciliação.
- Repasse ao recuperador: comissão, ajuda de custo e bônus.
- Resultado: margem por caso.

### Plano B — Aquisição via quitação (lead próprio; quitado, o carro é da ReCredita)

Fluxo: lead com evidência de origem → triagem → colisão com o Plano A → due diligence → oferta → procuração e negociação com o credor → fechamento simultâneo → quitação → baixa de gravame e RENAJUD → transferência para a ReCredita → estoque e recondicionamento → revenda → resultado da operação.

#### Regras impostas pelo servidor (Plano B)

1. **Fronteira e colisão**, que já existem, mais uma muralha: a ReCredita não adquire nem arremata em leilão veículo que ela mesma recuperou no Plano A.
2. **Due diligence antes da oferta.**
   - Veículo: gravame (SNG/B3), RENAJUD (tipo, processo e origem; restrição de terceiro bloqueia), restrições administrativas, roubo/furto, leilão/sinistro, débitos (IPVA, multas, licenciamento), recall e vistoria cautelar.
   - Vendedor: identidade com biometria, titularidade do contrato, situação do CPF/CNPJ e certidões (cível, federal, trabalhista, protesto).
   - O dossiê é a prova de boa-fé contra fraude à execução (CPC art. 792; Súmula 375/STJ).
   - PJ em recuperação judicial só vende ativo não circulante com autorização do juiz (Lei 11.101, art. 66). Falência bloqueia a compra.
3. **Fechamento simultâneo.** Elimina a "venda de ágio" e o "contrato de gaveta": posse sem quitação expõe à disposição de bem alienado (CP art. 171 §2º, I).
   - No mesmo ato: contrato de compra e venda, procuração com poderes para transferir, quitação paga **direto ao credor** (nunca via vendedor) e entrega do veículo com vistoria.
   - A ATPV-e sai depois da baixa do gravame.
   - O valor do vendedor só é liberado após a transferência.
4. **Quitação correta.**
   - Saldo e boleto só com o titular ou com procuração específica (sigilo bancário, LC 105/2001).
   - Liquidação antecipada com redução proporcional de juros (CDC art. 52 §2º; Res. CMN 3.516/2007), ou acordo com desconto em contrato inadimplente.
   - Com busca e apreensão em curso, o acordo inclui pedido de extinção e baixa do RENAJUD.
5. **`podeTransferir` ampliado.**
   - Exige: quitação comprovada, gravame baixado, sem RENAJUD, ATPV-e assinada (pelo vendedor ou procurador), vistoria aprovada, débitos quitados e identidade verificada.
   - Anuência formal é exigida quando há acordo com desconto. A quitação integral por terceiro, em nome do devedor, é direito do pagador (CC art. 304, parágrafo único) — validar com o jurídico.
   - Prazo de 30 dias para transferir (CTB art. 123 §1º).
6. **PLD/FT.**
   - KYC de vendedor e comprador.
   - Alertas: pagador terceiro, valor fora da curva, dinheiro em espécie.
   - Enquadramento como sujeito obrigado (Lei 9.613/98, art. 9º) a validar com o jurídico.
7. **Revenda.**
   - NF-e de entrada (compra de PF) e de saída.
   - Garantia legal de 90 dias (CDC art. 26, II).
   - Direito de arrependimento de 7 dias em venda online (CDC art. 49).

#### Economia do Plano B (visão bancária)

- **Oferta máxima ao vendedor** = preço de liquidez − quitação − débitos − custos (transferência, vistoria, recondicionamento, logística) − custo de capital × giro esperado − margem-alvo.
- KPIs: funil por etapa, ciclo (lead→quitação→transferência→venda), capital alocado, margem e TIR por operação, giro de estoque.
- Para o credor, a quitação por terceiro em contrato inadimplente reduz a perda esperada (estágio 3 da Res. 4.966) e evita custas e deságio de leilão. Isso sustenta **convênios de quitação**: desconto por faixa de atraso e anuência padronizada.

---

## 2. Stack

| Camada | Antes | Agora | Por quê |
| --- | --- | --- | --- |
| Repositório | pasta única | **Monorepo pnpm + Turborepo** | Três frentes e uma API compartilham UI e regras. Usuário externo nunca baixa o código do backoffice. |
| Front | React 19 + Vite + TS + Tailwind 4 | **Mantém** + shadcn/ui | Já é o padrão do mercado; o shadcn é nativo de Tailwind 4 e React 19. |
| Rotas | estado `activeTab` | **TanStack Router** | Rotas e filtros tipados na URL (visões salvas, links diretos) e code splitting. |
| Dados no cliente | hook próprio `useRecurso` | **TanStack Query + TanStack Table** | Cache, refetch sem piscar e mutações otimistas. |
| Formulários | `FormData` manual | **React Hook Form + zod** (Field do shadcn) | O mesmo schema valida a tela e a API. |
| Cliente da API | `fetch` manual | **openapi-typescript + openapi-fetch**, gerado do OpenAPI da API | Contrato tipado de ponta a ponta. |
| Mapas | pigeon-maps (com `Math.random`) | **MapLibre GL** + tiles próprios (PMTiles) | Clustering, mapa de calor e sem rastreio de terceiros. |
| App de campo | — | **PWA** (vite-plugin-pwa + Dexie para fila offline) | Uma base só. Empacotar com Capacitor se o iOS limitar sincronização em segundo plano ou câmera. |
| API | Express 4 | **Fastify 5** + zod + OpenAPI | Validação por schema e documentação pronta para a API do credor. Plugins oficiais de cookie, CSRF, rate limit e upload. |
| Banco | SQLite em arquivo | **PostgreSQL 18 + PostGIS** (Cloud SQL, São Paulo) com **Drizzle ORM** | Durável e concorrente. CHECKs e políticas RLS no schema; triggers em SQL próprio. 18 é a versão do PGlite e a padrão do Cloud SQL. |
| Banco em dev e testes | — | **PGlite** (Postgres em WASM) | O mesmo Postgres, sem Docker na máquina de quem desenvolve; o CI roda também contra um Postgres 18 de servidor, com um banco descartável por arquivo de teste. |
| Jobs | — | **pg-boss** | Prazos e integrações sem precisar de Redis. |
| Tempo real | — | **SSE** alimentado por `LISTEN/NOTIFY` | Simples e suficiente para status e campo. |
| Arquivos | — | **Cloud Storage** (São Paulo) | URL assinada e hash SHA-256 no upload. |
| Autenticação | sessão opaca própria (bom desenho) | **Mantém o desenho** (token com hash, revogação) + cookie httpOnly + CSRF + TOTP + passkey + link/OTP para o vendedor | Preserva as garantias já testadas. |
| IA (CAMILA) | Gemini com chave do AI Studio | **Gemini via Vertex AI**, com o mesmo SDK `@google/genai` | Contrato empresarial, DPA e dados fora do treino: exigência de banco e da LGPD. |
| PDFs (dossiês) | — | `@react-pdf/renderer` no servidor | Sem Chromium no container. |
| Infra | AI Studio / Cloud Run | **Cloud Run + Cloud SQL + Cloud Storage + Secret Manager em São Paulo**, ambientes staging/prod e GitHub Actions | Dados no Brasil simplificam a homologação pelos bancos (Res. CMN 4.893/2021). |
| Observabilidade | `console.log` | pino + OpenTelemetry + Sentry | Rastreio de erro e desempenho. |
| Testes | script `tsx` | **Vitest** + Playwright + axe | Invariantes no Postgres e jornadas de ponta a ponta. |

### Estrutura do monorepo

```text
apps/
  central/     React SPA — backoffice (Planos A e B, global)
  campo/       React PWA — recuperadores
  portal/      React SPA — credor, vendedor e parceiro
  api/         Fastify — rotas, serviços, integrações, jobs
packages/
  ui/          shadcn/ui + componentes de marca + tokens (globals.css)
  domain/      fronteira, fluxos (máquinas de estado), schemas zod, kpis
  db/          schema Drizzle, migrações SQL (CHECKs, triggers, RLS), seed
  api-client/  cliente tipado gerado do OpenAPI
  config/      tsconfig compartilhado
```

---

## 3. UX/UI — shadcn/ui com a identidade de cor atual

### Tokens

Arquivo `packages/ui/src/styles/globals.css`; tema escuro fixo; `<html lang="pt-BR" class="dark">`.

| Token shadcn | Classe usada antes | Valor (paleta Tailwind v4) |
| --- | --- | --- |
| `--background` | `bg-slate-950` | `oklch(0.129 0.042 264.695)` |
| `--foreground` | `text-slate-200` | `oklch(0.929 0.013 255.508)` |
| `--card` | `bg-slate-900/50` | `oklch(0.208 0.042 265.755 / 50%)` |
| `--popover` | `bg-slate-900` | `oklch(0.208 0.042 265.755)` |
| `--primary` / `--primary-foreground` | `bg-blue-600` / branco | `oklch(0.546 0.245 262.881)` / `oklch(1 0 0)` |
| `--ring` | `focus:border-blue-500` | `oklch(0.623 0.214 259.815)` |
| `--secondary`, `--muted` | `bg-slate-800` | `oklch(0.279 0.041 260.031)` |
| `--muted-foreground` | `text-slate-500` → **slate-400**, para atingir AA | `oklch(0.704 0.04 256.788)` |
| `--accent` | `hover:bg-white/5` | `oklch(1 0 0 / 5%)` |
| `--border`, `--input` | `border-white/10` | `oklch(1 0 0 / 10%)` |
| `--destructive` | red-500 | `oklch(0.637 0.237 25.331)` |
| `--success` / `--warning` / `--info` (novos) | emerald-500 / amber-500 / blue-500 | `oklch(0.696 0.17 162.48)` / `oklch(0.769 0.188 70.08)` / `oklch(0.623 0.214 259.815)` |
| `--canal-a` / `--canal-b` (novos) | azul / índigo (já usado no avatar) | blue-600 / `oklch(0.585 0.233 277.117)` |
| `--chart-1..5` | cores do Dashboard | blue-500, emerald-500, amber-500, red-500, indigo-500 |
| `--sidebar-*` | Sidebar | slate-950, blue-600, white/5, white/10 |
| `--radius` | `rounded-xl` (cartões em `rounded-2xl`) | `0.75rem` (radius-xl = 1rem) |

Complementos:

- Inter carregada de verdade (`@fontsource-variable/inter`).
- `tabular-nums` em valores e tabelas.
- Variante de botão com o brilho de antes (`shadow-primary/20`).
- O micro-rótulo uppercase/tracking-widest vira componente, com 11px e `muted-foreground`.
- `selection:bg-blue-500/30` e `.custom-scrollbar` mantidos.

### Componentes shadcn

- Layout e navegação: sidebar, breadcrumb, tabs, toggle-group, command, kbd, pagination, scroll-area, separator, resizable, accordion, collapsible.
- Dados: table + data-table, card, badge, avatar, chart, progress, skeleton, spinner, empty.
- Sobreposições: dialog, alert-dialog, sheet, drawer, dropdown-menu, popover, hover-card, tooltip, sonner.
- Formulários: field, input, input-group, input-otp, select, combobox, textarea, checkbox, radio-group, switch, calendar/date-picker, button, button-group.

`framer-motion` e `motion` (os dois estavam instalados) viram só `motion`.

### Componentes de marca (`packages/ui/src/brand/`)

- `TenantMark`: o quadrado azul com sigla (antes "3A") vem do tenant. Mostra "RC" até o logo da ReCredita chegar.
- `PlacaMercosul`: refatorado com `cva` (tamanhos sm/md/lg e `aria-label`). É assinatura visual e fica.
- `CanalBadge` e `StatusBadge`: tom por status dos dois vocabulários, mapeado em `packages/domain`.
- `SlaTimer`: limiares vêm do contrato do credor.
- `KpiCard`: mostra tendência real ou nenhuma.
- `InfoTooltip`: mesma API, sobre o Tooltip do shadcn.
- `MoneyBRL`.
- `DocumentoMascarado`: CPF/CNPJ mascarado; "revelar" pede justificativa e grava o acesso.
- `Pendencias` (checklist das guardas), `LinhaDoTempo` e `CamilaSugestao` (sugestão + "por quê" + aceitar/descartar).

### Princípios de UX

- **O usuário está sempre dentro de um plano.**
  - O seletor de canal fica no topo da Sidebar, com rotas `/a/*` e `/b/*`.
  - A cor do canal marca header e badges.
  - Nenhuma tela mistura canais.
- **A máquina de estados desenha a tela.** As ações oferecidas são as transições permitidas. Uma ação bloqueada aparece desabilitada com o motivo ("Transferir — gravame não baixado"), vindo das mesmas guardas do servidor.
- **Fila de trabalho por papel.** Ordenada por urgência (purga vencendo, recall, vínculo expirando, alerta de campo), com visões salvas na URL e ação em lote com prévia.
- **⌘K** busca placa, CPF, processo e lead só nos canais do usuário.
- **Dado honesto.**
  - Sem mock, sem tendência inventada; mapa só com coordenada real.
  - Skeleton no primeiro carregamento, Empty quando vazio, erro visível com "Tentar de novo".
  - Refetch esmaece em vez de piscar (`placeholderData: keepPreviousData`).
- **Dado pessoal sob demanda.** As listas não mostram CPF nem nome completo; a ficha carrega o dado e registra o acesso.
- **Padrões do shadcn no lugar dos caseiros:** `confirm()` → AlertDialog; toast próprio → Sonner; modais → Dialog/Sheet; menus → DropdownMenu.
- **Acessibilidade:** WCAG AA, foco visível e `prefers-reduced-motion`.

### Mapa de telas

#### `central` — global

- Login (+MFA)
- Painel consolidado (admin)
- Auditoria & LGPD
- Colisões
- Dados & Bureaus
- Usuários e papéis
- Configurações: tenant/marca, credores, tabelas, modelos de documento e mensagem, integrações, retenção
- CAMILA

#### `central` — Plano A

- Painel A
- Importação de carteira
- Casos (tabela + kanban)
- Ficha do caso: Resumo · Linha do tempo · Rito/Processo · Campo · Custódia · Documentos · Financeiro · Acessos
- Distribuição
- Central de campo (mapa ao vivo)
- Rede de campo
- Processos
- Pátios e logística
- Credores e contratos
- Faturamento
- Repasses
- Relatórios A

#### `central` — Plano B

- Painel B
- Leads
- Negociações (pipeline com R$)
- Ficha da negociação: Resumo · Due diligence · Oferta · Credor/anuência · Fechamento · Transferência · Documentos · Financeiro
- Calculadora de oferta
- Convênios de quitação
- Estoque
- Revenda
- Funding e resultado
- Parceiros
- Relatórios B

#### `campo` (PWA)

- Minhas OS
- OS
- Check-in (geocerca)
- Avistamento
- Abordagem (roteiro)
- Entrega amigável (termo + assinatura)
- Resistência
- Remoção (vistoria guiada + inventário + fotos obrigatórias)
- Entrega no pátio (QR)
- Fila offline e login com passkey

#### `portal` — Credor

- Carteira
- Caso: status e linha do tempo, sem dado de enriquecimento
- Dossiê de evidências: PDF com hashes e QR de verificação
- SLA e KPIs
- Faturas
- API/Webhooks

#### `portal` — Vendedor

- Acesso por link + OTP
- Minha venda (etapas)
- Documentos
- Validação de identidade
- Oferta e assinatura
- Pagamento

#### `portal` — Parceiros

- Indicar lead (com evidência de origem)
- Minhas indicações
- Comissões

---

## 4. Arquitetura

### Banco

- `tenant_id` + RLS em todas as tabelas de negócio, com `set_config('app.tenant_id', …, true)` por transação. Seed do tenant ReCredita.
- Migrações SQL versionadas, portando os CHECKs, triggers e regras append-only.

### Domínio compartilhado (`packages/domain`)

- `casos.ts`: a fronteira, mantida.
- `fluxos.ts`: máquinas de estado A e B (transições + guardas), usadas pela API e pela tela.
- `schemas.ts`: zod do formulário e da API.
- `kpis.ts`: fórmulas únicas para painel, relatório e portal.
- Vocabulário A ampliado: + Pronto para Campo (rito habilitado), Retomado, Em Custódia, Entregue ao Credor, Curado, Suspenso e Não Localizado. "Removido pelo Banco" vira o estado de recall.
- Vocabulário B ampliado: + Em Triagem, Due Diligence, Reprovado, Oferta Aceita, Anuência Obtida, Fechamento Agendado, Gravame Baixado, Em Estoque e Vendido.

### API (`apps/api`)

- Organizada em `routes/`, `services/`, `integracoes/` e `jobs/`.
- Cada adaptador de integração registra contrato, custo e auditoria, no padrão `env_var_chave` do `bureau`.
- Handler de erro único, helmet e rate limit.
- Em produção, a API serve os builds dos apps na mesma origem.

### Tabelas novas (* = append-only)

- Comuns: `tenant`, `credor`, `contrato_credor`, `caso_evento`*, `documento` (sha256, tipo, retenção), `prazo`, `notificacao`, `acesso_dado_pessoal`*, `ia_chamada`* e `dado_enriquecido` (com retenção).
- Plano A: `processo_judicial`, `procedimento_extrajudicial`, `mandato`, `diligencia`*, `vistoria`, `custodia`, `fatura`, `item_fatura` e `recuperador_documento`.
- Plano B: `diligencia_veiculo`, `kyc`, `oferta`, `negociacao_credor`, `fechamento`, `transferencia`, `estoque_item`, `venda`, `alocacao_capital`, `parceiro` e `comissao`.

### Papéis

admin, gestor, operador (por canal), jurídico, financeiro, auditor, recuperador, credor, vendedor e parceiro.

### Jobs (pg-boss)

- Prazos: purga, vínculo, SLA e os 30 dias da transferência.
- Polling do DataJud e envio de webhooks assinados.
- Expurgo LGPD das consultas vencidas.

### Integrações (todas na API)

- Bureaus de crédito e localização e FIPE.
- Dados veiculares: gravame SNG/B3, RENAJUD, débitos, leilão/sinistro, roubo/furto.
- Processos: DataJud e provedor comercial de monitoramento processual e de RJ.
- Identidade e assinatura: assinatura eletrônica (MP 2.200-2/2001, art. 10 §2º) e biometria/liveness.
- Comunicação: WhatsApp Business.
- Financeiro e fiscal: PIX/boletos, NFS-e e NF-e.
- Geocodificação.

### CAMILA

- Funções:
  - próxima melhor ação por caso;
  - extração de documentos (contrato, CRLV, boleto de quitação, auto de apreensão, certidão do RTD), com confirmação humana;
  - resumo de movimentações processuais;
  - scores de localização, cura e prazo;
  - oferta assistida no Plano B;
  - detecção de anomalias e fraude.
- Regras:
  - O contexto é montado na API só com dados do canal do usuário: a fronteira vale também para a IA.
  - Pseudonimização antes do envio e registro em `ia_chamada`.
  - Nenhuma ação de risco sem humano e nenhum número inventado.

---

## 5. Roadmap

### Fase 0 — Fundação

- Monorepo pnpm + Turborepo com a estrutura da seção 2.
- Rotas atuais portadas para Fastify sem mudar o comportamento: mesmas respostas, mesmos códigos de erro, mesma fronteira.
- Postgres com Drizzle, tenant e RLS. Os testes de fronteira passam a rodar em Vitest.
- Cookie + CSRF, `caso_evento`, OpenAPI e geração do `api-client`.
- Infra de staging em São Paulo (Cloud Run, Cloud SQL, Storage, Secret Manager) e CI no GitHub Actions.
- Rebrand para ReCredita: a marca vem do tenant.
- `packages/ui` com shadcn, tokens e componentes de marca.
- Shell da central: Sidebar com seletor de canal e usuário real; Header com breadcrumb, ⌘K, notificações e CAMILA. TanStack Router e Query.
- Saída: login → shell novo → lista real de casos por canal no staging, com invariantes verdes no Postgres.
- **Andamento (2026-10-02):** tudo acima está no código e verificado — invariantes e API contra Postgres 18, jornadas E2E contra a imagem de produção, CI com três jobs. Falta executar o passo a passo de [infra.md](infra.md) num projeto GCP: a saída da fase depende do staging no ar. Em 2026-10-02 a implantação seguiu pelo Easypanel (servidor próprio, app + Postgres); guia em [easypanel.md](easypanel.md).

### Fase 1 — Todas as telas atuais em shadcn, com dado real

| Antes | Depois |
| --- | --- |
| `Dashboard` | Painéis A e B |
| `AtivosModule` | Casos + Ficha do caso |
| `DistribuicaoModule` | Distribuição (endpoint de distribuir caso) |
| `OperacoesModule` | Central de campo + linha do tempo |
| `RecuperadoresModule` | Rede de campo |
| `EnriquecimentoModule` | Dados & Bureaus, sobre as rotas de bureaus, custos e auditoria |
| `FinanceiroModule` | Repasses |
| `BancosModule` | Fontes e credores (`fonte_ativo`; contratos chegam na 2b) |
| `RelatoriosModule` | Relatórios |
| `CamilaPanel` | Sheet |
| `Login` | Login no novo layout |
| — | Configurações, com criação de usuário (antes só existia na CLI) |

- Apagar os mocks, o toast próprio, as simulações com `setTimeout` e o legado `Ativo`/`StatusAtivo`/`casoParaAtivo`; os tipos do domínio entram no lugar.
- Métrica sem fonte real fica oculta até existir evento que a calcule.
- Saída: nenhuma tela importa mock; uma regra de lint proíbe `<button>`, `<input>`, `<select>` e `<table>` crus nos apps, forçando o uso de `@workspace/ui`.
- **Andamento (2026-10-02):** telas migradas, com dado real — painéis A e B, casos e ficha (resumo, linha do tempo, dado pessoal sob demanda, acessos), distribuição, rede de campo, repasses, dados & bureaus, fontes, relatórios, colisões, usuários e CAMILA. Mocks e simulações apagados; a regra de lint está ativa. Falta a central de campo (mapa): ainda não existe coordenada real, que chega com o app de campo (fase 2a).

### Fase 2a — Plano A: operação

- Importação de carteira:
  - planilha/CSV/API, com modelo por credor/fonte;
  - validação de placa, chassi, RENAVAM e CPF/CNPJ;
  - deduplicação, colisão e relatório de rejeição;
  - arquivo de recall.
- Máquina de estados A, ritos e prazos automáticos.
- Processo judicial com DataJud, e procedimento extrajudicial (RTD/DETRAN) com mandato.
- Checagem de RJ antes da retomada.
- Enriquecimento com base legal, gravando `dado_enriquecido` com retenção.
- Distribuição v2:
  - distância real (PostGIS), capacidade, especialidade, compliance e rotação;
  - motivo da escolha explicado na tela;
  - redistribuição por vínculo vencido.
- App `campo` (PWA offline): cadeia de custódia, resistência → judicial e recall em tempo real.
- Pátios e logística até o credor ou leiloeiro, e dossiê de evidências.
- Saída: jornada A de ponta a ponta, com evidência auditável.
- **Andamento (2026-10-02) — encerrada nesta etapa com o motor jurídico do Plano A:**
  - **Pronto e testado:**
    - **Máquina de estados A no banco** (migração `0005_ciclo_recuperacao.sql`).
      - Vocabulário novo: Pronto para Campo, Retomado, Em Custódia, Entregue ao Credor, Curado, Não Localizado e Suspenso. "Recuperado" virou "Entregue ao Credor".
      - Matriz de transições espelhada em `packages/domain/src/fluxos.ts`; um teste garante que as duas são iguais.
      - Caso novo do Plano A entra como "Recebido".
      - Encerramentos exigem motivo, que vai para a linha do tempo.
    - **Guardas impostas pelo banco** (`pendencias_transicao`):
      - **Habilitar para campo:** exige credor, rito e mora comprovada (Tema 1.132).
        - Judicial: liminar deferida.
        - Extrajudicial: cláusula em destaque, certidão e mandato vigente.
        - Amigável: mandato vigente.
      - **Retomar:**
        - Exige a mesma prova da habilitação, o mandado expedido no judicial e a declaração de conduta na apreensão extrajudicial (STF, ADIs 7600, 7601 e 7608).
        - Para devedor PJ, exige verificação de RJ e falência com até 30 dias.
      - **Entregar ao credor:** só depois de vencido o prazo de purga.
      - **Recall:** encerra o caso para sempre.
    - **Novas tabelas:**
      - `credor` (aceita CNPJ alfanumérico);
      - `mandato`;
      - `processo_judicial` (número CNJ validado pelo módulo 97);
      - `procedimento_extrajudicial` (consolidação só depois dos 20 dias);
      - `prova_mora`;
      - `verificacao_rj` (append-only).
      - Todas com RLS do Plano A, e cada registro deixa evento na linha do tempo.
    - **Prazos** (`packages/domain/src/prazos.ts`):
      - Purga em 5 dias corridos no judicial e em 5 dias úteis no extrajudicial.
      - Notificação extrajudicial com 20 dias.
      - Calendário com feriados nacionais e móveis, contagem do CC art. 132 e fuso de São Paulo.
    - **Painel A** com retomados, curados e taxa de cura. A fila de distribuição só mostra casos habilitados.
    - **Testes:** domínio 33, banco 60, API 50 e E2E 10.
  - **Pendente (próximas etapas do Plano A):**
    - Rotas e telas para registrar rito, processo, procedimento, mora, verificação de RJ, credores e mandatos, e o painel "Ações" da ficha mostrando as pendências de cada transição. Hoje esses registros existem no banco e no seed; a ficha ainda usa a troca de status simples, que o banco valida.
    - Importação de carteira e arquivo de recall.
    - Enriquecimento com `dado_enriquecido`.
    - Distribuição v2.
    - App de campo (PWA).
    - Pátios e dossiê de evidências.
    - Integração com o DataJud.

### Fase 2b — Plano A: comercial e credor

- Contratos por credor (honorários, SLA, despesas).
- Faturamento com glosa, NFS-e e conciliação.
- Repasses com aprovação e PIX.
- Portal do Credor (RLS por credor), webhooks assinados e relatórios bancários com os KPIs da seção 1.
- Saída: o credor acompanha a carteira e baixa o dossiê sem falar com a central.

### Fase 3a — Plano B: aquisição

- Captação:
  - formulário embutível + API pública de leads, para o site da ReCredita;
  - WhatsApp e parceiros;
  - evidência de origem automática e aviso de privacidade (base legal: procedimentos preliminares a pedido do titular, LGPD art. 7º, V);
  - colisão automática.
- Due diligence guiada (veículo + vendedor + RJ/falência), gerando o dossiê de boa-fé.
- Calculadora de oferta com cenários, oferta e assinatura, procuração.
- Negociação com o credor: saldo, desconto, anuência e boleto. Convênios de quitação.
- Fechamento simultâneo, com agenda e checklist.
- Quitação, gravame, RENAJUD, ATPV-e e transferência com prazo; `podeTransferir` ampliado.
- PLD/FT.
- Portal do Vendedor e Portal de Parceiros.
- Saída: jornada B até "Transferido", com todas as guardas provadas por teste.

### Fase 3b — Plano B: estoque, revenda e capital

- Estoque: custo acumulado e recondicionamento.
- Revenda B2C/B2B: NF-e, garantia e arrependimento.
- Funding e resultado por operação: capital alocado, TIR e giro.
- Comissões de parceiros.

### Fase 4 — Inteligência e prontidão SaaS

- CAMILA real em todos os pontos acima.
- BI: coortes por safra, aging e curva de recuperação. Automações por regra.
- LGPD completo: pedidos do titular, RIPD/LIA e comunicação de incidente em 3 dias úteis (Res. CD/ANPD 15/2024).
- Segurança para homologação bancária (Res. CMN 4.893/2021): MFA, logs, backup/PITR e resposta a incidente.
- Onboarding de novos tenants.

---

## 6. Verificação

- **Em todo PR:** `pnpm turbo run lint typecheck test build`.
- **Invariantes** (Vitest, Postgres) — os casos de fronteira, mais:
  - transição inválida é recusada;
  - recall bloqueia a retomada;
  - extrajudicial sem mandato ou sem prova de mora é recusado;
  - resistência força o rito judicial;
  - RJ suspende a retomada;
  - `podeTransferir` ampliado;
  - muralha A→B, inclusive em leilão;
  - RLS: o credor só vê a própria carteira, tenants ficam isolados e o vendedor só vê a própria venda;
  - auditor não escreve;
  - tabelas append-only recusam UPDATE e DELETE.
- **Regressão da migração (Fase 0):** a mesma bateria de chamadas contra a API antiga e a nova, comparando status e corpo.
- **Imagem de produção:** o CI sobe a imagem como no Cloud Run (dono sem superusuário, login da API só com o papel da aplicação) e roda as jornadas contra ela.
- **Estabilidade:** com cada tela parada, o React não renderiza. Um laço de renderização passa por qualquer teste funcional e congela a página quando cai dentro de um clique — já aconteceu na lista de casos.
- **E2E (Playwright):**
  - Jornada A: importar → enriquecer com base legal → distribuir → diligência no PWA → remoção com vistoria → pátio → entrega → fatura → o credor baixa o dossiê.
  - Jornada B: lead → colisão → due diligence → oferta → anuência → fechamento → transferência barrada até a baixa do gravame → estoque → venda.
- **Visual:**
  - Rodar `pnpm dev` e percorrer cada tela no navegador: 1440px na central e no portal, 390px no PWA.
  - Comparar com capturas da versão anterior para confirmar a identidade de cor.
  - axe para contraste e foco; Lighthouse PWA no app de campo.

## Fontes consultadas

- [STF tem maioria para validar busca e apreensão extrajudicial — ConJur, 29/06/2025](https://conjur.com.br/2025-jun-29/stf-tem-maioria-para-validar-busca-e-apreensao-extrajudicial/)
- [A Lei 14.711/23 e a busca e apreensão extrajudicial de bens móveis — Migalhas](https://www.migalhas.com.br/coluna/cpc-na-pratica/399636/a-lei-14-711-23-e-a-busca-e-apreensao-extrajudicial-de-bens-moveis)
- [API Pública do DataJud — CNJ](https://www.cnj.jus.br/sistemas/datajud/api-publica/)
