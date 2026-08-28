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
4. **Rotas de API** com as checagens da seção 4, consumindo `src/lib/sheets/`.
5. **Carga dos 3600 itens**: mapear a planilha existente do Carlos para as colunas da seção 3.
6. **Cache** (seção 5) — depois que os dados reais estiverem lá, que é quando dá pra medir.
7. **Deploy no Vercel** + variáveis de ambiente; aposentar o GitHub Pages.

Etapas 1-4 são pré-requisito de tudo; a 5 é o que o Carlos mais quer; a 6 só faz sentido com
volume real medido.

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

Ainda em aberto:

- **2FA e sessão de 15 dias**: estavam no plano do Supabase; com NextAuth muda a implementação.
- **`next.config.ts`**: hoje tem `output: 'export'`, `basePath: '/toastrack'` e
  `images.unoptimized` — tudo isso sai na ida pro Vercel.

## 9. O que se perde e o que se ganha

**Perde:** RLS (a segurança passa a depender de código nosso), transações, integridade
referencial, e a identidade técnica separada (o Apps Script roda na conta pessoal do Carlos —
trocar de conta quebra o app). Cotas do Apps Script passam a ser um limite real.

**Ganha:** custo zero e estável (sem limite de 2 projetos), as fotos ficam onde já estão, e a
planilha continua editável à mão — que é como o Carlos já trabalha com esses dados hoje.

**Não muda:** todas as telas (Home, listas nos 3 modos, detalhe/edição, stats, perfil), o sistema
de tema OKLCH e o PWA. É a camada de dados que é trocada por baixo.
