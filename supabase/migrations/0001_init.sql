-- ============================================================================
-- Toastrack — initial schema (Supabase / Postgres)
-- Translated from TECHNICAL_SPEC.md section E, with the decisions confirmed
-- with the product owner on 2026-07-10:
--   1. Drinks & Destilados drop the prototype's decorative color/style tags.
--      Destilados KEEP dest_tipo (Gin/Whisky/Vodka/... enum). Drinks have no
--      type/color column at all.
--   2. New users are created ACTIVE (user_status = 'S'); no manual-activation
--      gate on signup. 'N' is only used when an admin deactivates an account.
--   3. user_id is NOT NULL on beer/wine/dest/drink (fail loud on ownerless import).
--   4. dest column order per the product owner's clean paste.
--   5. Admin is a flag on the user table (user_role), not an external allow-list.
--
-- The table is named "user" per the spec for continuity — note it is a reserved
-- word, so it must always be double-quoted.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_idioma as enum ('PT', 'EN', 'ES');
create type user_paleta as enum ('Verde', 'Vermelho', 'Amarelo', 'Azul', 'Roxo', 'Rosa', 'Laranja');
create type user_modo   as enum ('light', 'dark');
create type user_status as enum ('S', 'N');            -- S = active, N = inactive
create type user_role   as enum ('admin', 'user');

create type wine_cor  as enum ('Tinto', 'Branco', 'Rosé', 'Verde', 'Laranja');
create type wine_tipo as enum ('Seco', 'Semi-Seco', 'Suave', 'Brut');
-- NOTE: the prototype seed also uses 'Doce' for wine_tipo; reconcile on data
-- import (map to the closest enum value or extend this enum) — flagged, not resolved here.

create type dest_tipo as enum (
  'Cachaça', 'Vodka', 'Gin', 'Whisky', 'Rum', 'Tequila',
  'Brandy', 'Pisco', 'Shochu', 'Saque', 'Vermute', 'Bitter'
);

-- ---------------------------------------------------------------------------
-- user — mirrors auth.users, holds app profile + preferences
-- ---------------------------------------------------------------------------
create table "user" (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  user_nome     text not null,
  user_mail     text not null,
  user_img      text,                                   -- Storage object path/URL
  user_idioma   user_idioma not null default 'PT',
  user_paleta   user_paleta not null default 'Verde',
  user_modo     user_modo   not null default 'light',
  user_url_img  text,                                   -- Storage folder prefix for this user's item images
  user_status   user_status not null default 'S',       -- decision #2: new users active
  user_role     user_role   not null default 'user',    -- decision #5: admin is a column
  user_ult_login timestamptz,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- relac — directional follow relationships (secondary profiles)
--   "which profiles can X switch into" = seguido WHERE seguidor = X
-- ---------------------------------------------------------------------------
create table relac (
  relac_id          bigint generated always as identity primary key,
  user_id_seguido   uuid not null references "user" (user_id) on delete cascade,
  user_id_seguidor  uuid not null references "user" (user_id) on delete cascade,
  created_at        timestamptz not null default now(),
  unique (user_id_seguido, user_id_seguidor),
  check (user_id_seguido <> user_id_seguidor)
);
create index relac_seguidor_idx on relac (user_id_seguidor);

-- ---------------------------------------------------------------------------
-- Lookup tables (internal, no UI screen)
-- ---------------------------------------------------------------------------
create table list_pais (
  pais_id   bigint generated always as identity primary key,
  pais_nome text not null,
  pais_img  text                                        -- flag image Storage path/URL
);

create table list_bjcp_21 (
  bjcp21_id        bigint generated always as identity primary key,
  bjcp21_cod       int,
  bjcp21_subestilo text not null
);

-- ---------------------------------------------------------------------------
-- Catalog tables — beer / wine / dest / drink
-- ---------------------------------------------------------------------------
create table beer (
  beer_id           bigint generated always as identity primary key,
  beer_nome         text not null,
  beer_produtor     text,
  pais_id           bigint references list_pais (pais_id),
  beer_ibu          numeric,
  beer_abv          numeric,
  beer_nota         numeric(2,1) check (beer_nota is null or (beer_nota >= 0 and beer_nota <= 5)),
  beer_estilo_livre text,
  bjcp21_id         bigint references list_bjcp_21 (bjcp21_id),
  beer_data         date,
  beer_img_nome     text,
  beer_img_url      text,
  user_id           uuid not null references "user" (user_id) on delete cascade,
  created_at        timestamptz not null default now()
);
create index beer_user_idx on beer (user_id);

create table wine (
  wine_id              bigint generated always as identity primary key,
  wine_nome            text not null,
  wine_safra           int,
  wine_cor             wine_cor,
  wine_tipo            wine_tipo,
  wine_produtor        text,
  pais_id              bigint references list_pais (pais_id),
  wine_regiao          text,
  wine_uva             text,
  wine_abv             numeric,
  wine_nota            numeric(2,1) check (wine_nota is null or (wine_nota >= 0 and wine_nota <= 5)),
  wine_data_degustacao date,
  wine_img_nome        text,
  wine_img_url         text,
  user_id              uuid not null references "user" (user_id) on delete cascade,
  created_at           timestamptz not null default now()
);
create index wine_user_idx on wine (user_id);

-- Column order per the product owner's clean paste (decision #4).
create table dest (
  dest_id              bigint generated always as identity primary key,
  dest_nome            text not null,
  dest_tipo            dest_tipo,
  dest_safra           int,
  dest_produtor        text,
  pais_id              bigint references list_pais (pais_id),
  dest_regiao          text,
  dest_abv             numeric,
  dest_nota            numeric(2,1) check (dest_nota is null or (dest_nota >= 0 and dest_nota <= 5)),
  dest_data_degustacao date,
  dest_img_nome        text,
  dest_img_url         text,
  user_id              uuid not null references "user" (user_id) on delete cascade,
  created_at           timestamptz not null default now()
);
create index dest_user_idx on dest (user_id);

-- Drinks: no color/type columns (decision #1).
create table drink (
  drink_id              bigint generated always as identity primary key,
  drink_nome            text not null,
  drink_produtor        text,
  pais_id               bigint references list_pais (pais_id),
  drink_regiao          text,
  drink_abv             numeric,
  drink_nota            numeric(2,1) check (drink_nota is null or (drink_nota >= 0 and drink_nota <= 5)),
  drink_data_degustacao date,
  drink_img_nome        text,
  drink_img_url         text,
  user_id               uuid not null references "user" (user_id) on delete cascade,
  created_at            timestamptz not null default now()
);
create index drink_user_idx on drink (user_id);

-- ---------------------------------------------------------------------------
-- access_log — audit trail (spec C.7)
-- ---------------------------------------------------------------------------
create table access_log (
  log_id      bigint generated always as identity primary key,
  user_id     uuid references "user" (user_id) on delete set null,
  ts          timestamptz not null default now(),
  action      text not null,
  entity_type text,
  entity_id   bigint
);
create index access_log_user_idx on access_log (user_id);

-- ============================================================================
-- Helper functions
-- ============================================================================

-- True if the current user may VIEW items owned by `owner`: either they own them,
-- or they follow `owner` via relac. SECURITY DEFINER + fixed search_path so the
-- relac lookup isn't itself gated by RLS (avoids recursion / policy interplay).
create or replace function public.can_view_owner(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select owner = auth.uid()
      or exists (
        select 1 from relac
        where user_id_seguidor = auth.uid()
          and user_id_seguido = owner
      );
$$;

-- Narrow exposure of followed users' name + avatar for the profile switcher,
-- without opening the whole "user" table (spec: RLS section).
create or replace function public.followed_profiles()
returns table (user_id uuid, user_nome text, user_img text)
language sql
stable
security definer
set search_path = public
as $$
  select u.user_id, u.user_nome, u.user_img
  from "user" u
  join relac r on r.user_id_seguido = u.user_id
  where r.user_id_seguidor = auth.uid();
$$;

-- Client-callable audit logger; stamps user_id from the JWT so it can't be spoofed.
create or replace function public.log_access(
  p_action text,
  p_entity_type text default null,
  p_entity_id bigint default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into access_log (user_id, action, entity_type, entity_id)
  values (auth.uid(), p_action, p_entity_type, p_entity_id);
$$;

-- Convenience: is the current user an admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from "user" where user_id = auth.uid() and user_role = 'admin'
  );
$$;

-- Create the app "user" row automatically when an auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public."user" (user_id, user_nome, user_mail, user_url_img)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    new.id::text                                  -- Storage folder prefix = user id
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Row Level Security — the actual authorization boundary (no server tier)
-- ============================================================================
alter table "user"        enable row level security;
alter table relac         enable row level security;
alter table list_pais     enable row level security;
alter table list_bjcp_21  enable row level security;
alter table beer          enable row level security;
alter table wine          enable row level security;
alter table dest          enable row level security;
alter table drink         enable row level security;
alter table access_log    enable row level security;

-- user: read/update only your own row.
create policy user_select_own on "user"
  for select to authenticated using (user_id = auth.uid());
create policy user_update_own on "user"
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- relac: read-only, only rows where you are the follower. Writes via service role only.
create policy relac_select_own on relac
  for select to authenticated using (user_id_seguidor = auth.uid());

-- Lookups: readable by any authenticated user; no client writes.
create policy list_pais_read on list_pais
  for select to authenticated using (true);
create policy list_bjcp_21_read on list_bjcp_21
  for select to authenticated using (true);

-- Catalog tables: view own or followed; mutate only own.
-- (Repeated per table because RLS policies can't be shared across tables.)
create policy beer_select on beer  for select to authenticated using (public.can_view_owner(user_id));
create policy beer_insert on beer  for insert to authenticated with check (user_id = auth.uid());
create policy beer_update on beer  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy beer_delete on beer  for delete to authenticated using (user_id = auth.uid());

create policy wine_select on wine  for select to authenticated using (public.can_view_owner(user_id));
create policy wine_insert on wine  for insert to authenticated with check (user_id = auth.uid());
create policy wine_update on wine  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy wine_delete on wine  for delete to authenticated using (user_id = auth.uid());

create policy dest_select on dest  for select to authenticated using (public.can_view_owner(user_id));
create policy dest_insert on dest  for insert to authenticated with check (user_id = auth.uid());
create policy dest_update on dest  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy dest_delete on dest  for delete to authenticated using (user_id = auth.uid());

create policy drink_select on drink for select to authenticated using (public.can_view_owner(user_id));
create policy drink_insert on drink for insert to authenticated with check (user_id = auth.uid());
create policy drink_update on drink for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy drink_delete on drink for delete to authenticated using (user_id = auth.uid());

-- access_log: no direct client INSERT (use public.log_access); admins may read.
create policy access_log_admin_read on access_log
  for select to authenticated using (public.is_admin());

-- Allow authenticated users to execute the helper RPCs.
grant execute on function public.can_view_owner(uuid)       to authenticated;
grant execute on function public.followed_profiles()        to authenticated;
grant execute on function public.log_access(text, text, bigint) to authenticated;
grant execute on function public.is_admin()                 to authenticated;
