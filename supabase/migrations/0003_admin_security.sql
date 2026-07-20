-- ============================================================================
-- Toastrack — admin access + privilege-escalation fix.
--
-- Problem in 0001: the `user_update_own` policy lets a user update ANY column of
-- their own row, including user_role — so anyone could make themselves admin.
--
-- Fix: a BEFORE UPDATE trigger that rejects changes to user_role / user_status
-- unless the caller is an admin. It allows the change when there is no JWT
-- (auth.uid() IS NULL = service_role / SQL editor / dashboard) so the FIRST
-- admin can still be bootstrapped. Plus RLS policies letting admins read/update
-- every user row (for the "Gestão de usuários" screen).
-- ============================================================================

create or replace function public.guard_user_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.user_role   is distinct from old.user_role
      or new.user_status is distinct from old.user_status)
     and auth.uid() is not null            -- allow service_role / SQL editor
     and not public.is_admin() then
    raise exception 'Alteração de user_role/user_status não permitida.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_user_privileges on "user";
create trigger guard_user_privileges
  before update on "user"
  for each row execute function public.guard_user_privileges();

-- Admins can read and update every user row (regular users keep own-row access
-- via the existing user_select_own / user_update_own policies — permissive OR).
drop policy if exists user_admin_select on "user";
create policy user_admin_select on "user"
  for select to authenticated using (public.is_admin());

drop policy if exists user_admin_update on "user";
create policy user_admin_update on "user"
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Bootstrap the first admin (run once; edit the e-mail as needed).
-- auth.uid() is NULL here in the SQL editor, so the guard trigger allows it.
-- ---------------------------------------------------------------------------
-- update "user" set user_role = 'admin' where user_mail = 'carlosasribeiro+tt1@gmail.com';
