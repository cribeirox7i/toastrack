# MEMÓRIA — Toastrack

> Documento de continuidade do projeto. Última atualização: **2026-07-10**.
> Objetivo: qualquer um (ou o Claude numa nova sessão) consegue retomar o trabalho lendo só este arquivo + os specs em `Handoff/`.

---

## 1. O que é o Toastrack

App mobile-first de **registro de degustação** (cervejas, vinhos, drinks e destilados) — *"Seu aplicativo completo de Sommelieria"*. O usuário registra bebidas que provou, avalia (0–5 estrelas, passo 0,5), e navega a coleção em 3 modos (deck / tabela / galeria). Tem stats por categoria e uma camada social leve: **perfis secundários** — seguir outros usuários (via tabela `relac`) e navegar a coleção deles em **modo somente-leitura**.

**Stack:** Next.js 16 + React 19 + TypeScript + Tailwind v4, **static export** hospedado no **GitHub Pages**, falando **direto com o Supabase** (Auth + Postgres + Storage). Sem backend próprio — a segurança é feita por **RLS** (Row Level Security) no banco.

**Coordenadas:**
- Código: `C:\Claude\Toastrack` (a pasta `Handoff/` guarda os specs de referência — não apagar).
- Repo GitHub previsto: https://github.com/cribeirox7i/toastrack
- Supabase: projeto `ngcsfrhxivipkabsised` — https://supabase.com/dashboard/project/ngcsfrhxivipkabsised
- URL de deploy prevista: https://cribeirox7i.github.io/toastrack

**Referências (ler antes de implementar telas):**
- `Handoff/README.md` — walkthrough de UI/UX de todas as telas e estados.
- `Handoff/TECHNICAL_SPEC.md` — spec do backend, schema e mapeamento de campos.
- `Handoff/Toastrack.dc.html` — protótipo interativo (abrir no navegador). Contas de teste: `admin@toastrack.com` (perfil rico, segue os outros 5), senha qualquer, 2FA sempre `482913`.
- `Handoff/screenshots/` — capturas de referência.

---

## 2. Decisões fechadas com o Carlos (2026-07-10)

Estas resolveram as questões em aberto do handoff — **já estão aplicadas no schema**:

1. **Drinks e Destilados:** removidos os tags decorativos do protótipo (`category`=cor tipo Âmbar/Dourado, `wineType`=estilo tipo Envelhecido/Reposado). Drink fica **sem** cor/estilo. **Destilado MANTÉM `dest_tipo`** (enum: Cachaça, Vodka, Gin, Whisky, Rum, Tequila, Brandy, Pisco, Shochu, Saque, Vermute, Bitter) — campo do schema, distinto dos tags do protótipo.
2. **Novo usuário nasce ATIVO** (`user_status='S'`). Sem gate de ativação manual no signup. O status `'N'` e a tela "inactive" existem só para o admin desativar alguém manualmente.
3. **`user_id` é `NOT NULL`** nas 4 tabelas (beer/wine/dest/drink) — importação sem dono falha na hora em vez de esconder itens silenciosamente.
4. **Ordem das colunas do `dest`** conforme a aba limpa que o Carlos colou (dest_tipo mantido, dest_abv antes de dest_nota, um único user_id).
5. **Admin = coluna na tabela `user`** (`user_role` enum admin/user). Todos os usuários ficam na tabela `user`; sem allow-list externa de e-mails.

---

## 3. Estado atual — o que JÁ está pronto

### 3.1 Scaffold Next.js ✅
- `create-next-app` (Next 16.2.10, React 19.2.4, Tailwind v4, TS, ESLint, App Router, `src/`, alias `@/*`).
- `next.config.ts` configurado para **static export** (`output:'export'`), `images.unoptimized`, `trailingSlash`, e `basePath:'/toastrack'` **só em produção** (dev fica na raiz). Base path controlável por `NEXT_PUBLIC_BASE_PATH`.
- `.gitignore` ajustado pra versionar `.env.example` mas ignorar `.env.local`.
- `npm run build` passa limpo (TS ok, export gerado em `out/`).

### 3.2 Supabase — cliente e conexão ✅
- `src/lib/supabase/client.ts` — cliente browser singleton, `persistSession`+`autoRefreshToken` (base pra sessão de 15 dias), falha alto se faltar env var.
- `.env.local` (git-ignorado) já criado com a URL (`https://ngcsfrhxivipkabsised.supabase.co`, **sem** `/rest/v1/`) + a **anon key** real. Conectividade testada OK.
- `.env.example` documenta as variáveis.

### 3.3 Migration do banco ✅ — **JÁ RODOU no Supabase**
- Arquivo: `supabase/migrations/0001_init.sql`.
- Verificado via REST: as **9 tabelas** existem (`user`, `relac`, `beer`, `wine`, `dest`, `drink`, `list_pais`, `list_bjcp_21`, `access_log`) + RPCs.
- Conteúdo: enums, tabelas com as 5 decisões acima, FKs, `user_id NOT NULL`, e **RLS completo**:
  - Item (beer/wine/dest/drink): **SELECT** se dono OU seguidor via `relac`; **INSERT/UPDATE/DELETE** só se dono.
  - `user`: lê/edita só a própria linha.
  - `relac`: read-only onde você é o seguidor.
  - `access_log`: só admin lê; insert via RPC.
  - RPCs `SECURITY DEFINER`: `can_view_owner`, `followed_profiles` (expõe só nome+avatar dos seguidos), `log_access` (carimba `auth.uid()`), `is_admin`.
  - Trigger `handle_new_user` cria a linha em `public."user"` quando um auth user faz signup.
- ⚠️ **Rodar só uma vez** (usa `create type`/`create table` sem `if not exists`). Pra recomeçar do zero, precisa de um script de `drop` antes.

### 3.4 PWA ✅
- `public/manifest.webmanifest` (standalone, theme verde, ícones).
- `public/sw.js` (service worker: network-first pra navegação, cache-first pra assets).
- `public/icons/` — PNGs 192/512/maskable (quadrado verde com "T").
- `public/.nojekyll` (essencial pro GitHub Pages servir `_next/`).
- `src/components/ServiceWorkerRegister.tsx` registra o SW (só em produção).

### 3.5 Sistema de tema OKLCH ✅ (passo 1)
- `src/app/globals.css` — **um único `--hue`** + fórmulas OKLCH; as 7 paletas só rotacionam o matiz. Light/dark por `data-mode`. Tokens expostos ao Tailwind via `@theme` (utilities: `bg-bg`, `bg-surface`, `text-text`, `text-muted`, `border-border`, `bg-accent`, `bg-accent-soft`, `text-danger`, `text-on-accent`).
- `src/lib/theme.ts` — `HUES`, `PALETTES` (ordem: Verde, Vermelho, Amarelo, Azul, Roxo, Rosa, Laranja; com label PT e o valor do enum `user_paleta` pro sync), mapeamentos enum↔hue, e o script anti-FOUC.
- `src/components/ThemeProvider.tsx` — `useTheme()`, aplica `data-hue`/`data-mode` no `<html>`, persiste em `localStorage` (`tt.hue`/`tt.mode`). **Falta:** sincronizar com `user_paleta`/`user_modo` do Supabase quando o auth existir.
- `src/components/ThemeShowcase.tsx` — página placeholder atual (`src/app/page.tsx` renderiza ela): vitrine live das 7 paletas + toggle claro/escuro + amostras de UI. Reaproveitar como base do switcher no Perfil.
- **Verificado:** trocando pra Azul+Escuro, tokens recomputam certo (`--hue:245`, `--bg: oklch(17% .012 245)`, etc.).

### 3.6 Deploy ✅ (config pronta, ainda não publicado)
- `.github/workflows/deploy.yml` — build + publish no GitHub Pages. **Requer secrets** no repo: `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

---

### 3.7 Auth real ✅ (2FA adiado)
- **Feito:** login/senha, signup e "esqueci a senha" ligados ao **Supabase Auth ao vivo**; gate de conta inativa (`user_status='N'`); registro no `access_log` (login/logout via RPC).
- Arquivos: `src/lib/auth.ts` (validação de senha, `fetchAppUser`, `logAccess`), `src/lib/utils.ts` (`initialsFor`), `src/components/AuthProvider.tsx` (`useAuth`: sessão + perfil), `src/components/auth/AuthScreen.tsx` (telas login/signup/forgot com os tokens de tema), `src/components/AppShell.tsx` (roteador: splash → auth → inativo → app logado; `page.tsx` renderiza ele).
- **Verificado ao vivo (ponta a ponta, 2026-07-13):** signup → trigger cria `public.user` ativo (`user_status='S'`, role user, defaults de paleta/modo) → confirmação de e-mail → **login pelo formulário do app** entra na tela logada (nome+e-mail carregados do banco) → **logout** volta ao login. RLS confere (usuário lê o próprio perfil e as próprias listas). Build verde. Conta usada: `carlosasribeiro+tt1@gmail.com` / `Test123!@#` (pode deletar).
- ✅ **Confirmação de e-mail: MANTIDA LIGADA** (decisão do Carlos, 2026-07-13). Signup não retorna sessão e manda e-mail de confirmação; o usuário precisa clicar no link antes de logar. A UI já trata (mostra "confirme seu e-mail").
- **Usuário de teste criado:** `carlosasribeiro+tt1@gmail.com` (não-confirmado) — pode deletar no dashboard.
- **Falta na auth:** confirmar o green-path de login (bloqueado na confirmação de e-mail); página de **reset de senha** (recebe o recovery token); **2FA por e-mail + sessão 15 dias que pula 2FA**; **sync de prefs** (carregar/salvar `user_paleta`/`user_modo`/`user_idioma`).
- **Nota:** as contas do protótipo (`admin@toastrack.com` etc.) **não existem** como usuários reais — criar de verdade. RELAC (perfis secundários) precisa de linhas inseridas manualmente com os `user_id` reais.

### 3.8 Seed dos lookups ✅ (rodado no Supabase 2026-07-13)
- `supabase/migrations/0002_seed.sql` (idempotente). Verificado ao vivo: **40 países** em `list_pais` (com URLs de bandeira flagcdn, ex. `https://flagcdn.com/br.svg`; Escócia/Inglaterra usam `gb-sct`/`gb-eng`) e **129 estilos** em `list_bjcp_21`.
- **Reshape da `list_bjcp_21` (decisão Carlos):** agora tem 2 campos — `bjcp21_id` (numérico identity, a CHAVE que `beer.bjcp21_id` referencia) + `bjcp21_cod` (texto, rótulo completo tipo "01A - American Light Lager", "21B - Specialty IPA: Rye IPA", "999 - Bebida Mista"). A coluna `bjcp21_subestilo` do 0001 foi **removida** (conteúdo dobrado no cod). Códigos repetem (vários 21B/27A) — unicidade é no `bjcp21_cod` completo. Inclui X1–X5 (provisórios) e 999 (Bebida Mista).

### 3.9 Home + navegação ✅ (2026-07-13)
- **Navegação (5 abas):** top nav no desktop, bottom bar no mobile — `src/components/app/MainApp.tsx`. Roteia Home/Cervejas/Vinhos/Drinks/Destilados + Perfil (avatar) + Stats. Categorias e Stats ainda são placeholder (próximo passo).
- **Home** (`src/components/app/HomeScreen.tsx`): carrossel "Destaque do dia" (auto 4s, 1 cerveja + 1 vinho + 1 drink/destilado), "Visão geral" (4 cards de contagem → Stats), busca global (nome/fabricante/país/estilo).
- **Camada de dados:** `src/lib/catalog.ts` (`fetchCatalog` lê as 4 tabelas do usuário, normaliza p/ tipo `Item`, com join de país e estilo BJCP) + `src/components/CatalogProvider.tsx` (`useCatalog`).
- **Perfil** (`src/components/app/ProfileScreen.tsx`): avatar, paleta, modo claro/escuro, sair (versão inicial; senha/idioma/admin depois).
- Auxiliares: `src/components/Icon.tsx` (line icons), `src/components/ui.tsx` (`Stars` meia-estrela, `Thumb` listrado, `formatDate`). `ThemeShowcase` removido.
- **Verificado:** build verde + camada de dados testada via REST. **9 itens de exemplo** inseridos na conta de teste (3 cervejas / 2 vinhos / 2 drinks / 2 destilados). Verificação visual no navegador ficou pendente (classificador da Browser pane indisponível na hora).
- ⚠️ **Gotcha de seed via REST:** o Git Bash no Windows corrompe UTF-8 passado como argumento CLI (acentos → 400). Inserir dados com acento via **arquivo UTF-8 + `curl --data-binary @arquivo`**. E o **bulk insert do PostgREST exige as mesmas chaves em todos os objetos** do array (senão 400).

### 3.10 Tela de lista + perfis secundários ✅ (2026-07-14)
- `src/components/app/ListScreen.tsx`: **3 modos** (deck / tabela ordenável / galeria), **busca** com seletor de campo (Todos/Nome/Fabricante/País), **switcher de perfis secundários** (pill + dropdown, só aparece se houver perfis seguidos), **contagem + badge "somente visualização"**, botão **+** e ações **editar/duplicar/excluir** por item — tudo só quando é o próprio perfil.
- Dados: `src/lib/catalog.ts` ganhou `fetchItems` / `deleteItem` / `duplicateItem`; `src/lib/profiles.ts` (`fetchFollowedProfiles` via RPC `followed_profiles`). `MainApp` gerencia `viewedProfileId` + perfis seguidos e renderiza a `ListScreen` nas abas de categoria.
- **Verificado ao vivo:** deck/tabela (ordenação + mostra estilo BJCP)/galeria, busca, **duplicar (3→4)** e **excluir com modal (4→3)** gravando no banco real. Switcher corretamente oculto (conta de teste não segue ninguém).
- **Ainda placeholder:** tocar num item / editar / **+** abrem um toast — o detalhe/edição é o próximo passo.
- **Para ver o switcher em ação** (demo): precisa de um 2º usuário auth confirmado + uma linha na `relac` (INSERT só via SQL editor / service_role, já que o RLS bloqueia escrita do client) + alguns itens desse 2º usuário.

### 3.11 Detalhe / Edição — CRUD completo ✅ (2026-07-14)
- `src/components/app/DetailScreen.tsx`: **visualização** (foto placeholder, ações Google/Compartilhar/Editar/Duplicar/Excluir, campos com país e estilo BJCP resolvidos, tag de ID, badge "somente visualização" para item de outro perfil) + **edição/criação** (formulário por tipo, widget de nota meia-estrela, dropdowns de país e BJCP, selects de enums, data).
- Schema dirigido por `src/lib/itemSchema.ts` (`SCHEMA` por tipo, enums, `fetchLookups`/`fetchFullItem`/`saveItem`); widget em `src/components/app/RatingInput.tsx`. `MainApp` roteia `view='detail'` e passa abrir/editar/criar; tocar item, "Editar" e o botão **+** agora levam aqui.
- **Verificado ao vivo:** ver detalhe, **editar** (nota 4→5 e ABV 5.2→5.5 gravados no banco), **criar** item novo (com `user_id` próprio e data = hoje), selects de **país/BJCP** persistindo, **excluir** pelo detalhe voltando à lista. O CRUD do app está fechado.
- **Ainda placeholder:** upload de foto (abre toast — vem com o Storage).

### 3.12 Stats + Perfil (autosserviço) ✅ (2026-07-14)
- **Stats** (`src/components/app/StatsScreen.tsx`): card-herói com total + média de estrelas, e rankings **Por país** (com bandeira), **Por categoria** e **Por fabricante** (barras proporcionais + "Ver tudo"). Sempre no escopo do próprio usuário.
- **Perfil** (`src/components/app/ProfileScreen.tsx`): **nome de exibição** editável + Salvar; seletor de **idioma** PT/EN/ES (salva a preferência — a tradução dos textos vem no passo de i18n); **paleta** e **modo** agora **sincronizam no Supabase**; **trocar senha** (reautentica com a senha atual e atualiza). Ao logar, a paleta/modo salvos são aplicados (Supabase = fonte da verdade). Plumbing em `src/lib/prefs.ts`.
- **Verificado:** build verde + backend das prefs testado via REST (PATCH 204, leitura confere). Verificação visual ficou pendente (classificador da Browser pane caiu de novo).
- **ADIADO — cards de admin** (gestão de usuários + log de acesso): precisam de política RLS pra admin ver/editar outros usuários e de proteger `user_role`/`user_status` contra auto-edição — ver seção 7.

### 3.13 Admin + correção de segurança ✅ (2026-07-14)
- **Correção de segurança (migration `0003_admin_security.sql`, rodada):** um trigger `guard_user_privileges` rejeita mudança de `user_role`/`user_status` por quem não é admin (permite via SQL editor/service_role pra bootstrap do 1º admin). **Verificado:** antes, o `tt1` (comum) conseguia se auto-promover a admin (PATCH → 204); depois do fix, o mesmo PATCH é **bloqueado** (HTTP 400 com a mensagem do trigger), e as prefs normais seguem funcionando.
- **Acesso de admin:** políticas RLS deixam o admin ler/editar todos os usuários; `src/lib/admin.ts` (`fetchAllUsers`/`setUserStatus`/`fetchAccessLog`).
- **Cards no Perfil** (só se `role === 'admin'`): **Gestão de usuários** (lista + ativar/desativar) e **Log de acesso** (histórico com timestamp + quem). Verificados ao vivo com dados reais.
- **`tt1` foi promovido a admin** (via SQL bootstrap) pra demonstrar. Foot-gun menor: admin pode desativar a si mesmo (sem guard) → lockout; adicionar guard quando útil. Desativar/ativar de verdade precisa de um 2º usuário pra testar com segurança.

## 4. O que FALTA construir

Em ordem sugerida:

1. **Auth — partes restantes** (o básico já está em 3.7):
   - **2FA por e-mail** (protótipo é mock `482913`) — Edge Function + provedor de e-mail (Resend/Postmark).
   - **Sessão de 15 dias**; enquanto válida, **re-login pula o 2FA** (só pede na 1ª vez do device ou após expirar). Rastrear "issued-at" da sessão verificada. (A sessão de 15 dias em si é setting do dashboard: Auth → Sessions.)
   - **Página de reset de senha** que recebe o recovery token do e-mail e deixa definir a nova senha.
   - Reforço server-side da complexidade de senha (política do dashboard / Auth hook). Client-side já feito.
2. **Sync de prefs** — carregar `user_paleta`/`user_modo`/`user_idioma` do Supabase no login e salvar quando o usuário troca (o ThemeProvider já tem os mapeamentos prontos).
3. **Telas restantes** (Home+nav 3.9, Listas 3.10, Detalhe/Edição 3.11 já feitas): **Stats reais** (drill-down: total + média + rankings por país/categoria/fabricante) → completar **Perfil** (idioma, troca de senha, cards admin de gestão de usuários + log).
4. **i18n** — PT/EN/ES (protótipo tem os 3 no objeto `I18N`).
5. **Paginação/infinite scroll** — 60 itens por página + `IntersectionObserver` (margin ~1200px).
6. **Storage** — upload de foto de perfil e de itens (buckets `profile-images` / `item-images`, um folder por `user_id`).

### Lógica de perfis secundários (a feature central — está limpa no protótipo, portar 1:1)
No `Handoff/Toastrack.dc.html`, linhas ~1410–1442: `availableSecondaryProfiles()` (lê `relac`), `selectProfile()` (valida contra relac, reseta filtro), `currentList()` (filtra por perfil visto), `myOwnList()` (sempre o próprio — Home/Stats **ignoram** o perfil secundário), `canEditItem()` (só o dono edita). `viewedProfileId` reseta pra `null` em login e logout.

---

## 5. Como rodar (ambiente)

⚠️ **Node não está no PATH do sistema.** Fica em `C:\Program Files\nodejs\` (v24.18.0, npm 11.16.0). Adicione ao PATH ou prefixe: `$env:Path = "C:\Program Files\nodejs;" + $env:Path`.

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
cd C:\Claude\Toastrack
npm install       # já rodado, mas reinstale se necessário
npm run dev       # dev server em http://localhost:3000
npm run build     # gera o static export em ./out
```

**Notas de ferramenta (pra sessões do Claude):**
- A Browser pane (preview MCP) é escopada ao working dir da sessão (o Drive), **não enxerga** `C:\Claude\Toastrack` pelo `launch.json`. Dá pra navegar por URL (`localhost:3000`) mesmo assim.
- **Screenshot da Browser pane trava com cores OKLCH** — verificar via `read_page` + `javascript_tool` (estilos computados). `computer left_click` por coordenada desalinha no viewport mobile; clique nativo via JS (`.click()`) funciona.

---

## 6. Segurança — lembrete

- A **anon key** (em `.env.local` e nos secrets do GitHub) é **pública por design** — vai no bundle do browser; o RLS é a real proteção. OK expor.
- **Nunca** colocar a **`service_role` key** no frontend, em `.env.local`, ou em qualquer arquivo versionado — ela ignora o RLS. Só no dashboard do Supabase / operações server-side confiáveis.

---

## 7. Questões técnicas ainda em aberto (menores, decidir na hora de implementar)

- **`wine_tipo`**: o enum da spec é `('Seco','Semi-Seco','Suave','Brut')`, mas o seed do protótipo usa `'Doce'`. Reconciliar na importação de dados (mapear ou estender o enum).
- **`wine_cor`**: spec usa `'Rosé'` (com é), protótipo usa `'Rosê'` (com ê). Seguimos a spec.
- **Importação de dados legados**: garantir `user_id` preenchido em toda linha (a spec cita um bug antigo onde a aba WINE veio sem `user_id` e sumiu tudo). O `NOT NULL` já protege contra isso.
- **✅ SEGURANÇA — auto-edição de `user_role`/`user_status`**: RESOLVIDO na migration `0003` (trigger `guard_user_privileges`). Antes, qualquer usuário podia se tornar admin editando a própria linha; agora o trigger bloqueia (verificado ao vivo).
