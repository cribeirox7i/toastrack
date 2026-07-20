# Technical Spec — Toastrack

*"Seu aplicativo completo de Sommelieria"* — a personal tasting-log app for beers, wines, drinks (cocktails) and spirits.

This is the authoritative technical spec, as directed by the product owner, that Claude Code should implement against. Read this together with `README.md` (UI/UX walkthrough of the interactive prototype) and `Toastrack.dc.html` (the prototype itself).

**Reconciliation note:** the prototype uses simplified field names (`ownerId`, `category`, `rating`, `tastingDate`, etc.) as stand-ins for the real Supabase columns below. See "Field mapping" at the end for the exact prototype-field → real-column correspondence, and the open item flagged for the product owner before implementation.

---

## A. General

1. **Project / system name:** Toastrack
2. **Slogan:** "Seu aplicativo completo de Sommelieria"
3. **Local source folder:** `C:\Claude\Toastrack`
4. **GitHub repository:** https://github.com/cribeirox7i/toastrack
5. **Supabase project:** https://supabase.com/dashboard/project/ngcsfrhxivipkabsised

## B. Technical decisions

1. **Frontend:** TypeScript, React, Next.js, Tailwind CSS.
2. **Backend:** none as a separate server — **decided with the product owner: no dedicated Rust backend.** The Next.js frontend talks directly to Supabase (Auth, Postgres via the Supabase client SDK, and Storage) using Supabase's built-in Row Level Security (RLS) policies to enforce access control at the database layer instead of a custom API tier. *(GitHub Pages only serves static files and cannot run a server process — a Rust backend would have needed separate hosting; removing it avoids that entirely and keeps the whole stack on GitHub Pages + Supabase, both free/low-cost.)*
3. **Hosting (front — and the only hosting needed, since there's no separate backend):** GitHub Pages. Next.js must be built with **static export** (`output: 'export'` in `next.config.js`) since GitHub Pages can't run the Next.js server runtime (no SSR/API routes/middleware) — every page must be statically pre-rendered or client-rendered, and all data access happens client-side via the Supabase JS SDK.
   - **Installable PWA:** ship a `manifest.webmanifest` (name, icons, `display: standalone`, theme/background colors matching the palette) plus a registered service worker (`sw.js`), and the matching `<link rel="manifest">`/icon tags in the document head. Without these, mobile browsers only offer "add shortcut" instead of a real installable app — this was confirmed as a real gap in the first deploy and must be part of the initial build, not an afterthought.
   - **List pagination / infinite scroll:** each category list should page data (e.g. 60 items per fetch) and use an `IntersectionObserver` with a generous root margin (~1200px) to prefetch the next page well before the user visually reaches the end, so scrolling stays smooth. Because Supabase queries are direct Postgres round-trips (not a per-call scripting runtime), this alone should already be materially faster than the original Google Sheets-backed plan — but keep the prefetch margin generous regardless, since perceived scroll smoothness also depends on network latency, not just query speed.
4. **Database:** Supabase (Postgres). See table-by-table schema in section E below — translated from the product owner's original Google-Sheets-shaped spec into proper relational tables (with real foreign keys, enums, and RLS policies) rather than literal spreadsheet tabs.
5. **Image storage (profile photos, general app images, and per-user item photos):** Supabase Storage. Recommended bucket layout: a `profile-images` bucket (or a folder per user within one `avatars` bucket) for profile photos/general assets, and an `item-images` bucket with one folder per user (named by `user_id`) for beer/wine/drink/spirit photos — mirrors the "segregated per user" requirement from the earlier Drive-based spec, now done via Storage path prefixes + RLS-style Storage policies instead of literal Drive folders.

## C. Security & Access

1. Login screen: e-mail + password, with a show/hide toggle on the password field (prototype already implements this as an SVG eye/eye-off icon).
2. Minimum password complexity: 8 characters, 1 uppercase, 1 lowercase, 1 number, 1 special character. *(Matches the prototype's `validatePassword` regex: `/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/`.)* Enforce this both client-side (immediate feedback) and, since Supabase Auth's own password rules are more permissive by default, via a Supabase Auth hook/Edge Function that rejects weaker passwords server-side too.
3. Two-factor authentication via an e-mailed token, required at login — implement via Supabase Auth's built-in **email OTP** (one-time password) flow, or a custom Edge Function that generates a code, stores it (short TTL) and sends it via a transactional e-mail provider (e.g. Resend, Postmark) if finer control over the e-mail template is wanted than Supabase's default template.
4. Self-service "Criar Conta" (signup) — Supabase Auth signup, immediately followed by the same 2FA step for consistency.
5. "Esqueci Minha Senha" (forgot password) — Supabase Auth's built-in password-reset e-mail flow.
6. Every user has a status field: active / inactive (`user_status`). New/self-signed-up accounts should be considered inactive until explicitly activated — there is no in-app activation screen; this is done directly against the `user` table (e.g. via the Supabase dashboard or a trusted internal tool) by the product owner. *(Carried over from the prior spec's requirement; confirm if still wanted — the current paste doesn't explicitly restate "novos usuários entram inativos", so double-check this is still intended for Toastrack before implementing the gate.)*
7. Every access and modification (login, create/edit/delete/duplicate, activation/deactivation) must be written to a log table — add a Postgres `access_log` table (timestamp, `user_id`, action, optional target-entity reference) written to via a Postgres trigger or explicit call from the client SDK/RLS-safe RPC function.
8. **Session persistence: 15 days.** Keep the Supabase session alive (auto-refreshing the JWT via Supabase's refresh-token flow, `persistSession: true`) for up to 15 days of inactivity before requiring a full login again. Per the product owner: while that 15-day session is valid, **returning logins skip the e-mail 2FA step entirely** — 2FA is only required the first time a device/session logs in, or after the 15-day session has actually expired and a fresh login is required. Track "session start"/"last verified" so the 15-day clock is measured correctly (e.g. store an issued-at timestamp for the 2FA-verified session, not just rely on the Supabase refresh token's own expiry).

## D. Usability requirements

1. Home dashboard with overall stats (total beers/wines/drinks/spirits) and per-category breakdowns — scoped to the logged-in user's own items (see Secondary Profiles note below; unchanged from the existing prototype behavior).
2. A 3-slide "Destaque do dia" carousel: one randomly-selected beer, one wine, and one drink **or spirit** (this widened from "drink" only in the previous spec — pick randomly between the drink and spirit tables for the third slot each time the dashboard loads).
3. Primary bottom navigation: **Home, Cervejas, Vinhos, Drinks, Destilados** (5 tabs — Destilados is now an explicit 5th tab, resolving the ambiguity from the earlier spec).
4. Login/access screens per section C above.
5. Cervejas, Vinhos, **Drinks and Destilados** list screens must offer 3 view modes: deck, table, gallery. *(Note: item D.5 as pasted only re-lists Cervejas/Vinhos/Drinks, omitting Destilados — but since D.10/E clearly treat Destilados as a full first-class category with its own table and D.3 gives it its own nav tab, the same 3 view modes should apply there too, matching the already-shipped prototype. Flag to product owner if Destilados should intentionally have a different/reduced view.)*
6. Full CRUD: create, edit, delete, duplicate any item — already implemented in the prototype, including ownership guards so a user can only mutate their own items.
7. Multi-language: Spanish, English, Portuguese, with a selector.
8. Profile management: change password, language selector, color-palette selector, light/dark mode.
   - **Color palette — confirmed final list (7 colors): Verde, Vermelho, Amarelo, Azul, Roxo, Rosa, Laranja** (green/red/yellow/blue/purple/pink/orange). The prototype's `HUES` map now includes all 7 (`{ green:150, blue:245, red:22, orange:55, yellow:95, purple:300, pink:350 }`, each a hue-degree value plugged into the shared OKLCH formula — see "Design Tokens" in README).
9. Profile management: friendly display name.
10. Profile management: profile photo.
11. Profile management: show the e-mail address associated with the account (read-only display — new in this pass; not present in the earlier spec).

## E. Data tables (Supabase / Postgres schema)

The product owner's original spec described these as Google Sheets tabs; they're translated here into Postgres tables for Supabase, preserving every field, type, and editable/visible flag from the original spec. Column names below use the original `snake_case` field names directly as the Postgres column names for continuity.

Legend: **EDITABLE** = user-editable from the app; **VISIBLE** = shown in the UI. Columns marked not-editable/not-visible are system-managed (defaults, triggers, RLS-protected) rather than exposed in any form.

### `user` — user table
| Column | Purpose | Type | Editable | Visible |
|---|---|---|---|---|
| user_id | Record ID | `uuid` (or `bigint identity`) PK, defaults to Supabase Auth's `auth.users.id` | N | N |
| user_nome | User's display name | `text` | S | S |
| user_mail | User's e-mail | `text` (mirrors `auth.users.email`) | S | S |
| user_pwd | Password | not stored directly — Supabase Auth owns password hashing; omit this column and rely on `auth.users` | N | N |
| user_img | Profile photo | `text` (Storage object path/URL) | S | S |
| user_idioma | Language | `enum('PT','EN','ES')` | S | S |
| user_paleta | Selected color palette | `enum('Verde','Vermelho','Amarelo','Azul','Roxo','Rosa','Laranja')` | S | S |
| user_modo | Background mode | `enum('light','dark')` | S | S |
| user_url_img | Storage folder path/prefix for this user's item images | `text` | N | N |
| user_status | Active/inactive | `enum('S','N')` (or boolean) | N | N |
| user_ult_login | Last login timestamp | `timestamptz` | N | N |

### `relac` — follower/relationship table (secondary profiles)
| Column | Purpose | Type | Editable | Visible |
|---|---|---|---|---|
| relac_id | Record ID | `bigint identity` PK | N | N |
| user_id_seguido | Followed user's ID | `uuid`/`bigint` FK → `user.user_id` | N | N |
| user_id_seguidor | Follower user's ID | `uuid`/`bigint` FK → `user.user_id` | N | N |

One row per directional follow relationship. To get "which secondary profiles can user X switch into" (the prototype's `relac[X]`): `SELECT user_id_seguido FROM relac WHERE user_id_seguidor = X`. **No UI is needed to manage this table** — it's configured internally (matches the already-shipped prototype's profile-switcher, which only ever *reads* this relationship).

### `beer` — beer table
| Column | Purpose | Type | Editable | Visible |
|---|---|---|---|---|
| beer_id | Record ID | `bigint identity` PK | N | N |
| beer_nome | Name | `text` | S | S |
| beer_produtor | Producer name | `text` | S | S |
| pais_id | Producer's country | FK → `list_pais.pais_id` | S | S |
| beer_ibu | IBU | `numeric` | S | S |
| beer_abv | ABV | `numeric` | S | S |
| beer_nota | Rating | `numeric(2,1)` (1–5, 0.5 steps) | S | S |
| beer_estilo_livre | Free-form style | `text` | S | S |
| bjcp21_id | BJCP style | FK → `list_bjcp_21.bjcp21_id` | S | S |
| beer_data | Tasting date | `date` | S | S |
| beer_img_nome | Image file name/ID | `text` | S | S |
| beer_img_url | Image file URL | `text` (Storage public/signed URL) | N | N |
| user_id | Owner | FK → `user.user_id` | N | N |

### `wine` — wine table
| Column | Purpose | Type | Editable | Visible |
|---|---|---|---|---|
| wine_id | Record ID | `bigint identity` PK | N | N |
| wine_nome | Name | `text` | S | S |
| wine_safra | Vintage year | `int` | S | S |
| wine_cor | Wine color | `enum('Tinto','Branco','Rosé','Verde','Laranja')` | S | S |
| wine_tipo | Wine type | `enum('Seco','Semi-Seco','Suave','Brut')` | S | S |
| wine_produtor | Producer name | `text` | S | S |
| pais_id | Producer's country | FK → `list_pais.pais_id` | S | S |
| wine_regiao | Producer's region | `text` | S | S |
| wine_uva | Grape(s) | `text` | S | S |
| wine_abv | ABV | `numeric` | S | S |
| wine_nota | Rating | `numeric(2,1)` | S | S |
| wine_data_degustacao | Tasting date | `date` | S | S |
| wine_img_nome | Image file name/ID | `text` | S | S |
| wine_img_url | Image file URL | `text` | N | N |
| user_id | Owner | FK → `user.user_id` | N | N |

### `dest` — spirits table
| Column | Purpose | Type | Editable | Visible |
|---|---|---|---|---|
| dest_id | Record ID | `bigint identity` PK | N | N |
| dest_nome | Name | `text` | S | S |
| dest_tipo | Spirit type | `enum('Cachaça','Vodka','Gin','Whisky','Rum','Tequila','Brandy','Pisco','Shochu','Saque','Vermute','Bitter')` | S | S |
| dest_safra | Vintage/aging year | `int` | S | S |
| dest_produtor | Producer name | `text` | S | S |
| pais_id | Producer's country | FK → `list_pais.pais_id` | S | S |
| dest_regiao | Producer's region | `text` | S | S |
| dest_abv | ABV | `numeric` | S | S |
| dest_nota | Rating | `numeric(2,1)` | S | S |
| dest_data_degustacao | Tasting date | `date` | S | S |
| dest_img_nome | Image file name/ID | `text` | S | S |
| dest_img_url | Image file URL | `text` | N | N |
| user_id | Owner | FK → `user.user_id` | N | N |

*(This paste again arrived with the same field/purpose columns shifted as the first time — no `dest_abv` row, a "Nota"/"Data de Degustação" mismatch, and a duplicated `user_id` row. Per your prior confirmation, keeping the previously-agreed correction above: `dest_abv` before `dest_nota`, ordered the same as `beer`/`wine`, single trailing `user_id`. Flag if this table's field order should be re-sent cleanly to double check.)*

### `drink` — drinks/cocktails table
| Column | Purpose | Type | Editable | Visible |
|---|---|---|---|---|
| drink_id | Record ID | `bigint identity` PK | N | N |
| drink_nome | Name | `text` | S | S |
| drink_produtor | Producer/maker name | `text` | S | S |
| pais_id | Producer's country | FK → `list_pais.pais_id` | S | S |
| drink_regiao | Producer's region | `text` | S | S |
| drink_abv | ABV | `numeric` | S | S |
| drink_nota | Rating | `numeric(2,1)` | S | S |
| drink_data_degustacao | Tasting date | `date` | S | S |
| drink_img_nome | Image file name/ID | `text` | S | S |
| drink_img_url | Image file URL | `text` | N | N |
| user_id | Owner | FK → `user.user_id` | N | N |

**Note (unchanged from the previous pass):** this table has no color/style/vintage/grape columns, unlike the prototype's Drinks screen which currently shows a color tag and a style tag (e.g. "Âmbar"/"Clássico") per drink. Either add such column(s) here, or simplify the Drinks UI to match — flag to product owner before that screen is finalized against real data.

### `list_pais` — country lookup (internal, no screen)
| Column | Purpose | Type | Editable | Visible |
|---|---|---|---|---|
| pais_id | Record ID | `bigint identity` PK | N | N |
| pais_nome | Country name | `text` | N | N |
| pais_img | Country flag image | `text` (Storage path/URL) | N | N |

### `list_bjcp_21` — BJCP style lookup (internal, no screen)
| Column | Purpose | Type | Editable | Visible |
|---|---|---|---|---|
| bjcp21_id | Record ID | `bigint identity` PK | N | N |
| bjcp21_cod | BJCP code | `int` | N | N |
| bjcp21_subestilo | Detailed BJCP style name | `text` | N | N |

### `access_log` — new table, required by section C.7 (not itemized in the original per-tab spec)
| Column | Purpose | Type |
|---|---|---|
| log_id | Record ID | `bigint identity` PK |
| user_id | Acting user | FK → `user.user_id` |
| ts | Timestamp | `timestamptz`, default `now()` |
| action | Free-text action description (e.g. "login", "editou Malbec Reserva") | `text` |
| entity_type / entity_id | Optional: which table/row was affected | `text` / `bigint` |

## Row Level Security (RLS) — replaces the removed backend's authorization layer
Since there's no custom API tier, **RLS policies on every table are the actual security boundary** — this is the most important architectural difference from the earlier Rust-backend plan:
- `beer`/`wine`/`dest`/`drink`: `SELECT` allowed if `user_id = auth.uid()` OR `auth.uid()` appears as a `user_id_seguidor` row in `relac` pointing at this item's `user_id` (i.e. viewing a followed profile's items, read-only). `INSERT`/`UPDATE`/`DELETE` allowed only if `user_id = auth.uid()` — this is what enforces "you can never mutate a followed profile's items," previously done in the prototype only in the UI/JS layer.
- `user`: a user can `SELECT`/`UPDATE` only their own row (`user_id = auth.uid()`), except the columns needed to render another user's avatar/name in the profile switcher (name + avatar path) — expose those via a narrow public view or a `SECURITY DEFINER` RPC rather than opening the whole table.
- `relac`: read-only from the client (`SELECT` where `user_id_seguidor = auth.uid()`); no client-side `INSERT`/`UPDATE`/`DELETE` — matches "no UI to manage RELAC," so writes happen only via the Supabase dashboard/service-role key.
- `access_log`: `INSERT`-only from the client (via an RPC function that stamps `user_id = auth.uid()` server-side so it can't be spoofed); no client `SELECT` except for admins.

## Field mapping — prototype ↔ real Supabase columns

**Beer:** `id`→`beer_id`, `name`→`beer_nome`, `manufacturer`→`beer_produtor`, `country`→`pais_id` (join), `ibu`→`beer_ibu`, `abv`→`beer_abv`, `rating`→`beer_nota`, `estiloLivre`→`beer_estilo_livre`, `category`→`bjcp21_id` (join), `tastingDate`→`beer_data`, photo placeholder→`beer_img_nome`/`beer_img_url`, `ownerId`→`user_id`.

**Wine:** `name`→`wine_nome`, `vintage`→`wine_safra`, `category`→`wine_cor`, `wineType`→`wine_tipo`, `manufacturer`→`wine_produtor`, `country`→`pais_id`, `region`→`wine_regiao`, `grape`→`wine_uva`, `abv`→`wine_abv`, `rating`→`wine_nota`, `tastingDate`→`wine_data_degustacao`, photo placeholder→`wine_img_nome`/`wine_img_url`, `ownerId`→`user_id`.

**Spirit (dest):** `name`→`dest_nome`, `category`(prototype color tag)→**no real column**, `wineType`(prototype style tag)→`dest_tipo` (real enum is fixed — remap free-form prototype strings to it), `vintage`→`dest_safra`, `manufacturer`→`dest_produtor`, `country`→`pais_id`, `region`→`dest_regiao`, `abv`→`dest_abv`, `rating`→`dest_nota`, `tastingDate`→`dest_data_degustacao`, `ownerId`→`user_id`.

**Drink:** `name`→`drink_nome`, `manufacturer`→`drink_produtor`, `country`→`pais_id`, `region`→`drink_regiao`, `abv`→`drink_abv`, `rating`→`drink_nota`, `tastingDate`→`drink_data_degustacao`, `ownerId`→`user_id`. Prototype's `category`/`wineType` color/style tags have no home in this table — see `drink` note above.

**Users:** prototype `{ id, name, email, status, role }` → `user_id, user_nome, user_mail, user_status`, plus real-schema-only fields the prototype's mock state doesn't model: `user_img`, `user_idioma`, `user_paleta`, `user_modo`, `user_url_img`, `user_ult_login`. Prototype's `role: admin/user` still isn't in the `user` table above — confirm whether admin capability should be a new column (e.g. `user_role`) or a fixed allow-list of admin e-mails/UIDs.

**RELAC:** prototype `relac: { [userId]: followedUserId[] }` → group `relac` rows by `user_id_seguidor` to reconstruct this map at load time.

## Open items for the product owner
1. **DEST table field order** — this is the second time it's arrived with the field-name/purpose columns visibly shifted relative to each other. The correction applied above (confirmed once already) assumes it should mirror `beer`/`wine`'s shape. Worth pasting this one tab cleanly once more to be certain before Claude Code writes migrations.
2. **New-user default status** — the earlier spec explicitly required new signups to start `inactive` pending manual activation; this pass's paste doesn't restate that rule. Confirm whether it still applies to Toastrack.
3. **Drink table's missing color/style fields** — the shipped prototype shows a color + style tag per drink that has no corresponding column in `drink`. Decide whether to add columns or simplify the UI.
4. **Data-import gotcha to double-check on migration:** the first real deploy surfaced a case where the `WINE` sheet's `user_id` column was left blank on a bulk import, silently hiding every wine from its owner-scoped queries (nothing wrong with the code — the row-ownership filter did exactly what it should). When migrating this data into Supabase, verify `user_id` is populated on every row of `beer`/`wine`/`dest`/`drink`, not just `wine` — add a `NOT NULL` constraint (or a `DEFAULT` tied to the importing session) on that column so this class of bug fails loudly at import time instead of silently at query time.
