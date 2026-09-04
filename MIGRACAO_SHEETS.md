# Migração Toastrack: Supabase → Google Sheets + Drive

> Decidido com o Carlos em **2026-08-26**. Motivo: o free tier do Supabase só permite 2 projetos
> ativos e o Toastrack foi pausado. A arquitetura a repetir é a do **TravelTrack**
> (`C:\Claude\TravelTrack`), já em produção com o mesmo padrão.
>
> Este documento é o plano. O estado do que já foi feito continua no `MEMORIA.md`.

---

## 1. Arquitetura alvo

```
navegador → rotas de API do Next.js (Vercel) → Apps Script (Web App) → Planilha / Drive
```

Igual ao TravelTrack, incluindo o motivo de existir a camada do meio: o `SHARED_SECRET` é a
única coisa que protege a planilha (o Web App é publicado como "Qualquer pessoa"), então ele
**tem que ficar no servidor**. É por isso que o app sai do GitHub Pages (static export) e vai
pro Vercel — no bundle do cliente, o segredo seria lido por qualquer um no DevTools.

**Referências no TravelTrack** (ler antes de implementar cada parte):
- `apps-script/Codigo.gs` — API genérica de tabela (`read`, `append`, `updateById`,
  `updateManyById`, `deleteById`, `deleteByField`) + verbos de Drive; `LockService` serializando
  leitura+escrita; `abaValida()` limitando as abas acessíveis.
- `src/lib/sheets/client.ts` — `callAppsScript()` com 3 tentativas (o Google às vezes devolve
  HTML com HTTP 200; por isso as ações do script são idempotentes).
- `src/lib/offline/` — `db.ts` (IndexedDB via `idb`), `sync.ts` (pull + outbox de escritas),
  `useOfflineData.ts` (hooks que leem do cache e atualizam em segundo plano).
- `README.md` seções 1-3 — o passo a passo de publicar o Web App e criar o primeiro admin.

## 2. O que NÃO precisa ser resgatado do Supabase

O projeto pausado não bloqueia nada:

- **Lookups**: os 40 países (com URL de bandeira flagcdn) e os 129 estilos BJCP estão em
  `supabase/migrations/0002_seed.sql`, versionado aqui. As abas `ListPais` e `ListBjcp` são
  geradas a partir dele.
- **Itens**: os ~3600 reais nunca chegaram a ser importados — vivem na planilha do Carlos, que
  agora **é** o banco. O que existia no Supabase eram 9 itens de exemplo e a conta de teste.
- **Contas**: a `tt1` era descartável (e o login já falhava). Usuários serão recriados.

## 3. Modelo de dados (abas da planilha)

A planilha real do Carlos (levantada em 2026-08-26, ajustada por ele e reconferida em
2026-08-27 — ver seção 3.1) já chega bem perto deste formato. O trabalho é ajuste, não
reconstrução do zero.

O motor de acesso genérico (`Codigo.gs`, ver seção 3.2) espera uma coluna chamada **literalmente
`id`** nas 4 abas de item — é assim que `atualizarPorId`/`excluirPorId` localizam a linha, no
TravelTrack e aqui. `beer_id`/`wine_id`/`dest_id`/`drink_id` já foram renomeados para `id` — as
demais colunas mantêm os prefixos que já tinham (`beer_nome`, `wine_cor`, ...). A aba `user`
**não precisa** desse rename: como não passa por `updateById`/`deleteById` (usa
`updateByField`/campo natural), fica com `user_id` como está. O mesmo vale pra `log`.

**Os nomes das abas em `ESTRUTURA` (`Codigo.gs`) têm que ser os nomes reais da planilha.** Isso já
causou um incidente (ver seção 3.2): usar `Users`/`ListPais`/`ListBjcp`/`AccessLog` (nomes que eu
inventei) em vez de `user`/`list_pais`/`list_bjcp_21`/`log` (os nomes reais) fez o
`ensureStructure` criar 4 abas novas vazias, paralelas às de verdade, sem avisar de erro nenhum —
Google Sheets casa nome de aba ignorando maiúscula/minúscula, mas não ignora palavra diferente
(plural vs singular, com/sem underscore). Corrigido; ver checklist de limpeza na seção 3.2.

Colunas extras que existem na planilha e não aparecem na lista abaixo (`bjcp15_id`,
`beer_img_nome_calc`, `beer_macro`, `beer_img_bkp`, `beer_produtor`, `user_id` (nas 4 abas de
item — substituído por `user_owner`), `wine_address`, `dest_address`, `drink_address`, `user_pwd`,
`user_img`, `user_pwd_changed_at`) **não precisam ser apagadas** — o motor genérico ignora o que
não usa; só as marcadas com ⭐ precisam ser criadas.

| Aba real | Colunas (⭐ = nova a criar) |
| --- | --- |
| `user` | user_id, user_nome, user_mail, user_status, user_role, user_idioma, user_paleta, user_modo, user_url_img, senha_hash⭐, deve_trocar_senha⭐, convite_token⭐, convite_expira_em⭐ |
| `beer` | id, **user_owner**, **user_access**, **user_edit**, beer_nome, beer_cervejaria, pais_id, beer_ibu, beer_abv, beer_nota, beer_estilo_livre, bjcp21_id, beer_data, beer_img_nome, beer_img_url, updated_at |
| `wine` | id, **user_owner**, **user_access**, **user_edit**, wine_nome, wine_safra, wine_cor, wine_tipo, wine_produtor, pais_id, wine_regiao, wine_uva, wine_abv, wine_nota, wine_data_degustacao, wine_img_nome, wine_img_url, updated_at |
| `dest` | id, **user_owner**, **user_access**, **user_edit**, dest_nome, dest_safra, dest_cor, dest_tipo, dest_produtor, pais_id, dest_regiao, dest_abv, dest_nota, dest_data_degustacao, dest_img_nome, dest_img_url, updated_at |
| `drink` | id, **user_owner**, **user_access**, **user_edit**, drink_nome, drink_safra, drink_cor, drink_tipo, drink_produtor, pais_id, drink_regiao, drink_abv, drink_nota, drink_data_degustacao, drink_img_nome, drink_img_url, updated_at |
| `list_pais` | pais_id, pais_nome, pais_img (já ok, sem mudança) |
| `list_bjcp_21` | bjcp21_id, bjcp21_cod (+ os campos descritivos que a planilha já tem — mantidos, não usados pelo app hoje) |
| `log` | log_id, log_data, user_id, user_mail, acao, tabela, registro_id, detalhe (aba real reaproveitada como está — só append+read, não precisa de `id` literal) |
| `SyncMeta`⭐ | chave, valor — carimbo `updated_at` por aba de item (ver seção 5). **Aba nova**, nome deliberadamente diferente de `meta` (a aba de anotações pessoais do Carlos — intocável, ver 3.2) |

**`user_owner`** (decisão final, 2026-08-27 — o Carlos voltou atrás numa decisão do mesmo dia que
tinha abolido o dono): um único id, dono do item. Nome genérico, igual nas 4 abas — diferente do
`beer_owner`/`wine_owner` do rascunho anterior, que ficaram como sobra sem uso. Junto dele, duas
listas de ids separados por `;`: **`user_access`** (leitura, além do dono) e **`user_edit`**
(leitura **e** edição/exclusão, além do dono). Isso substitui o `relac` original (a aba de
relacionamento entre usuários, que tinha uma referência órfã a um `user_id` inexistente —
resolvida abandonando o modelo, não o `user_owner` em si).

**`dest`/`drink` ganham `cor`/`tipo`/`safra`** (decisão 2026-08-26) — isso **substitui** a decisão
de 10/jul no Supabase que tinha removido esses campos por serem "decorativos" e mantido só
`dest_tipo` como enum de bebida.

Decisões do schema Supabase que continuam valendo: `wine_cor` com `Rosé`, usuário nasce ativo.

### 3.1 Levantamento da planilha real (2026-08-26, reconferido 2026-08-27)

19 abas ao todo; as relevantes pro app:

- **`beer`**: 3591 linhas reais (cresceu desde o primeiro levantamento). `id`/`user_access`/
  `user_edit`/`updated_at` já criadas. **`beer_cervejaria`** é o nome real do campo de produtor
  (não `beer_produtor` como eu tinha assumido na primeira leitura) — confirmado com o Carlos.
  Sobra sem uso: `bjcp15_id`, `beer_img_nome_calc`, `beer_macro`, `beer_img_bkp`, `beer_owner`
  (não existe mais conceito de dono — ver seção 3).
- **`wine`**: 76 linhas reais. `id`/`user_access`/`user_edit`/`updated_at` já criadas; aqui o
  campo de produtor manteve o nome original `wine_produtor`. Sobra: `wine_address`, `wine_owner`.
- **`dest`/`drink`**: **dados fictícios** — as linhas de cada uma são cópia das linhas do `wine`
  (mesmo nome, nota, data). Os *nomes* das colunas estão ok e vão para o schema; os *valores* não
  entram na carga — ainda não existem destilados/drinks reais catalogados.
- **`user`**: 3 linhas reais, intactas — o "zero linhas" visto em 2026-08-27 era outra aba
  (`Users`, criada por engano por um nome errado em `ESTRUTURA`, ver 3.2), não perda de dado.
  Senhas em formatos não reaproveitáveis — dois hashes de 64 hex (não é o `scrypt salt:hash` do
  padrão novo) e uma senha em texto puro (linha de teste). **Nenhuma senha é migrada** — ver 4.1.
- **`relac`**: abandonada (ver `user_access`/`user_edit` acima). Tinha uma referência a
  `user_id=6` inexistente na aba `user`.
- **`list_pais`** (40) e **`list_bjcp_21`** (129): utilizáveis como estão.
- **`log`** (59 linhas): reaproveitada como aba real de log de acesso — ver tabela acima.
- **`meta`** (138 linhas): anotações pessoais do Carlos (o brief original do projeto) — **não é**
  a aba de sincronização do app; ver incidente na seção 3.2.
- Abas do protótipo antigo sem uso no app real: `home`, `menu`, `lib_main`, `lib`,
  `list_bjcp_15`, `list_prod`, `estilos_esquecidos` — não entram na migração.

### 3.2 Incidente: nomes de aba errados no `ensureStructure` (2026-08-27)

A primeira versão de `Codigo.gs` usava `Users`/`ListPais`/`ListBjcp`/`AccessLog`/`Meta` como
chaves de `ESTRUTURA` — nomes que eu inventei em vez de usar os reais da planilha
(`user`/`list_pais`/`list_bjcp_21`/`log`, e nenhuma aba de sync existia ainda). Rodar
`ensureStructure` contra isso:

- Criou **4 abas novas vazias** (`Users`, `ListPais`, `ListBjcp`, `AccessLog`), paralelas às
  reais — sem erro nenhum, porque `getSheet` cria a aba se não encontra pelo nome. Foi isso que
  fez a primeira leitura de "Users" parecer que os 3 usuários reais tinham sumido — não sumiram,
  estavam (e continuam) em `user`.
- Acrescentou as colunas `chave`/`valor` **na aba `meta` real** (as anotações pessoais do
  Carlos), porque `Meta` (maiúsculo) casou com `meta` (Sheets ignora caixa) — a aba de
  sincronização do app precisava de um nome que não colidisse.

**Corrigido em `Codigo.gs`**: todas as chaves de `ESTRUTURA` agora são os nomes reais, e a aba de
sincronização se chama `SyncMeta` (nunca `meta`/`Meta`).

**Limpeza pendente na planilha** (baixa prioridade, não bloqueia a etapa 2):
- Apagar as 4 abas vazias `Users`, `ListPais`, `ListBjcp`, `AccessLog`.
- As 2 colunas extras `chave`/`valor` no fim da aba `meta` são inofensivas (vazias, não
  atrapalham as anotações) — apagar se quiser deixar limpo, não é obrigatório.
- `beer_owner`/`wine_owner` viraram sobra sem uso (decisão 2026-08-27: sem coluna de dono, ver
  seção 3) — podem ficar ou ser apagadas, tanto faz.

## 4. Segurança: o que era RLS vira código

Este é o ponto de maior risco da migração. Hoje o Postgres recusa o que não é seu; o Sheets não
recusa nada. **Cada política das migrations vira checagem explícita numa rota de API**, e um
esquecimento aqui é vazamento de dado, não bug de tela.

`user_owner` (id único) mais duas listas de ids em cada linha: `user_access` (leitura, além do
dono) e `user_edit` (leitura + edição/exclusão, além do dono) — ver seção 3.

| Política hoje (`0001`/`0003`) | Onde reimplementar |
| --- | --- |
| Item: SELECT se dono **ou** seguidor via `relac` | Rota de listagem: `sessão.id === user_owner` OU `sessão.id ∈ user_access` OU `sessão.id ∈ user_edit` (split por `;`) |
| Item: INSERT/UPDATE/DELETE só do dono | UPDATE/DELETE: `sessão.id === user_owner` OU `sessão.id ∈ user_edit`. INSERT: `user_owner` sempre = id da sessão, **nunca** do corpo da requisição |
| `user`: lê/edita só a própria linha | Rota de perfil |
| `log`: só admin lê | Rota de log (aba real `log`, ver seção 3.1) |
| Trigger `guard_user_privileges` (sem auto-promoção) | Rota de admin: recusar mudança de `user_role`/`user_status` se a sessão não for admin |
| Storage: escrita só na própria pasta | Rota de upload: montar o caminho do Drive a partir do id da **sessão**, nunca do corpo da requisição |

Regra geral: **nada de `user_owner` vindo do cliente**. Sempre da sessão. `user_access`/
`user_edit` também não são aceitos soltos vindo do corpo da requisição sem antes conferir que
quem está editando essa lista é o dono ou já está em `user_edit`.

### 4.1 Senha (padrão do WebCRM, decidido 2026-08-26)

Nenhuma senha da planilha atual é migrada — formatos incompatíveis e um caso em texto puro (linha
de teste). Repete o esquema de `C:\Claude\WebCRM\backend\src\authCrypto.ts`, que não depende de
pacote externo (evita módulo nativo pra compilar, mesmo raciocínio do projeto original):

- **Hash**: `scrypt` nativo do `node:crypto`, formato `salt:hash` em hex (`hashPassword`/
  `verifyPassword`). Comparação por `timingSafeEqual`.
- **Criação de usuário** (só admin, sem cadastro público — decisão da seção 8): gera uma **senha
  provisória legível** (`generateProvisionalPassword`, 12 caracteres, sem `0/O`, `1/l/I`),
  mostrada uma única vez pro admin. `deve_trocar_senha = true` na criação.
- **Primeiro login**: tela de troca obrigatória antes de liberar o app, como o
  `TrocarSenhaPage`/fluxo `mustChangePassword` do WebCRM.
- **Convite alternativo**: `convite_token` + `convite_expira_em` para um link de "definir senha"
  quando o admin não quiser passar a provisória diretamente — mesmo padrão do WebCRM
  (`GET /convite/:token`, `POST /convite/:token/definir-senha`), opcional pra primeira versão.
- **Reset pelo admin**: rota equivalente a `PUT /api/usuarios/:id/senha` — define senha nova e
  força `deve_trocar_senha = true` de novo.

## 5. Cache (a pergunta do Carlos)

Sim, e o TravelTrack já tem o motor pronto em `src/lib/offline/`. Adaptações para o volume maior:

1. **Carga inicial paginada.** ~3600 linhas × ~14 colunas ≈ 1,5 MB de JSON. O `read` do
   TravelTrack devolve a aba inteira; aqui vale um `readRange` (offset/limit, 500-1000 por vez)
   pra não depender de uma resposta gigante. Primeiro login: alguns segundos. Depois: instantâneo,
   servido do IndexedDB.
2. **Carimbo de versão por aba** (aba `Meta`). Ao abrir, o cliente faz **uma** chamada minúscula
   perguntando o carimbo; igual ao que ele tem, não baixa nada. É isso que torna o segundo login
   em diante barato.
3. **Delta.** Com `updated_at` por linha e uma ação `readSince(ts)`, o script varre a aba do lado
   dele (um `getValues`) e devolve só o que mudou — KBs em vez de MBs.

Escritas seguem o padrão do TravelTrack: outbox no IndexedDB + UI otimista.

**Fotos nunca em massa.** Carregar sob demanda e guardar em IndexedDB só as últimas vistas
(padrão `anexoFiles`/`tripImages`). Baixar 3600 fotos num primeiro login estoura cota do Drive e
o armazenamento do navegador.

## 6. Imagens no Drive

**Uma pasta raiz por categoria** (decisão 2026-08-27, `DRIVE_ROOT_FOLDERS` em `Config.gs`) — cada
categoria pode viver em lugar diferente do Drive, ao contrário de uma raiz única com subpastas.
Dentro de cada uma, uma subpasta por usuário — espelhando o que a migration `0004_storage.sql`
fazia no Storage, só que com 4 raízes em vez de 1:

```
<raiz BEER>/<user_id>/<arquivo>
<raiz WINE>/<user_id>/<arquivo>
<raiz DEST>/<user_id>/<arquivo>
<raiz DRINK>/<user_id>/<arquivo>
```

As ~3600 fotos **já estão no Drive do Carlos** com URL, o que elimina a etapa de upload em massa:
basta guardar o `img_file_id` (ou a URL) na linha. Como no TravelTrack, o Apps Script confere que
o arquivo está dentro da pasta esperada antes de baixar ou excluir — sem isso, saber o `fileId`
bastaria pra mexer em qualquer arquivo do Drive da conta.

## 6.1 Etapa 1 concluída (2026-08-26): Apps Script + módulo de senha

Arquivos criados (nenhum arquivo do TravelTrack ou do WebCRM foi alterado — só lidos como
referência):

- `apps-script/Codigo.gs` — motor genérico (`read`/`readSince`/`append`/`updateById`/
  `updateManyById`/`updateByField`/`deleteById`/`deleteByField`) + `ensureStructure` com a
  `ESTRUTURA` da seção 3 + verbos de Drive (`driveUploadFile`/`driveListFiles`/`driveDeleteFile`/
  `driveDownloadFile`) usando uma pasta raiz **por categoria** (`{raiz da categoria}/{user_id}/`,
  ver seção 6). Ganhou dois pontos que o TravelTrack não tinha, pro volume maior daqui:
  `readSince(tab, desde)` (sync incremental) e a aba `SyncMeta` sendo tocada (`tocarMeta`) a cada
  escrita numa das 4 abas de item — é a base do "cache que fica rápido depois do primeiro login"
  (seção 5).
- `apps-script/Config.gs` / `apps-script/appsscript.json` — mesmo formato do TravelTrack, valores
  a preencher (segredo, os 4 ids de pasta do Drive em `DRIVE_ROOT_FOLDERS`).
- `src/lib/authCrypto.ts` — port do `authCrypto.ts` do WebCRM (`scrypt` nativo, sem dependência
  externa). Testado por `npm run test:auth-crypto` (5 casos).

### Checklist da planilha/Drive — status em 2026-08-27

O Carlos já fez o checklist inteiro (renomear `id`, criar as colunas novas, publicar, preencher
o Drive, `testeAutorizacao`, implantar). Confirmado por `curl` direto na URL `/exec`: `ensureStructure`
roda, `beer`/`wine` têm dados reais acessíveis, tudo bate — **exceto** que a primeira versão do
`Codigo.gs` usava nomes de aba errados (ver incidente na seção 3.2), corrigido depois. Falta:

1. **Republicar** o `Codigo.gs` corrigido (nomes de aba reais, `SyncMeta` em vez de `Meta`, sem
   coluna de dono) — colar no editor e **Implantar → Gerenciar implantações → editar → Nova
   versão** (a URL `/exec` não muda).
2. Rodar `ensureStructure` de novo pra confirmar que `SyncMeta` nasce limpo e nenhuma aba nova
   indevida é criada.
3. Limpeza opcional na planilha, sem urgência (ver seção 3.2): apagar as 4 abas vazias
   `Users`/`ListPais`/`ListBjcp`/`AccessLog`; as 2 colunas `chave`/`valor` que sobraram em `meta`
   e `beer_owner`/`wine_owner` são inofensivas — pode deixar ou apagar, tanto faz.

## 7. Sequência de trabalho

1. ✅ **Planilha + Apps Script** (ver 6.1) — feito e conferido (`ensureStructure` limpo, dados
   reais acessíveis).
2. ✅ **Camada de dados no Next** (2026-08-27): `src/lib/sheets/` — `client.ts` (`callAppsScript`,
   `server-only`), `types.ts`, `permissions.ts` (`user_owner`/`user_access`/`user_edit`, 7 testes
   puros), `items.ts` (repositório genérico das 4 abas, permissão em toda operação), `users.ts`
   (senha via `authCrypto.ts`), `lookups.ts`, `log.ts`. Testado de ponta a ponta contra a planilha
   real (`npm run test:sheets-integration`, 9/9, sem deixar rastro nas 3591 cervejas reais). As
   telas ainda não mudaram — é só a biblioteca, pronta pra ser consumida pelas rotas da etapa 4.
3. ✅ **Auth** (2026-08-27): NextAuth v5 (Credentials + JWT) sobre a aba `user` — `src/auth.ts`
   (rate limit de 10 tentativas/10min por e-mail+IP, `src/lib/rateLimit.ts` portado do
   TravelTrack), `src/app/api/auth/[...nextauth]/route.ts`, `src/types/next-auth.d.ts`.
   `scripts/create-admin.mjs` cria o primeiro usuário reaproveitando `createUser` (senha
   provisória, sem cadastro público — decisão já fechada na seção 8). Testado de ponta a ponta
   contra a planilha real (`npm run test:users-integration`, 6/6: criação, login, troca de senha,
   reset por admin, e-mail duplicado recusado — sem deixar rastro na aba `user` real).

   **Efeito colateral esperado**: a rota de auth forçou tirar `output: "export"` do
   `next.config.ts` agora (rota de API não existe em static export) — `basePath`/
   `images.unoptimized` saíram junto. O workflow do GitHub Pages foi **pausado** (gatilho de push
   removido, só `workflow_dispatch` manual) pra não passar a falhar em vermelho a cada commit; o
   site publicado continua servindo a última versão boa (Supabase) até o passo 7 aposentar de vez.

   **Pendência anotada no código** (`src/auth.ts`, TODO): sessão é JWT, então trocar a senha no
   meio de uma sessão não atualiza `deveTrocarSenha` sozinho — a rota de troca de senha (etapa 4)
   precisa chamar `update()` do lado do cliente pra isso refletir sem exigir logout/login.
4. ✅ **Rotas de API** (2026-08-28): `src/lib/apiHelpers.ts` (`requireSession`/`requireAdmin`,
   porte do `api-helpers.ts` do TravelTrack) + 12 rotas — `/api/items/[tipo]` (GET/POST),
   `/api/items/[tipo]/[id]` (GET/PATCH/DELETE), `/api/lookups`, `/api/profile` (GET/PATCH),
   `/api/profile/senha` (POST, valida força da senha — `src/lib/senhaSchema.ts`),
   `/api/admin/users` (GET/POST), `/api/admin/users/[id]` (PATCH), `/api/admin/users/[id]/
   reset-senha` (POST), `/api/admin/log` (GET). Login/troca de senha/mudança de privilégio
   gravam em `log` via `logAccess`. Corpo de requisição validado com `zod`.

   **Testado de ponta a ponta pela HTTP de verdade** (não só chamando as funções direto): subi
   `next dev`, criei conta descartável, fiz login real (CSRF + credentials do NextAuth), e
   exercitei os 12 endpoints com sessão de cookie de verdade — incluindo criar/ler/editar/excluir
   um item real na aba `beer`, trocar senha, promover a admin e confirmar que `/api/admin/*` só
   abre depois de um **re-login** (a sessão JWT antiga não vê o novo `role` sozinha — mesma
   limitação do TODO de `deveTrocarSenha`). 401 sem sessão confirmado nas 5 rotas antes de logar.
   Limpeza confirmada depois: aba `user` de volta às 3 contas reais.

   **Bug real achado e corrigido**: `APPS_SCRIPT_SHARED_SECRET` tem um `$` no meio, e o
   carregador de `.env` do `next dev` (`@next/env`, com `dotenv-expand`) tentava interpretar
   `$ksjds` como referência a outra variável, truncando o segredo — toda chamada ao Apps Script
   falhava com "Segredo inválido" **só quando rodado pelo `next dev`/Vercel**, nunca nos scripts
   `tsx` (que usavam `node --env-file`, sem essa expansão — por isso os testes das etapas 2/3
   nunca pegaram isso). Corrigido escapando `\$` no `.env.local` (confirmado com o pacote real do
   Next, `@next/env`) e criado `scripts/_loadEnv.mjs` pra todo script usar o mesmo carregador do
   app, em vez de `node --env-file` (que não entende esse escape) — elimina essa classe de
   divergência de vez. **No Vercel isso não se aplica**: env var lá é literal, sem parser de
   shell, então o valor colado na env var do Vercel deve ser o `$` puro, sem `\`.

   **Achado de performance**: `getItemIfVisible`/`updateItem`/`deleteItem` leem a aba inteira
   antes de filtrar por id — contra o `beer` real (3591 linhas), cada uma dessas chamadas levou
   **~9-10s** no teste HTTP. Funciona, mas confirma que a etapa 6 (cache) não é opcional pra essa
   aba ficar utilizável; ver seção 5.
5. ✅ **Titularidade dos dados reais** (2026-08-28) — renomeado de "carga dos 3600 itens": não
   existe carga nenhuma nesse sentido (a planilha já É o banco, nunca precisou de import). O que
   faltava era outra coisa, achada ao checar a etapa 4: `user_owner` nas linhas reais de `beer`
   (3591) e `wine` (76) estava preenchido com **e-mail**, não o `user_id` numérico que
   `permissions.ts` compara — ou seja, na prática nenhum item aparecia como visível pra ninguém.
   Achados 4 e-mails distintos como dono; 2 batiam direto com contas reais (`carlosasribeiro@
   gmail.com`→1, `thamirescarv@hotmail.com`→2), 2 não batiam com nenhuma das 3 contas
   (`creebeercervejas@gmail.com`, `carlosasribeiro2@gmail.com`) — perguntado ao Carlos, os dois
   são contas antigas dele mesmo, também viram `user_id 1`. O Carlos corrigiu direto na planilha
   (`user_owner`/`user_access`/`user_edit` das 4 abas de item, todas numéricas agora) — conferido
   por leitura: `beer` e `wine` 100% com dono `1`, `user_access` com `1`/`1;2` (compartilhado com
   a Thamires em parte dos itens), `dest`/`drink` (fictícios) também com `1`.
6. ✅ **Cache** (seção 5, 2026-08-31) — o Carlos reportou o app "impossível de usar" (~18s pra
   abrir a Home/uma lista, medido contra o `beer` real de 3591 linhas: `listVisibleItems` lia a
   aba inteira toda vez). Adicionado `src/lib/offline/` (IndexedDB via `idb`): `db.ts` (stores
   `beer`/`wine`/`dest`/`drink`/`meta`/`outbox`), `sync.ts` (carimbo de versão via `SyncMeta` —
   `/api/items/[tipo]/meta`, barato, não lê a aba de item — e delta via `readSince` quando algo
   mudou), `useOfflineData.ts` (hooks `useOfflineItems`/`useOfflineLookups`). Escrita é otimista:
   `createItemOffline`/`updateItemOffline`/`deleteItemOffline` gravam local na hora e enfileiram
   no outbox, sincronizando em segundo plano — mesmo padrão do TravelTrack
   (`C:\Claude\TravelTrack\src\lib\offline\`), mas **sem outbox de arquivo**: o Toastrack ainda
   não tem upload de imagem implementado (`img_url`/`img_nome` existem nas colunas, nenhuma tela
   usa upload), só campos de texto. `createItem` (servidor) passou a aceitar um `id` opcional no
   payload e reaproveitá-lo — é o que permite um item criado offline manter a mesma referência
   local até sincronizar, em vez do servidor gerar outro uuid.

   `CatalogProvider` (a única fonte dos 4 catálogos) e `ListScreen` (que antes buscava sozinho,
   duplicando o custo) passaram a compartilhar o mesmo cache. **Caveat aceito**: `readSince` nunca
   devolve exclusões (só linhas com `updated_at` mudado) — um item apagado fora do app (edição
   direta na planilha, outro dispositivo) fica "fantasma" no cache local até uma reconciliação
   completa (`refreshAllNow`, ainda sem botão na UI — exclusões pelo próprio app já são tratadas
   na hora, sem depender do delta). Fora de escopo desta rodada: "baixar pra uso offline"/aquecer
   rotas do service worker (modo avião completo, não pedido — o objetivo aqui era só velocidade).

   Testado contra a planilha real (`npm run test:items-sync-integration`, 7/7: carimbo não vazio,
   delta vazio quando nada mudou, `createItem` reaproveita id do cliente, carimbo avança após
   escrita, delta traz só o item novo, delta fica vazio de novo depois — sem deixar rastro no
   `beer` real) e `npm run build` (TypeScript limpo, rota `/api/items/[tipo]/meta` convive sem
   conflito com `/api/items/[tipo]/[id]` — segmento literal sempre vence o dinâmico no Next.js).
7. ✅ **Deploy no Vercel** (2026-09-01) — projeto `cribeirox7i1/toastrack` ligado ao repo do GitHub
   (deploy automático a cada push em `main`, mesmo padrão do TravelTrack), produção em
   `https://toastrack.vercel.app`. Env vars de produção setadas via `vercel env add`:
   `APPS_SCRIPT_URL`, `APPS_SCRIPT_SHARED_SECRET` (colado **sem** o escape `\$` que o
   `.env.local` precisa — na Vercel o valor é literal), `NEXTAUTH_SECRET` (gerado novo, diferente
   do de dev) e `NEXTAUTH_URL=https://toastrack.vercel.app`. Build limpo (`npm run build` do
   próprio Vercel, TypeScript ok, 9 rotas), `curl` confirmou `/` 200 e `/api/lookups` 401 sem
   sessão (rota protegida respondendo). GitHub Pages aposentado: `.github/workflows/deploy.yml`
   removido do repo, e o Carlos desativou o Pages em Settings → Pages do GitHub (2026-09-02) —
   nada mais publica lá.

Etapas 1-4 são pré-requisito de tudo; a 5 é o que o Carlos mais quer.

### 7.1 Ligar as telas ao backend novo (2026-08-28) — não numerada no plano original, mas
necessária pra alguém conseguir usar o app de verdade: todo o `src/components`/`src/lib` que
falava com Supabase foi reescrito pra chamar as rotas de API da etapa 4.

- **Auth**: `AuthProvider.tsx` agora fica por baixo do `SessionProvider` do NextAuth
  (`next-auth/react`), busca o perfil completo via `/api/profile`. `AuthScreen.tsx` perdeu
  cadastro e "esqueci senha" (decisão da seção 8: sem cadastro público) — só login, com um aviso
  pra falar com o admin. **Nova tela**: `TrocarSenhaObrigatoria.tsx`, exibida por `AppShell.tsx`
  quando `deveTrocarSenha` da sessão é `true` (toda conta criada/resetada nasce assim) — chama
  `update()` do NextAuth ao trocar com sucesso, resolvendo o TODO deixado em `src/auth.ts`.
- **Dados de item**: `catalog.ts`/`itemSchema.ts` reescritos pra `fetch` nas rotas
  `/api/items/[tipo]`/`/api/lookups` em vez de `supabase-js`. `Item.id` virou `string` (era
  `number` — os ids agora são UUID, exceto os itens antigos que mantiveram o número original como
  texto). Nome histórico da UI `"spirit"` mantido (só `catalog.ts` traduz pra `"dest"`, o nome
  real da aba — não valia a pena renomear em todas as telas).
- **Permissão na tela**: como não existe mais uma coluna "sou dono desta lista inteira" (o filtro
  já mistura itens próprios com compartilhados), cada `Item` ganhou `canEdit: boolean`
  (`src/lib/itemPermissions.ts`, espelho client-side de `user_owner`/`user_edit` só pra decidir
  o que mostrar — a garantia real continua sendo a rota). `ListScreen` passou a checar por item,
  não mais um flag único pra tela inteira.
- **Perfil/admin**: `prefs.ts`/`admin.ts` reescritos pra `/api/profile`, `/api/profile/senha`,
  `/api/admin/users`, `/api/admin/log`. Idioma passou de `PT/EN/ES` pra `pt/en/es` (minúsculo,
  acompanhando o valor real da planilha).
- **Perfis secundários removidos de fato**: `profiles.ts` agora só devolve `[]` (não existe mais
  "seguir um perfil inteiro" — ver seção 3). A UI já tratava lista vazia como "sem perfil
  secundário", então nenhuma tela precisou de cirurgia — o switcher simplesmente não aparece mais.
- **Removido**: `/admin` (import em massa via CSV/XLSX) — não existe mais "carga" nenhuma (seção
  7, item 5), então o importador Supabase+XLSX client-side não fazia mais sentido. Foram junto
  `src/lib/import.ts`, `src/lib/importParse.ts`, `ImportPanel.tsx`, e as dependências `xlsx`/
  `jszip`/`@supabase/supabase-js` (não usadas em lugar nenhum depois da reescrita).

**Verificação:** `npm run build` limpo (12 rotas + a home, sem erro de tipo), testes de
permissão/senha ainda 100%. **Limite real desta verificação, na época**: o `AppShell` é Client
Component — a decisão splash/login/app só acontece depois da hidratação no navegador, então
`curl` no HTML provava só "o servidor não quebra", não "a tela renderiza certo"; a Browser pane
segue banida pra este projeto (ver `feedback_toastrack_no_browser_pane`). **Resolvido em
2026-09-01**: o Carlos verificou visualmente em produção pela primeira vez desde o início da
migração — ver seção 7.2.

### 7.2 Achados do primeiro uso real em produção (2026-09-01 e 2026-09-02)

Depois do deploy (etapa 7), o Carlos abriu o app de verdade no navegador dele pela primeira vez
desde a migração — todo diagnóstico a seguir foi feito por `curl`/scripts Node contra a planilha
real e a rota de auth de produção, nunca pela Browser pane (banida neste projeto).

- **2026-09-01**: dois bugs de produção achados e corrigidos — login travava até um F5 manual
  (faltava `update()` do `useSession` depois do `signIn`, mesmo padrão de
  `TrocarSenhaObrigatoria.tsx`) e fotos não apareciam em lugar nenhum (`Thumb` nunca teve código
  lendo `img_url` — implementado `driveImageUrl()` convertendo o link "view" do Drive pro link de
  imagem direta `lh3.googleusercontent.com`, e corrigido o Detalhe guardando a foto num state
  próprio em vez de depender de `values`, que só carrega os campos de formulário).
- **2026-09-02**: reportado que a lista de cervejas não rolava pra baixo. Causa: `<main>`
  (`MainApp.tsx`) e os containers de `ListScreen`/Home/Stats/Perfil dentro dele são flexbox
  aninhado sem `min-h-0` — por padrão um item flex tem `min-height: auto` (cresce pelo conteúdo
  em vez de respeitar a altura disponível), então a lista crescia além do `<main>` e o
  `overflow-hidden` dele cortava o final em vez de deixar o `overflow-y-auto` interno rolar.
  Afetava todas as 4 categorias e as outras telas com scroll, não só cervejas — só apareceu ali
  primeiro por ter itens suficientes pra estourar a tela. Corrigido adicionando `min-h-0` em toda
  a cadeia (`<main>`, raiz do `ListScreen`, os wrappers `flex-1 overflow-y-auto`).
- **Reconciliação com botão** (fechando a pendência da etapa 6 — antes só existia a função
  `refreshAllNow`, sem lugar na UI pra chamá-la): card "Sincronização" em `ProfileScreen.tsx` com
  o botão "Atualizar tudo agora" — é o que resolve um item apagado fora do app (edição direta na
  planilha, outro dispositivo) que ficaria "fantasma" no cache local até isso.
- **Upload de foto implementado** (fechava a lacuna documentada na etapa 6: `img_url`/`img_nome`
  sempre existiram, nenhuma tela subia foto nova). O Apps Script já tinha `driveUploadFile`
  pronto desde a etapa 1 (seção 6.1) — faltava só o lado do Next.js:
  - `src/lib/sheets/items.ts` (`uploadItemPhoto`, servidor): confere permissão de escrita
    (mesma checagem de `updateItem`/`deleteItem`, nunca aceita categoria/pasta do corpo da
    requisição), chama `driveUploadFile` com `categoria`/`userId` da sessão, grava o link+nome
    retornados nas colunas `*_img_url`/`*_img_nome` — as mesmas já usadas pelos ~3600 itens
    reais.
  - `POST /api/items/[tipo]/[id]/foto` — rota nova, mesmo padrão de auth/validação (`zod`) das
    outras rotas de item.
  - `src/lib/photoUpload.ts` (cliente): redimensiona (maior lado ≤1600px) e recomprime em JPEG
    via `<canvas>` antes de mandar — uma foto de câmera pode ter 5-10 MB, isso evita estourar
    limite de payload da função serverless. **De propósito sem outbox/offline** (mesmo raciocínio
    já documentado em `sync.ts`): precisa de rede na hora pra saber a URL que o Drive devolveu,
    então falha com mensagem clara se offline em vez de fingir sucesso otimista.
  - `DetailScreen.tsx`: o botão placeholder ("Upload de foto chega com o Storage") virou um
    `<input type="file">` de verdade, desabilitado até o item ser salvo (upload precisa de um id
    de linha real).
  - **Testado de ponta a ponta contra o Drive/planilha reais**
    (`npm run test:photo-upload-integration`, 4/4): sobe um JPEG mínimo de verdade, confirma que
    quem não tem permissão é recusado antes de chamar o Drive, que a URL/nome voltam certos, e
    que a linha da planilha reflete a foto — sempre apagando o arquivo de teste do Drive e o item
    de teste no `finally`.
  - **Não fica pra depois** (fora de escopo desta rodada, aceito): trocar a foto não apaga a
    anterior do Drive — fica órfã lá. Sem outbox de imagem, então continua igual ao caveat já
    documentado na etapa 6.
- **Fotos de vinho não apareciam** (reportado 2026-09-02, depois do upload acima já estar no ar):
  não é bug de código — `driveImageUrl`/`Thumb` são exatamente os mesmos pros dois tipos.
  `scripts/check-photo-sharing.mjs wine` confirmou 0 de 47 fotos publicamente acessíveis (todas
  redirecionam pra login do Google, 302); o mesmo script contra `beer` mostra as fotos reais
  respondendo 200 direto. Causa: as ~3600 fotos de cerveja foram organizadas/compartilhadas antes
  da migração; as 76 de vinho nunca passaram por isso — ficaram sem "Qualquer pessoa com o link".
  Fotos enviadas PELO app (`driveUploadFile`, seção 7.2 acima) já nascem com essa permissão certa
  — o problema é só o acervo antigo. Adicionada `corrigirCompartilhamentoDeFotosAntigas()` em
  `apps-script/Codigo.gs` — **de propósito fora do `api()`/doPost** (tornar um arquivo público a
  partir só de um fileId da rede, sem a checagem de pasta que `arquivoDoUsuario` faz pro resto dos
  verbos de Drive, seria uma superfície de ataque desnecessária no Web App público).

  **Incidente na primeira versão (2026-09-02)**: rodava nas 4 abas na ordem `beer, wine, dest,
  drink` — `beer` tem 3591 fotos, cada uma custando uma chamada ao Drive só pra checar o
  compartilhamento, e como o log só saía no fim de cada aba, a execução **morria no meio do
  `beer`** (limite de 6 min do Apps Script) sem nunca logar nada nem chegar em `wine` — parecia
  travada. Corrigido: a função agora só roda em `wine`/`dest`/`drink` por padrão (`beer` já está
  confirmado público, reprocessar não muda nada) e loga o progresso a cada 10 fotos, não só no
  final — `corrigirCompartilhamentoDeUmaAba('beer')` continua disponível se precisar reconferir.

  **Pendente**: o Carlos precisa colar o `Codigo.gs` atualizado no editor do Apps Script e rodar
  `corrigirCompartilhamentoDeFotosAntigas` manualmente uma vez (mesmo fluxo do `testeAutorizacao`)
  — não tenho como executar Apps Script direto desta máquina. Depois de rodar,
  `npm run check-photo-sharing wine` confirma (deveria virar 47 públicas).

## 8. Decisões

Fechadas com o Carlos em **2026-08-26**:

- **Sem cadastro público.** A tela de signup sai; usuários passam a ser criados só pela área de
  admin, como no TravelTrack (que usa o script `create-admin` para o primeiro deles).
- **`wine_tipo`: `Doce` vira `Suave`** na carga dos dados. O conjunto de valores continua
  `Seco / Semi-Seco / Suave / Brut`, sem valor novo.
- **Colunas**: a planilha real já foi levantada (seção 3.1); o Carlos ajusta o que falta listado
  na seção 3 antes da carga.
- **Permissão de leitura entre usuários**: abandona o modelo `Relac` (seguir um perfil inteiro);
  vira `user_access` por item — ver seção 3.
- **`dest`/`drink` ganham `cor`/`tipo`/`safra`** simétricos ao `wine`, substituindo a decisão
  anterior do Supabase de removê-los como "decorativos" — ver seção 3. Os dados de destilado/drink
  na planilha atual são fictícios; a carga real desses dois tipos fica para quando existirem dados
  de verdade.
- **Senha**: nenhuma é migrada; esquema `scrypt` + senha provisória do WebCRM — ver seção 4.1.

**Resolvido na etapa 7**: `next.config.ts` já não tem `output: 'export'`/`basePath`/
`images.unoptimized` — saíram todos na ida pro Vercel (ver comentário no próprio arquivo).

**Arquivado (2026-09-02, decisão do Carlos)**: 2FA e sessão de 15 dias estavam no plano do
Supabase; não entram na reimplementação com NextAuth. Sem previsão de retomar.

## 8.1 Upload de foto travando (2026-09-03) — diagnóstico e correção

**Sintoma:** anexar foto num item novo de cerveja ficava 2-3 minutos em "Enviando…" e terminava
com "Erro ao enviar a foto." (a mensagem genérica de `photoUpload.ts` quando a rota devolve algo
que não é o JSON esperado — inclusive um 504 da função).

**Como foi medido:** reprodução por HTTP contra `toastrack.vercel.app`, com conta descartável
criada e apagada no próprio teste (nunca pela Browser pane, ver regra do projeto).

- O tamanho do payload **não** é a causa, apesar de uma primeira leitura sugerir isso: 5 KB de
  base64 levaram 11s, 200 KB levaram 9,8s, 250 KB levaram 38s, 350 KB levaram 80s numa rodada e
  10,8s noutra, 500 KB levaram 12,6s e 700 KB, 25,8s. A variação é do lado do Google.
- A mesma chamada pequena ao Apps Script (`createUser`, `createItem`) oscilou entre 5s e 60s em
  momentos diferentes da mesma sessão.
- Leituras concorrentes **não** se atrapalham: um `read` de 17s da aba beer rodou junto com um
  `readById` de 3s sem atrasá-lo.
- Escritas simultâneas **serializam** no `LockService` (todo write pega o mesmo script lock, e
  ainda de novo no `tocarMeta`): 3 `updateById` juntos custaram 11-13s cada, contra 4,2s sozinho.

**Conclusão:** cada ida ao Apps Script é uma loteria de ~3s a ~60s, e a rota `/foto` fazia TRÊS
(`readById` de permissão + `driveUploadFile` + `updateById`), multiplicando por três a chance de
pegar um minuto ruim — com o cliente esperando em silêncio e o `callAppsScript` ainda repetindo
cada chamada até 3x, sem timeout nenhum.

**O que foi feito** (nesta ordem):

1. `photoUpload.ts`: escadinha de compressão com teto de 400 KB de base64 (1600px/0.78 →
   1600/0.62 → 1280/0.68 → 1280/0.55 → 1024/0.55). Antes era 1600px/0.82 **sem teto**, que dá
   600 KB-1 MB numa foto de celular. Mais `AbortSignal.timeout` de 3 min — antes o "Enviando…"
   não tinha fim.
2. `client.ts`: teto de 60s por tentativa (não havia nenhum), configurável por chamada.
3. `items.ts`: `driveUploadFile` passa a ir com `tentativas: 1`. **Ela não é idempotente** —
   repetir cria outra cópia no Drive exatamente no caso que motivou a retentativa (o Google
   responde uma página de erro tendo executado certo). Já a exclusão continua com as
   retentativas padrão, porque mandar pro lixo duas vezes é inofensivo.
4. **Upload em segundo plano** (pedido do Carlos: "enquanto o usuário preenche os demais campos,
   a foto está subindo"): a imagem aparece na hora do `blob:` local, a data sai do EXIF na hora
   (sempre foi leitura local), e o envio segue solto. `save()` espera o upload pendente antes de
   gravar — sem isso criaria uma SEGUNDA linha, já que quem cria a linha do rascunho é o próprio
   upload (`ensureRow`). Por isso `currentId` ganhou um ref: o handler assíncrono que continua
   depois do `ensureRow` ainda enxergaria `null` no closure dele.
5. **Rollback no Cancelar** (`removeItemPhoto` + `DELETE /api/items/[tipo]/[id]/foto`): antes não
   existia nenhum — o arquivo ficava no Drive pra sempre mesmo quando o item nunca era salvo.
   Rascunho cancelado apaga a linha e a foto; item existente devolve a foto anterior nas colunas
   e apaga do Drive a que subiu agora. A limpeza roda solta depois da tela fechar, mas só COMEÇA
   depois do upload terminar (apagar a linha no meio do envio deixaria arquivo órfão). Coberto
   por `npm run test:photo-rollback-integration` (5/5 contra o Drive real).
6. **`itemFotoUpload` no `Codigo.gs`**: sobe pro Drive E grava as colunas de imagem numa execução
   só, no lugar de `driveUploadFile` + `updateById`. A rota passa de três idas ao Apps Script
   para duas. A permissão continua sendo conferida no Next.js — o verbo novo não ganha nenhuma
   autoridade que `updateById` já não tivesse. Exigiu reimplantação manual (feita pelo Carlos em
   2026-09-03, confirmada por script antes de o lado do Next.js passar a usar a ação).

**Depois de tudo, em produção, com o payload máximo de 400 KB: 11,4s / 13,0s / 9,8s.** Três
amostras num minuto bom não provam que os picos sumiram — a oscilação do Google continua lá. O
que mudou é a exposição (duas idas em vez de três, foto menor) e o fato de a tela não esperar
mais por nada disso.

**Fica de fora, aceito:** trocar a foto de um item **salvo** continua deixando a anterior órfã no
Drive (o rollback só cobre a edição cancelada). E se o app for fechado no meio da limpeza do
Cancelar, o arquivo fica lá.

> **Superado pela seção 8.2 abaixo, no mesmo dia**: o upload-em-segundo-plano-com-rollback
> descrito no item 4/5 acima ainda travava a experiência de escolher a foto (o botão ficava
> "Enviando…" tentando gravar as colunas na hora) e, pior, um bug real na compressão fazia
> `onPhotoSelected` falhar direto com "Não foi possível processar essa imagem." em fotos de
> celular grandes. Toda a máquina de rollback (`removeItemPhoto`, `DELETE /foto`,
> `rollbackItemPhoto`, `test:photo-rollback-integration`) foi removida — não ficou código morto,
> porque o redesenho da 8.2 elimina a premissa que a motivava (upload antes do Salvar).

## 8.2 Foto só sobe no Salvar, em segundo plano de verdade (2026-09-03, mesmo dia)

**Bug encontrado ao testar a 8.1 no celular real:** escolher a foto mostrava "Enviando…" por um
tempo e terminava em "Não foi possível processar essa imagem." — ANTES de qualquer chamada de
rede. Causa: `compressToJpegBase64` lia o arquivo inteiro como string base64 (`readAsDataURL`) e
decodificava num `<img>`, mantendo arquivo + string base64 + bitmap decodificado na memória ao
mesmo tempo — numa foto de câmera de 10+ MB, em celular com pouca RAM, isso bastava pra a aba
matar a decodificação. Agravante: a escadinha de compressão da 8.1 desistia inteira no primeiro
degrau que falhasse, mesmo havendo tamanhos menores (mais leves) ainda não tentados.

**Pedido do Carlos, que virou o redesenho:**
> A. escolho a foto na galeria; B. Aplicação mostra a foto no controle de imagem, sem subir,
> localmente; C. Processa EXIF em background; D. Preencho os dados e salvo; E. Aplicação volta
> pra listagem mostrando o item na lista, e sobe a foto em background.

**O que mudou:**

1. `photoUpload.ts`: `compressToJpegBase64` agora usa `createImageBitmap(file)` (decodifica direto
   do `Blob`, sem string base64 intermediária), com fallback via `<img>`/`FileReader` só pra
   WebView muito antigo. Cada degrau da escadinha é tentado de forma independente (try/catch por
   degrau) — um tamanho falhando não derruba os menores ainda não tentados.
2. **Escolher a foto não sobe mais nada.** `onPhotoSelected` só guarda o `File` e mostra um
   preview local (`URL.createObjectURL`) — sem rede, sem `ensureRow`, sem criar linha nenhuma. O
   EXIF continua sendo lido na hora (é leitura local, sempre foi rápida).
3. **O upload só começa no Salvar**, e roda solto: `queuePhotoUpload(type, id, file)` em
   `photoUpload.ts` é fire-and-forget — dispara o upload e devolve na hora, sem o chamador esperar
   nada. Vive num Map a nível de módulo (`emCurso`), então sobrevive a `DetailScreen` desmontando.
4. **`save()` chama `onClose()` na hora**, sem esperar a foto — volta pra lista imediatamente,
   como pedido. A lista já reflete o item (o cache local é atualizado direto por
   `applyServerPatch` dentro de `uploadItemPhoto`, sem precisar de nenhuma tela aberta).
5. **Cancelar virou trivial**: como nada sobe antes do Salvar, cancelar é só descartar o `File`
   local e revogar o preview — não existe mais chamada nenhuma ao servidor pra desfazer. Toda a
   maquinaria de rollback da 8.1 (seção anterior) foi removida por ficar sem uso.
6. **`GlobalPhotoToast.tsx`** (novo, montado em `MainApp.tsx`, nunca desmonta entre telas): como o
   Salvar não espera mais o upload, o toast local de `DetailScreen` já não existe quando o
   resultado chega. Um `EventTarget` módulo (`photoUploadEvents`) avisa sucesso/erro pra esse
   toast global, onde quer que o usuário esteja quando o upload terminar.
7. Reabrir o MESMO item enquanto o upload de uma edição anterior ainda está em curso
   (`getPendingPhotoUpload`) mostra "Enviando…" e atualiza a foto quando o upload responder, em
   vez de mostrar a foto velha até a próxima sincronização.

**Fica de fora, aceito** (mesma lista de antes, ainda válida): trocar a foto de um item salvo
deixa a anterior órfã no Drive. Novo, específico deste redesenho: se o item for EXCLUÍDO da lista
enquanto o upload da foto dele ainda está em curso, o upload pode terminar tentando gravar numa
linha que já não existe mais (`itemFotoUpload` falha com "Linha não encontrada") — o arquivo fica
órfão no Drive. Não há outbox pra foto offline: se `save()` acontecer sem internet, o upload falha
na hora com uma mensagem clara ("Sem conexão"), sem fila de tentar de novo depois — mesma postura
já documentada pra fotos desde a etapa 6 (upload precisa de rede pra saber a URL do Drive).

**Não verificado neste ambiente**: o bug de compressão só reproduz em celular real com memória
limitada — o Node não tem `<canvas>`/`createImageBitmap`, então não dá pra escrever um teste
automatizado pra ele aqui. Precisa de confirmação do Carlos no aparelho dele.

## 8.3 A compressão foi pro momento da escolha (2026-09-04)

**Sintoma:** anexar foto funcionava no desktop e falhava no celular com "Não foi possível
processar essa imagem." - o mesmo erro da 8.2, que aquele redesenho deveria ter resolvido. O
Carlos já tinha limpado o histórico do navegador, desinstalado e reinstalado o app: não era cache
velho (confirmado também por `curl` nos bundles de produção, que já traziam o código da 8.2).

**Por que 8.1 e 8.2 não pegaram:** as duas mexeram em *como* comprimir (degraus independentes,
`createImageBitmap` em vez de `readAsDataURL`) sem mexer em *quando*. A compressão continuava
acontecendo dentro do envio, disparado pelo Salvar - longe da tela, sem nada visível, e num
momento em que o usuário já não podia reagir.

**As três causas estruturais, agora resolvidas:**

1. **Decodificação em resolução plena.** `createImageBitmap(file)` sem opções decodifica o bitmap
   inteiro - ~48 MB de RGBA numa foto de 12 MP - e só depois o canvas reduzia. Agora a redução
   acontece *durante* a decodificação (`resizeWidth`/`resizeHeight`), então o full-res nunca
   existe. Isso exige saber as dimensões antes: `readJpegSize` (`src/lib/imageDecode.ts`) lê do
   cabeçalho JPEG (marcadores SOF) sem tocar nos pixels, no mesmo estilo do parser de EXIF que já
   existia em `photoDate.ts`. Formato sem dimensões legíveis (PNG/WebP/HEIC) cai na decodificação
   plena, como antes.
2. **`canvas.toDataURL` era o passo mais caro** e é síncrono: monta uma string base64 de vários MB
   de uma vez na thread principal. Trocado por `toBlob`/`OffscreenCanvas.convertToBlob`, que é
   assíncrono e devolve bytes; a conversão pra base64 acontece uma vez só, no fim.
3. **Preview e envio usavam decodificadores diferentes** - o `<img>` do preview e o canvas do
   envio - e podiam discordar. Era isso que produzia o par de sintomas aparentemente
   contraditório do primeiro relato ("a foto não aparece" *e* "o item salva mas a foto não sobe").

**A mudança central é de momento, não de algoritmo:** `preparePhoto` roda **na hora de escolher a
foto** e produz o JPEG final; o preview exibido é esse JPEG. Com isso o preview vira uma
**garantia** - se a foto aparece na tela, ela vai subir, porque é o mesmo arquivo já pronto na
memória esperando só a rede. E a falha, quando acontece, aparece com a tela aberta e "Escolher
outra" a um toque, em vez de depois do Salvar num toast com o usuário já de volta na lista.

Nada disso viola o pedido da 8.2: preparar é 100% local (não sobe nada), e o envio continua
começando só no Salvar, em segundo plano, sem a tela esperar. O Salvar até ficou mais leve - a
essa altura resta só a requisição, sem CPU nenhuma. A única espera nova é trivial: se o Salvar for
tocado enquanto a compressão ainda roda (~1s), a tela pede pra esperar em vez de salvar sem foto.

**Junto disso:**

- **HEIC/HEIF reconhecido.** É o palpite mais provável pro caso do Carlos, se o aparelho for
  iPhone: nenhum navegador de Android/desktop decodifica HEIC, o que derruba preview *e*
  compressão de uma vez. Agora a mensagem diz o que fazer (Ajustes › Câmera › Formatos › Mais
  Compatível) em vez de "não foi possível processar".
- **Envio do arquivo cru como último recurso**: se a recompressão falhar mas o arquivo já for
  pequeno (≤ ~2,2 MB) e de formato que o app exibe depois (JPEG/PNG/WebP), ele sobe como está.
  Melhor uma foto maior no Drive do que um cadastro sem foto.
- **Laudo de diagnóstico** (`formatDiagnostics`): o erro na tela ganhou um botão "Detalhes" com
  tipo/tamanho do arquivo, capacidades do navegador e a etapa exata que falhou. Sem Browser pane
  neste projeto (ver `feedback_toastrack_no_browser_pane`) e sem console num celular, um print
  disso é o único caminho de diagnóstico - foi a falta dele que fez esta ser a terceira rodada.

**Verificação:** `npm run test:image-decode` (9/9, cabeçalhos JPEG montados byte a byte - inclusive
SOF2 progressivo e o DHT `0xc4` que não pode ser confundido com SOF), `tsc` e `npm run build`
limpos, testes puros anteriores verdes. Deploy confirmado em produção por `curl` no bundle.
**Não verificável daqui**: decodificação e canvas não existem no Node, e o bug só reproduz em
celular - a confirmação depende do aparelho do Carlos.

### 8.3.1 A causa raiz, achada pelo laudo (2026-09-04, mesmo dia)

O laudo pagou-se na primeira tentativa. Anexando um print de tela no celular, ele mostrou:

```
arquivo: 1000613887.jpg
tipo: image/jpeg · 2581 KB
navegador: createImageBitmap=sim · OffscreenCanvas=sim · toBlob=sim
· decode: cabeçalho sem dimensões (não é JPEG?) - decodificando pleno
· decode: createImageBitmap recusou o arquivo (InvalidStateError: The source image could not be decoded.)
· decode: todos os caminhos falharam (o navegador não decodificou este formato)
```

A primeira leitura foi "o arquivo não é um JPEG de verdade, apesar do nome e do MIME". Errada: o
Carlos testou em seguida com **fotos tiradas na hora pela câmera** e deu o mesmo. Arquivo de
origem e formato diferentes falhando igual só deixa uma explicação de pé: **os bytes não estavam
chegando**, e nenhum decodificador tem o que fazer com um arquivo vazio.

> **Atenção: a causa apontada nesta seção estava ERRADA.** A correção descrita aqui foi ao ar,
> não resolveu, e a causa real só apareceu na 8.3.2 logo abaixo. O texto fica como registro do
> raciocínio (e do erro), mas quem quer entender o bug deve ler direto a 8.3.2.

**A hipótese era uma linha em `onPhotoSelected`, presente desde o commit que criou o upload de
foto (`9cbfd66`) e nunca tocada pelas rodadas 8.1, 8.2 e 8.3:**

```js
const file = e.target.files?.[0];
e.target.value = "";  // "permite escolher o mesmo arquivo de novo depois"
```

No Android o `File` devolvido pelo seletor é respaldado por um URI `content://`. Limpar o `value`
do input libera esse respaldo: o objeto `File` continua existindo, com nome e tamanho corretos,
mas todo acesso ao conteúdo devolve vazio. No desktop o `File` aponta pra um arquivo real no
disco e sobrevive à limpeza - **é exatamente por isso que o bug só existia no celular**.

Isso explica, de uma vez, tudo que vinha sendo tratado como sintomas separados: qualquer formato
falhando, qualquer origem falhando, e o preview `blob:` que "não mostrava a foto assim que
selecionada" no relato de 2026-09-04 pela manhã (um object URL de um `File` sem conteúdo não
carrega).

**Correção**: quem limpa o input agora é `pickPhoto`, **antes** de abrir o seletor - reescolher a
mesma foto continua funcionando (que era o motivo original da linha), sem nunca invalidar o
arquivo recebido.

**Lição, mais importante que a correção**: 8.1 e 8.2 falharam porque foram atrás da hipótese mais
plausível (compressão pesada demais pra um celular) em vez de medir. As duas produziram código
melhor e nenhuma tocou na causa. O que resolveu foi a instrumentação da 8.3 - o laudo na tela -,
e ela custou menos que qualquer uma das duas tentativas anteriores. **Diante de um bug que só
acontece num ambiente que não dá pra inspecionar, o primeiro passo é sempre fazer o ambiente
falar, nunca adivinhar o que ele diria.**

**Fica no código**: o pipeline da 8.3 (compressão na escolha, preview como garantia, laudo) não é
desfeito - ele continua valendo por si, e foi o que revelou a causa. O sniff de assinatura por
bytes (`sniffFormat`) também fica: HEIC de iPhone e RAW são recusas legítimas que agora têm
mensagem própria, ainda que não fossem o caso aqui.

**Verificação**: `test:image-decode` passou a 17 testes (somando a assinatura por bytes: JPEG,
HEIF/HEIC, AVIF, PNG, WebP, GIF, TIFF/RAW, arquivo zerado e bytes desconhecidos), `tsc`, lint e
build limpos. A confirmação final continua sendo do aparelho do Carlos - e, se ainda falhar, o
laudo agora distingue "arquivo vazio" de "formato não suportado", que era a ambiguidade que
sobrava.

### 8.3.2 A causa raiz de verdade: a leitura acontecia fora do tick do evento (2026-09-04)

**Resolvido.** O Carlos confirmou: "agora o seletor principal funciona".

Depois da correção errada da 8.3.1, o quadro ficou: falha idêntica no navegador comum, no PWA
instalado e em aba anônima do mesmo aparelho, com qualquer origem de arquivo (print de tela,
foto recém-tirada) e qualquer formato. Isso eliminou cache, service worker e o app instalado, e
deixou de pé só uma explicação: o Android entregava um `File` com nome e tamanho corretos e
**nenhum byte legível dentro**.

**A causa**: a primeira leitura do arquivo só acontecia depois de um `await`.

```js
const file = e.target.files?.[0];
...
const dataDaFoto = await applyPhotoDate(file);  // primeiro await: devolve o controle ao navegador
const resultado = await preparePhoto(file);     // aqui o File já não tinha mais conteúdo
```

No Android o `File` que o seletor devolve é respaldado por um URI `content://`, e a permissão de
leitura desse URI pode acabar assim que o handler do evento de seleção devolve o controle ao
navegador. Todo `await` antes da primeira leitura devolve o controle. No desktop o `File` aponta
pra um arquivo real no disco e não depende de permissão nenhuma, que é **por que o bug só existia
no celular** - e por que ele sobreviveu a quatro rodadas de correção testadas no desktop.

**A correção** é uma linha, na posição certa: disparar a leitura como primeira instrução do
handler, sem `await`, e passar a promessa adiante.

```js
const file = e.target.files?.[0];
if (!file) return;
const leituraIniciada = lerBytes(file);   // ainda dentro do tick do evento
```

O EXIF passou a sair desses mesmos bytes, em vez de uma segunda leitura do `File` - que era
justamente a operação que falhava.

**O que mais ficou desta caçada, e vale manter:**

- **`lerBytes`** tenta cinco caminhos de leitura em ordem (`Blob.arrayBuffer`, `FileReader`,
  objectURL+fetch, `Blob.stream`, `slice+arrayBuffer`) e registra qual venceu. Não foi o que
  resolveu, mas é rede de segurança real e o laudo fica mais informativo.
- **Três portas de entrada** no `DetailScreen`: "Adicionar foto" (Photo Picker), "Tirar foto"
  (`capture`, sem passar por provider de mídia) e "Buscar em Arquivos" (sem `accept`, abre o
  gerenciador de documentos). Entraram como contorno; ficam porque "Tirar foto" é o fluxo natural
  de quem está cadastrando a bebida na hora.
- **Trabalhar sobre os bytes, nunca sobre o `File`**: depois da leitura, o pipeline monta um Blob
  a partir dos bytes em memória. Decodificação, preview e envio saem todos dele, sem vínculo
  nenhum com o `content://`.
- **`sniffFormat`**: identifica o formato pelos bytes (HEIF/HEIC, AVIF, TIFF/RAW, vazio...),
  porque nome e MIME vêm do provider do Android e mentem. Não era o caso aqui, mas HEIC de iPhone
  é uma recusa legítima que agora tem mensagem própria.
- **Selo de versão** no rodapé do Perfil (`src/lib/version.ts`, pedido do Carlos): sequencial
  legível + SHA do commit injetado pelo Vercel + hora do build. Nasceu porque uma rodada inteira
  foi gasta em dúvida sobre se o aparelho estava com a versão nova.

**A lição, agora com o desfecho:** o laudo de diagnóstico da 8.3 foi o que quebrou o impasse, mas
não sozinho - ele deu o fato ("o arquivo chega vazio") e ainda assim a primeira leitura desse fato
gerou uma causa errada (8.3.1). O que fechou o caso foram os testes que o Carlos fez a pedido e
que **eliminaram** hipóteses: outra origem de foto, navegador comum, aba anônima. Instrumentar
diz o que está acontecendo; são os testes de eliminação que dizem o porquê. Vale pedir os dois.

## 9. O que se perde e o que se ganha

**Perde:** RLS (a segurança passa a depender de código nosso), transações, integridade
referencial, e a identidade técnica separada (o Apps Script roda na conta pessoal do Carlos —
trocar de conta quebra o app). Cotas do Apps Script passam a ser um limite real.

**Ganha:** custo zero e estável (sem limite de 2 projetos), as fotos ficam onde já estão, e a
planilha continua editável à mão — que é como o Carlos já trabalha com esses dados hoje.

**Não muda:** todas as telas (Home, listas nos 3 modos, detalhe/edição, stats, perfil), o sistema
de tema OKLCH e o PWA. É a camada de dados que é trocada por baixo.
