-- ───────── sync table (one generic table of encrypted records) ─────────
create sequence if not exists public.sync_seq;

create table public.sync_records (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entity     text not null check (entity ~ '^[a-z_]{1,40}$'),
  id         uuid not null,
  hlc        text collate "C" not null,            -- byte-order comparison, never locale-based
  deleted    boolean not null default false,
  payload_v  smallint not null default 1,
  payload    text check (payload is null or octet_length(payload) <= 4000000),
  server_seq bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, entity, id)
);
create index sync_records_pull on public.sync_records (user_id, server_seq);

create or replace function public.sync_records_stamp() returns trigger
language plpgsql as $$
begin
  new.server_seq := nextval('public.sync_seq');
  new.updated_at := now();
  return new;
end $$;

create trigger sync_records_stamp before insert or update on public.sync_records
for each row execute function public.sync_records_stamp();

-- ───────── key material (wrapped DEK; useless without passphrase or recovery key) ─────────
create table public.user_keys (
  user_id              uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  kdf                  text not null default 'argon2id',
  kdf_params           jsonb not null,                 -- {"m_kib":65536,"t":3,"p":1}
  salt                 text not null,                  -- base64
  wrapped_dek_pass     text not null,                  -- base64(nonce || ciphertext)
  wrapped_dek_recovery text,
  key_check            text not null,                  -- sealed constant to verify a candidate DEK
  version              smallint not null default 1,
  updated_at           timestamptz not null default now()
);

-- ───────── privileges ─────────
revoke all on public.sync_records, public.user_keys from anon;
grant select, insert, update, delete on public.sync_records, public.user_keys to authenticated;
grant usage on sequence public.sync_seq to authenticated;

-- ───────── RLS: owner + (restrictive) must have completed MFA ─────────
alter table public.sync_records enable row level security;
alter table public.user_keys    enable row level security;

create policy sync_owner on public.sync_records for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy sync_aal2 on public.sync_records as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2');

create policy keys_owner on public.user_keys for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy keys_aal2 on public.user_keys as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2');

-- ───────── push RPC: last-write-wins by HLC, returns per-record acceptance ─────────
create or replace function public.sync_push(rows jsonb)
returns table (out_entity text, out_id uuid, out_accepted boolean, out_hlc text)
language plpgsql security invoker set search_path = public as $$
declare r jsonb;
begin
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 200 then
    raise exception 'invalid batch';
  end if;
  for r in select value from jsonb_array_elements(rows) loop
    insert into public.sync_records as s (entity, id, hlc, deleted, payload_v, payload)
    values (
      r->>'entity', (r->>'id')::uuid, r->>'hlc',
      coalesce((r->>'deleted')::boolean, false),
      coalesce((r->>'payload_v')::smallint, 1),
      case when coalesce((r->>'deleted')::boolean, false) then null else r->>'payload' end)
    on conflict (user_id, entity, id) do update
      set hlc = excluded.hlc, deleted = excluded.deleted,
          payload_v = excluded.payload_v, payload = excluded.payload
      where s.hlc < excluded.hlc;
    return query
      select s2.entity, s2.id, (s2.hlc = (r->>'hlc')), s2.hlc
      from public.sync_records s2
      where s2.user_id = auth.uid() and s2.entity = r->>'entity' and s2.id = (r->>'id')::uuid;
  end loop;
end $$;

revoke all on function public.sync_push(jsonb) from public, anon;
grant execute on function public.sync_push(jsonb) to authenticated;

-- ───────── wipe helper (storage objects are removed from the client via the Storage API) ─────────
create or replace function public.wipe_my_cloud_data() returns void
language sql security invoker as $$
  delete from public.sync_records where user_id = auth.uid();
  delete from public.user_keys    where user_id = auth.uid();
$$;
revoke all on function public.wipe_my_cloud_data() from public, anon;
grant execute on function public.wipe_my_cloud_data() to authenticated;

-- ───────── realtime nudges ─────────
alter publication supabase_realtime add table public.sync_records;

-- ───────── storage ─────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 26214400)      -- 25 MB
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('releases', 'releases', true)                       -- public read; written only by CI with the service role
on conflict (id) do nothing;

create policy attachments_owner on storage.objects for all to authenticated
  using      (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy attachments_aal2 on storage.objects as restrictive for all to authenticated
  using (bucket_id <> 'attachments' or (select auth.jwt() ->> 'aal') = 'aal2');
