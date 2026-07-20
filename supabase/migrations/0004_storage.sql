-- ============================================================================
-- Toastrack — Storage bucket + policies for item photos (beer / wine / …).
--
-- Decision (product owner, 2026-07-19): a single PUBLIC bucket named `toastrack`.
-- Item photos are low-sensitivity bottle/label shots; a public bucket gives
-- stable, permanent URLs that <img> can load directly (the app runs `images:
-- { unoptimized: true }` on a static host, so no signed-URL renewal machinery).
--
-- Path convention (mirrors user_url_img = user_id): objects live under
--   IMG/BEER/<user_id>/<file>   and   IMG/WINE/<user_id>/<file>
-- Public read is open (bucket is public); writes/updates/deletes are restricted
-- to the owner: the first path segment after IMG/<CAT>/ must equal auth.uid().
-- This is what lets the /admin import upload only into your own folder, with no
-- service-role key — same "you can only touch your own data" guarantee as the
-- catalog tables' RLS.
-- ============================================================================

-- Create the public bucket (idempotent).
insert into storage.buckets (id, name, public)
values ('toastrack', 'toastrack', true)
on conflict (id) do update set public = true;

-- Owner-only write policies on storage.objects for this bucket.
-- storage.foldername(name) returns the path segments as a text[]:
--   'IMG/BEER/<uid>/0001.jpg' -> {IMG, BEER, <uid>}
-- so element [3] is the per-user folder that must match the caller.
drop policy if exists toastrack_insert_own on storage.objects;
create policy toastrack_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'toastrack'
    and (storage.foldername(name))[1] = 'IMG'
    and (storage.foldername(name))[3] = auth.uid()::text
  );

drop policy if exists toastrack_update_own on storage.objects;
create policy toastrack_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'toastrack'
    and (storage.foldername(name))[3] = auth.uid()::text
  )
  with check (
    bucket_id = 'toastrack'
    and (storage.foldername(name))[3] = auth.uid()::text
  );

drop policy if exists toastrack_delete_own on storage.objects;
create policy toastrack_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'toastrack'
    and (storage.foldername(name))[3] = auth.uid()::text
  );

-- Public read: a public bucket already serves objects over the public URL, but
-- add an explicit SELECT policy so authenticated listing/APIs work consistently.
drop policy if exists toastrack_read_all on storage.objects;
create policy toastrack_read_all on storage.objects
  for select to public
  using (bucket_id = 'toastrack');
