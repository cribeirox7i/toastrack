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

A planilha real do Carlos (levantada em 2026-08-26, ver seção 3.1) já chega bem perto deste
formato — `pais_id`/`bjcp21_id` já numéricos, `list_pais`/`list_bjcp_21` já populadas e mais
completas que o seed do Supabase. O trabalho é ajuste, não reconstrução do zero.

O motor de acesso genérico (`Codigo.gs`, ver seção 3.2) espera uma coluna chamada **literalmente
`id`** em toda aba — é assim que `atualizarPorId`/`excluirPorId` localizam a linha, no TravelTrack
e aqui. Pra reaproveitar esse motor sem forkar uma versão por tabela, o ajuste na planilha real é
**renomear só a coluna de chave primária** de cada aba de item (`beer_id`→`id`, `wine_id`→`id`,
`dest_id`→`id`, `drink_id`→`id`) — as demais colunas mantêm os prefixos que já têm
(`beer_nome`, `wine_cor`, ...), sem precisar renomear mais nada. O conteúdo da coluna `id` pode
continuar sendo o número atual; itens novos passam a receber um UUID gerado no cliente (padrão
TravelTrack), necessário para o outbox offline da seção 5, que precisa do id antes de confirmar
com o servidor. Toda aba de item ganha `updated_at` (ISO) — viabiliza o sync incremental da seção 5.

Colunas extras que já existem na planilha e não aparecem na lista abaixo (`bjcp15_id`,
`beer_img_nome_calc`, `beer_macro`, `beer_img_bkp`, `wine_address`, `dest_address`,
`drink_address`) **não precisam ser apagadas** — o motor genérico ignora o que não usa; só as
que faltam precisam ser criadas.

| Aba | Colunas (⭐ = coluna nova a criar) |
| --- | --- |
| `Users` | id, nome, email, senha_hash⭐, deve_trocar_senha⭐, convite_token⭐, convite_expira_em⭐, role, ativo (já existem como `user_status`/`user_role` — reaproveitar) |
| `Beer` | id (renomeado de `beer_id`), user_id, **user_access**⭐, beer_nome, beer_produtor, pais_id, beer_ibu, beer_abv, beer_nota, beer_estilo_livre, bjcp21_id, beer_data, beer_img_nome, beer_img_url, **updated_at**⭐ |
| `Wine` | id (renomeado de `wine_id`), user_id, **user_access**⭐, wine_nome, wine_safra, wine_cor, wine_tipo, wine_produtor, pais_id, wine_regiao, wine_uva, wine_abv, wine_nota, wine_data_degustacao, wine_img_nome, wine_img_url, **updated_at**⭐ |
| `Dest` | id (renomeado de `dest_id`), user_id, **user_access**⭐, dest_nome, dest_safra, dest_cor, dest_tipo, dest_produtor, pais_id, dest_regiao, dest_abv, dest_nota, dest_data_degustacao, dest_img_nome, dest_img_url, **updated_at**⭐ |
| `Drink` | id (renomeado de `drink_id`), user_id, **user_access**⭐, drink_nome, drink_safra, drink_cor, drink_tipo, drink_produtor, pais_id, drink_regiao, drink_abv, drink_nota, drink_data_degustacao, drink_img_nome, drink_img_url, **updated_at**⭐ |
| `ListPais` | pais_id, pais_nome, pais_img (já ok, sem mudança) |
| `ListBjcp` | bjcp21_id, bjcp21_cod (+ os campos descritivos que a planilha já tem — mantidos, não usados pelo app hoje, sem mudança) |
| `AccessLog` | id⭐, user_id⭐, acao⭐, quando⭐ (aba nova) |
| `Meta` | chave⭐, valor⭐ — carimbo `updated_at` por aba (ver seção 5; aba nova) |

**`user_access`** (decidido 2026-08-26, substitui `Relac`): lista de ids de usuário separados por
`;` na própria linha do item, com acesso de leitura. Não existe mais uma aba de relacionamento
entre usuários (a `relac` original tinha uma referência órfã a um `user_id` inexistente — resolvida
abandonando o modelo, não corrigindo o dado velho). **Isso muda a feature**: antes era "seguir um
perfil e ver a coleção inteira dele"; agora é "este item específico é visível para esta lista de
usuários". Se a tela de perfis secundários (seção 3.10 do `MEMORIA.md`) for mantida, o filtro por
perfil vira "itens de outro usuário onde meu id está em `user_access`", não mais "todos os itens
de quem eu sigo".

**`Dest`/`Drink` ganham `cor`/`tipo`/`safra`** (decisão 2026-08-26) — isso **substitui** a decisão
de 10/jul no Supabase que tinha removido esses campos por serem "decorativos" e mantido só
`dest_tipo` como enum de bebida. Com a planilha real já trazendo essas colunas preenchidas de
forma simétrica entre os 4 tipos, mantê-las é o caminho mais simples; o enum de bebida
(Cachaça/Vodka/Gin/...), se ainda fizer sentido, vira mais um campo de texto/enum a definir
quando os dados reais de destilado existirem (hoje são fictícios — ver seção 3.1).

Decisões do schema Supabase que continuam valendo: `wine_cor` com `Rosé`, usuário nasce ativo,
`user_id` obrigatório em todo item.

### 3.1 Levantamento da planilha real (2026-08-26)

19 abas ao todo; as relevantes pro app:

- **`beer`**: 3573 linhas reais, colunas já alinhadas ao schema (`pais_id`, `bjcp21_id`
  numéricos). Sobra sem uso: `bjcp15_id`, `beer_img_nome_calc`, `beer_macro`, `beer_img_bkp`.
- **`wine`**: 69 linhas reais. Sobra: `wine_address`.
- **`dest`/`drink`**: **dados fictícios** — as 69 linhas de cada são cópia idêntica das linhas do
  `wine` (mesmo nome, nota, data). Os *nomes* das colunas estão ok e vão para o schema (ver acima);
  os *valores* não entram na carga — ainda não existem destilados/drinks reais catalogados.
- **`user`**: só 3 linhas reais. Senhas em formatos não reaproveitáveis — dois hashes de 64 hex
  (não é o `scrypt salt:hash` do padrão novo) e uma senha em texto puro (linha de teste). **Nenhuma
  senha é migrada** — ver seção 4.1.
- **`relac`**: abandonada (ver `user_access` acima). Tinha uma referência a `user_id=6`
  inexistente na aba `user`.
- **`list_pais`** (40) e **`list_bjcp_21`** (129): utilizáveis como estão.
- Abas do protótipo antigo sem uso no app real: `meta`, `log`, `home`, `menu`, `lib_main`, `lib`,
  `list_bjcp_15`, `list_prod`, `estilos_esquecidos` — não entram na migração.

## 4. Segurança: o que era RLS vira código

Este é o ponto de maior risco da migração. Hoje o Postgres recusa o que não é seu; o Sheets não
recusa nada. **Cada política das migrations vira checagem explícita numa rota de API**, e um
esquecimento aqui é vazamento de dado, não bug de tela.

| Política hoje (`0001`/`0003`) | Onde reimplementar |
| --- | --- |
| Item: SELECT se dono **ou** listado em `user_access` | Rota de listagem: filtrar por `user_id === sessão` OU `sessão.id` presente na lista `user_access` (split por `;`) |
| Item: INSERT/UPDATE/DELETE só do dono | Toda rota de escrita: comparar `user_id` da linha com o da sessão **antes** de gravar (`user_access` nunca dá permissão de escrita, só de leitura) |
| `user`: lê/edita só a própria linha | Rota de perfil |
| `access_log`: só admin lê | Rota de log |
| Trigger `guard_user_privileges` (sem auto-promoção) | Rota de admin: recusar mudança de `role`/`ativo` se a sessão não for admin |
| Storage: escrita só na própria pasta | Rota de upload: montar o caminho do Drive a partir do `user_id` da **sessão**, nunca do corpo da requisição |

Regra geral: **nada de `user_id` vindo do cliente**. Sempre da sessão, como o import atual já faz.

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
  ver seção 6), ajustado em 2026-08-27 a pedido do Carlos — cada categoria pode viver em lugar
  diferente do Drive, em vez de uma raiz única com subpastas. Ganhou dois pontos que o TravelTrack
  não tinha, pro volume maior daqui: `readSince(tab, desde)` (sync incremental) e a aba `Meta`
  sendo tocada (`tocarMeta`) a cada escrita numa das 4 abas de item — é a base do "cache que fica
  rápido depois do primeiro login" (seção 5).
- `apps-script/Config.gs` / `apps-script/appsscript.json` — mesmo formato do TravelTrack, valores
  a preencher (segredo, os 4 ids de pasta do Drive em `DRIVE_ROOT_FOLDERS`).
- `src/lib/authCrypto.ts` — port do `authCrypto.ts` do WebCRM (`scrypt` nativo, sem dependência
  externa). Testado por `npm run test:auth-crypto` (5 casos).

### O que falta você fazer na planilha e no Drive antes da etapa 2

1. **Renomear a coluna de chave primária** em cada uma das 4 abas de item: `beer_id`→`id`,
   `wine_id`→`id`, `dest_id`→`id`, `drink_id`→`id`. Só essa coluna — o resto continua com prefixo.
2. **Criar as colunas novas** listadas com ⭐ na tabela da seção 3 (`user_access` e `updated_at`
   em cada uma das 4 abas de item; os 4 campos novos em `Users`). Pode deixar em branco — o
   `ensureStructure` do passo 5 confere que existem, mas não preenche valor.
3. **Publicar o Apps Script**: Extensões → Apps Script na planilha, colar `Codigo.gs`, criar um
   arquivo `Config` com o conteúdo de `Config.gs`, colar `appsscript.json` no manifesto (mostrar
   via ⚙️ → "Mostrar arquivo de manifesto"). Gerar um segredo aleatório
   (`openssl rand -base64 32`) e colocar em `SHARED_SECRET`.
4. **Pastas do Drive**: criar (ou escolher) uma pasta raiz **por categoria** (Beer/Wine/Dest/
   Drink — podem ficar em lugares diferentes do Drive), pegar o ID de cada uma (trecho depois de
   `/folders/` na URL) e preencher os 4 valores de `DRIVE_ROOT_FOLDERS` em `Config.gs`.
5. Rodar `testeAutorizacao` pelo editor (autoriza planilha + Drive) e implantar como **App da
   Web** (Executar como "Eu", Acesso "Qualquer pessoa") — copiar a URL `/exec`.
6. Chamar a ação `ensureStructure` uma vez (pelo próprio editor, ou já pela rota de setup do
   Next.js quando ela existir na etapa 2) para confirmar que todas as abas/colunas batem.

## 7. Sequência de trabalho

1. ✅ **Planilha + Apps Script** (ver 6.1) — código escrito; publicar/rodar fica com o Carlos
   (passos numerados acima).
2. **Camada de dados no Next**: `src/lib/sheets/` (client + repositórios por aba), substituindo
   `src/lib/supabase/`. As telas não mudam nesta etapa.
3. **Auth**: NextAuth v5 (Credentials + JWT) sobre a aba `Users`, com bcrypt; script
   `create-admin` como no TravelTrack (não há cadastro público hoje no Toastrack — decidir se
   mantém o signup aberto).
4. **Rotas de API** com as checagens da seção 4.
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
