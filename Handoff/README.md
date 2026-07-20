# Handoff: Toastrack — Wine/Beer/Drinks/Spirits Tasting Tracker (incl. Secondary Profiles)

## Overview
Toastrack ("Seu aplicativo completo de Sommelieria") is a mobile-first personal tasting-log app. A user logs beers, wines, drinks (cocktails) and spirits they've tried, rates them, and browses/searches their collection in three view modes (deck / table / gallery). It also has a lightweight "social" layer: a logged-in user can follow other users' profiles (defined server-side in a RELAC/relationship table) and switch the list screens to browse a followed profile's collection in read-only mode.

**Tech stack:** Next.js + TypeScript + Tailwind CSS frontend, no separate backend (client talks directly to Supabase for Auth/DB/Storage, secured via Row Level Security), hosted on GitHub Pages as a static export. Full details, including the Postgres schema translated from the product owner's spec, are in `TECHNICAL_SPEC.md` — read that file before implementing.

This conversation's output is a single running prototype: `Toastrack.dc.html`. It includes full auth (login/signup/forgot/2FA/pending-activation), a home dashboard, per-category list/detail/edit screens, a stats drill-down, a settings/profile screen, and the secondary-profile switcher described below.

## About the Design Files
The bundled file is a **design reference built in HTML/JS** (a self-contained prototype using a small custom templating runtime — `<sc-if>`/`<sc-for>` control-flow tags and `{{ }}` bindings). It is not production code to copy verbatim. The task is to **recreate this design and its behavior in the target codebase's real environment** (React Native / Flutter / native iOS+Android / React web — whichever the product actually ships on) using that environment's own component and state-management conventions. Treat the HTML purely as an interactive spec of layout, copy, states and behavior.

## Fidelity
**High-fidelity.** Colors, spacing, typography, copy (in 3 languages), icon shapes and all interaction/empty/error states are final-intent, not rough placeholders. Photos are represented by striped placeholder boxes with a monospace caption (e.g. "Foto: Weiss Dourada") — real product photography should replace these 1:1 by position/aspect-ratio.

## Data model note (important)
This prototype's "backend" is in-memory mock state. The real backend already has (per the product owner):
- A **users table** with a stable `USER_ID`.
- Data tables for **cervejas / vinhos / drinks / destilados**, each row carrying a `USER_ID` (owner) — this prototype models that field as `ownerId` on each item.
- A **RELAC** tab/table mapping a `USER_ID` to the `USER_ID`s of the secondary/followed profiles that user is allowed to view. Only profiles present in RELAC for the logged-in user may ever be offered as switchable — there is no UI in this app to manage RELAC associations; it's an internal/backend configuration.

## Screens / Views

### 1. Auth — Login
- Centered card (mobile: full-bleed; desktop preview: 428×860 phone-style frame, `border-radius:36px`, drop shadow).
- Logo dot (44×44 circle, accent-soft bg) + "Toastrack" wordmark (18px/700) + tagline (13px muted).
- Fields: e-mail, password (with an SVG eye/eye-off icon show/hide toggle button positioned inside the field).
- Primary button "Entrar" (full width, 13px vertical padding, accent bg, 11px radius).
- Row below: "Esqueci minha senha" / "Criar conta" links.
- **Demo-credentials hint box** (accent-soft bg, 10px radius, 11px muted text, 16px top margin): lists the seed test accounts and shared rules — *"Contas de teste (qualquer senha, código 482913): admin@toastrack.com (perfil principal, com perfis seguidos), rafael@email.com, marina@email.com, camila@email.com, diego@email.com, bianca@email.com."* This box is prototype-only scaffolding — drop it in production.
- Any e-mail not matching an existing account logs in immediately as a brand-new user (skips real signup) — this is a prototype convenience, not intended production behavior.

### 2. Auth — Signup
Same card chrome. Fields: display name, e-mail, password (with live hint "Mín. 8 caracteres, maiúscula, minúscula, número e símbolo"). On submit, account is created with status **inactive** and the user is sent to the "Pending activation" screen — an admin must flip status to active (see Profile → User management) before the account can log in.

### 3. Auth — Forgot password
Email field + "Enviaremos um link de redefinição para seu e-mail" copy; submitting shows a success box; link back to login.

### 4. Auth — 2FA verification
Shown right after login. Displays a green success box with the (mock) code emailed, a 6-character monospaced code input (22px, letter-spacing 0.3em, centered), "Verificar" button, "Reenviar código" link. Mock code is always `482913` in this prototype.

### 5. Auth — Pending activation notice
Shown when a known account with `status: inactive` tries to log in, or right after signup. Explains the account is awaiting manual admin activation; single button back to login.

### 6. Home
- Header: search input (pill, 20px radius) + a category-select dropdown ("Todos"/per-field) + circular avatar button (38px, initials, accent-soft bg) that opens the Profile/Settings screen.
- **Featured carousel** ("Destaque do dia"): auto-advancing (4s interval) card cycling through 3 items pulled from across all categories — placeholder image (150px) + category tag + name + subtitle + dot pagination.
- **Overview grid** ("Visão geral"): 4 stat cards (Cervejas/Vinhos/Drinks/Destilados), each showing an icon, a count, and the type label; tapping opens the Stats drill-down for that type. **Counts are always scoped to the logged-in user's own items (`ownerId === loggedInUser.id`)** — never affected by which secondary profile is currently selected elsewhere in the app.
- Typing in the header search live-filters across all 4 categories combined (name/manufacturer/country/style match), replacing the carousel+overview with a flat result list; each row is thumbnail + name + manufacturer + country flag + type tag.
- No changes needed here for the secondary-profile feature — Home stats/search stay scoped to the primary user only.

### 7. Stats drill-down (per type: cervejas/vinhos/drinks/destilados)
Back-style header (← Voltar / title). Hero card: total count + average star rating (read-only 5-star row) + numeric average. Then three ranked list sections: "Por país" (flag + name + count), "Por categoria" (name + proportional bar + count), "Por fabricante" (name + count). Data is the same "own items only" scope as the Home overview cards.

### 8. List screens (Cervejas / Vinhos / Drinks / Destilados) — the core of this handoff
Back-style header replaced by the *search-style* header (shared with Home): search input + field-select dropdown ("Todos" / Nome / Fabricante / País — the "Categoria" option was intentionally removed) + avatar button.

**Row 1 (filters):** none currently beyond the search field selector above the list.

**Row 2 (view-mode command row) — where the profile switcher lives:**
Left → right, all in one flex row, 8px gaps:
1. **Profile switcher** (only rendered if the logged-in user has ≥1 secondary/followed profile in RELAC — otherwise this whole cluster, including its trailing divider, is omitted and the row starts directly at the view-mode icons):
   - A pill trigger button: 30px circular avatar (initials, accent-soft bg/accent text) + a small chevron-down icon. Border/background highlight accent color when a secondary profile is active (vs. subtle border when viewing your own/primary profile).
   - Tapping opens a **dropdown menu** (absolute-positioned panel, 190px min width, surface bg, 14px radius, drop shadow) anchored under the trigger, with a full-viewport transparent overlay behind it to close on outside click.
   - First row in the dropdown = "**{Your name} · meu perfil**" (always present, represents switching back to the primary profile).
   - Following rows = one per secondary profile from RELAC, each: 30px avatar circle (initials) + name + (if selected) a checkmark icon in accent color. Selected row also gets an accent-soft background highlight.
   - Selecting a row sets the active viewed profile and closes the dropdown; the item list re-filters immediately to that profile's items (`ownerId === selected user's id`) and `filterCategory` resets to "all".
   - A vertical divider (`1px`, border color, `24px` tall) separates the switcher from the view-mode icons — only rendered when the switcher itself is rendered.
2. **View-mode icon group**: 3 square icon buttons (40×38px, 10px radius) for Deck / Table / Gallery — active one gets accent border + accent-soft fill + accent icon color; inactive ones get neutral border/icon.
3. Divider (same style as above).
4. **Add button** — a 38×38px square icon button (accent bg, white/near-black "+" icon depending on light/dark mode) — **only rendered when viewing your own primary profile**; hidden entirely while browsing a secondary profile (you cannot add items to someone else's collection).

**Item count / status line**, directly under Row 2:
- "{N} itens exibidos" (or equivalent per language).
- If a secondary profile is currently active, an extra line right below in accent color: "**Vendo perfil de {Name} · Somente visualização**" (view-only badge).

**Deck view** (default): vertical stacked rows — 72×72px placeholder thumbnail, name (15px/800), manufacturer, star rating + date, and (only if `canEdit`, i.e. you own the item) a column of 3 small icon buttons: edit (✎), duplicate (⧉), delete (✕, danger-colored border). When viewing a secondary/followed profile's items, these three action buttons are hidden entirely for every row (rows are otherwise identical) — tapping a row still opens the read-only detail view.

**Table view**: horizontally scrollable table, sortable columns (Nome/Fabricante/Categoria/Data/Avaliação — click header to sort, arrow indicator ▲/▼), a trailing actions column with duplicate/delete icon buttons **only when `canEdit`** (edit isn't offered inline in table rows — open the row to edit).

**Gallery view**: responsive grid (`repeat(auto-fill, minmax(150px,1fr))`), each card = tall placeholder image (3:4) + name/subtitle below.

Empty state (any view, 0 matching items): centered muted text "Nenhum item encontrado" style copy.

### 9. Detail / Edit screen
Reached by tapping any item row. Back-style header. 
- **View mode**: image (placeholder, 180px), action row of icon buttons — search-on-Google, share (always shown), then edit/duplicate/delete (**only shown when `canEdit` is true for that item** — i.e., you own it; browsing a followed profile's item shows only the search/share icons). Below: name, manufacturer/origin line, read-only star row, type-specific fields (beer: IBU/ABV/estilo/BJCP category; wine: vintage/region/grape/wine-type; drink/spirit: similar subset), an ID tag, and a tap-to-zoom photo viewer (pinch/zoom buttons, close button, on a dark overlay).
- **Edit mode** (only reachable for your own items): image upload placeholder box, a draggable/tappable half-star rating widget (drag across 5 star cells, live numeric label), then per-type form fields (selects for category/country pulled from static lists, date picker for tasting date, free-text fields for name/manufacturer/estilo/etc.). Header shows a "Salvar" link-style button while editing instead of the title.
- New items are created via the Add (+) button (list screen) and always immediately assigned `ownerId = loggedInUser.id` — you can never create an item under someone else's identity, even while conceptually "viewing" their profile (the Add button is hidden in that state anyway, so this is a belt-and-suspenders guard in logic, not just UI).

### 10. Profile / Settings screen
Reached via the header avatar button (available from Home and every List screen). Back-style header, title "Perfil". 
- Centered large avatar (72px circle, initials) + "Alterar foto" link (simulated upload — toast confirmation only).
- Card: "Nome de exibição" text input + "Salvar" button.
- Card: language switcher (PT/EN/ES segmented buttons).
- Card: color-palette switcher (7 hue swatches: green/blue/red/orange/yellow/purple/pink — 34px circles, `oklch(58% 0.13 {hue})`, selected gets a thicker text-colored ring) + implicitly a light/dark mode toggle (`modeOptions`, same segmented-button pattern).
- Card: change-password form (current/new/confirm fields, inline validation error text).
- **Admin-only cards** (shown only if `loggedInUser.role === 'admin'`): "Gestão de usuários" — list of all users with name/email/status pill + activate/deactivate toggle button per row; "Log de acesso" — reverse-chronological list of audit events (login, edits, account creation, activations…).
- "Sair" (logout) danger-style full-width button at the bottom.
- **This screen has no secondary-profile management UI by design** — RELAC associations are configured on the backend/internally, not through this app.

## Interactions & Behavior — Secondary Profiles (this feature specifically)

**Data needed from backend:**
- `users`: `{ id, name, email, status: active|inactive, role: admin|user }`.
- Each cerveja/vinho/drink/destilado row carries `ownerId` (= the row's `USER_ID`).
- `relac`: map of `userId -> [followedUserId, …]`. Only ids present in this list for the current user may ever populate the switcher dropdown or be selectable — treat any id not present as inaccessible even if guessed/forced via URL or API (defense in depth, not just hidden UI).

**Client-side state to model:**
- `viewedProfileId` (nullable) — `null`/absent means "viewing my own profile." Persists across switching between Cervejas/Vinhos/Drinks/Destilados tabs (does not reset on tab change) but **does** reset to `null` on logout and on login.
- `profileMenuOpen` (boolean) — dropdown open/closed.

**Behavior rules:**
1. On login, the user always lands on their own primary profile's data everywhere (Home, list screens).
2. The profile-switcher UI cluster (avatar+chevron trigger, its divider) only renders on the 4 category list screens, and only if the logged-in user has at least one entry in RELAC. It never appears on Home.
3. Selecting a secondary profile in the dropdown re-scopes the *current list screen's* items to `item.ownerId === selectedProfile.id`, and resets any active category filter to "all". Switching to a different category tab (e.g. Cervejas → Vinhos) while a secondary profile is active keeps browsing that same secondary profile's Vinhos.
4. While viewing a secondary profile: hide the Add (+) button; hide per-row edit/duplicate/delete affordances (deck view: all three icons; table view: duplicate/delete column); hide edit/duplicate/delete in the item Detail screen's action row (keep search-on-Google and share, since those are read-only, non-destructive actions). Show the "Vendo perfil de {Name} · Somente visualização" badge under the item count.
5. Guard all mutation entry points server-side (and, redundantly, client-side) against acting on an item whose `ownerId` isn't the acting user's id — don't rely solely on hidden buttons.
6. Home's overview stat counts and the Stats drill-down screens are **always** computed from `ownerId === loggedInUser.id`, ignoring `viewedProfileId` entirely — they represent "my own tasting stats," not whichever profile happens to be selected elsewhere.
7. Avatar rendering throughout (header, switcher trigger, dropdown rows, Profile screen) is initials-only (first letter of up to the first two words of the name, uppercased) on an accent-soft circular background — there is no photo upload for other users' avatars in this app; only your own "Alterar foto" is a (simulated) upload affordance.

## Design Tokens

**Typography:** Single family, Manrope (weights 400/500/600/700/800), loaded from Google Fonts. No secondary typeface.
- Screen title (back header): 16px / 800
- Section labels (e.g. "VISÃO GERAL"): uppercase, small, muted, letter-spacing ~0.04em
- Body / item names: 13–15px, weight 600–800
- Muted/secondary text: 11.5–13px, textMuted color
- Buttons: 12.5–14.5px, weight 700

**Color system:** Generated from a single hue value via OKLCH, so all 7 palettes (green/blue/red/orange/yellow/purple/pink) share identical lightness/chroma curves and only rotate hue — plus a light/dark mode multiplier. Formulas (hue in degrees, one of `{ green:150, blue:245, red:22, orange:55, yellow:95, purple:300, pink:350 }`):
- `bg`: dark `oklch(17% 0.012 H)` / light `oklch(98% 0.006 H)`
- `surface` (cards): dark `oklch(22% 0.014 H)` / light `oklch(100% 0 0)` (pure white)
- `text`: dark `oklch(95% 0.01 H)` / light `oklch(22% 0.02 H)`
- `textMuted`: dark `oklch(70% 0.02 H)` / light `oklch(48% 0.02 H)`
- `border`: dark `oklch(32% 0.02 H)` / light `oklch(90% 0.012 H)`
- `trackBg` (table header bg): dark `oklch(30% 0.02 H)` / light `oklch(92% 0.012 H)`
- `accent`: `oklch(58% 0.13 H)` (same in both modes)
- `accentSoft`: dark `oklch(30% 0.05 H)` / light `oklch(93% 0.03 H)`
- `danger` (delete/errors): `oklch(55% 0.14 25)` (fixed red, independent of the app's hue)

**Radii:** pill inputs/search 20px; buttons/cards 10–16px; avatars/icon-only buttons circular (50%); the desktop preview device-frame uses 36px.

**Spacing:** page/section horizontal padding 20px; card padding 12–18px; row/element gaps 8–12px typically.

**Icons:** simple 24×24 viewBox line icons (stroke-based, 2px stroke, round caps/joins), no icon font/library — see the `ICON_PATHS` table in the source for exact path data (home, beer, wine, drink, spirit, deck, table, gallery, edit, duplicate, delete/trash, share, zoom in/out, close, plus, chevron-down, check, search).

**Placeholder imagery convention:** repeating 45°-striped gradient (`accentSoft` + `border`, 10px bands) with a centered monospace caption reading `Foto: {item name}` — use this consistently everywhere a real photo isn't available yet, so the developer's eye can find every spot needing a real asset.

## State Management (high level)
Single top-level state object (screen enum, forms, lists, current selection, view/sort/filter, secondary-profile state, i18n/theme prefs). Key groups a re-implementation should mirror as separate concerns/stores:
- **Auth/session**: screen (`login|signup|forgot|verify2fa|inactive|home|list|detail|profile|stats`), pending 2FA payload, logged-in user.
- **Catalog data**: 4 arrays (beers/wines/drinks/spirits), each item `{ id, seq, type, ownerId, name, category, manufacturer, country, abv, rating, tastingDate, …type-specific fields }`.
- **Users & RELAC**: `users[]`, `relac: { [userId]: userId[] }`.
- **List UI**: `listType`, `viewMode` (deck/table/gallery), `filterCategory`, `sortField`/`sortDir`, `searchQuery`/`searchField`.
- **Secondary profile**: `viewedProfileId`, `profileMenuOpen`.
- **Detail/edit**: `selectedItemId`, `isEditing`, `draft`.
- **Prefs**: `lang` (pt/en/es), `hue`, `mode` (light/dark).

## Assets
No external image/icon assets — all "photos" are CSS-drawn placeholders (see Design Tokens above), and all icons are inline hand-authored SVG path data (no icon font, no third-party icon set). Font is Google Fonts "Manrope" (see `<link>` tag in the file's `<head>`). Nothing to license or source externally.

## Files
- `Toastrack.dc.html` — the complete interactive prototype (all screens, states, and the secondary-profile feature described above). Open it directly in a browser to click through every flow. Use the demo accounts listed on the login screen to test the profile-switcher (`admin@toastrack.com` is the richest account — it follows all 5 other seed profiles); password can be anything, 2FA code is always `482913`. A floating "Auto / Mobile / Desktop" pill (bottom-right) forces the responsive layout regardless of actual window width — handy for reviewing both breakpoints without resizing.
- `screenshots/` — reference captures of key screens: login, Home (desktop + mobile), Cervejas in deck/table view, the Stats drill-down (top-10 + "ver tudo"), the account dropdown menu, and the Profile screen's Configurações/Segurança tabs.
- `TECHNICAL_SPEC.md` — the product owner's authoritative backend/infrastructure/data-model spec (tech stack decisions, Google Sheets tab-by-tab schema, Drive folder strategy, security requirements) plus a field-by-field mapping between this prototype's simplified state shape and the real Google Sheets columns. **Read this before implementing** — it also flags two open questions for the product owner (a likely column-order mix-up in the DEST sheet, and where the prototype's Drinks color/style tags and the 6-color vs. 5-color palette question should land in the real schema).
