-- Migration 007: прикріплення файлів до сутностей + статутні документи ФОПа + факсиміле
-- Виконати в Supabase → SQL Editor.

-- 1) Storage bucket 'files' (приватний, доступ через signed URLs)
insert into storage.buckets (id, name, public)
  values ('files', 'files', false)
  on conflict (id) do nothing;

-- RLS для storage.objects: користувач працює зі шляхом, що починається з його user_id
drop policy if exists files_read  on storage.objects;
drop policy if exists files_write on storage.objects;
drop policy if exists files_del   on storage.objects;

create policy files_read on storage.objects for select to authenticated
  using (bucket_id = 'files' and (auth.uid()::text = (storage.foldername(name))[1]));
create policy files_write on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (auth.uid()::text = (storage.foldername(name))[1]));
create policy files_update on storage.objects for update to authenticated
  using (bucket_id = 'files' and (auth.uid()::text = (storage.foldername(name))[1]));
create policy files_del on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (auth.uid()::text = (storage.foldername(name))[1]));

-- 2) Прикріплення до будь-якої сутності (транзакція, контрагент, документ...)
create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  fop_id uuid not null references fops(id) on delete cascade,
  entity_type text not null,        -- transaction | counterparty | invoice | act | delivery_note | vat_invoice
  entity_id uuid not null,
  filename text not null,
  storage_path text not null,
  mime text default '',
  size int default 0,
  created_at timestamptz default now()
);
create index if not exists attachments_entity_idx on attachments(entity_type, entity_id);

alter table attachments enable row level security;
drop policy if exists attachments_owner on attachments;
create policy attachments_owner on attachments for all to authenticated
  using (fop_id in (select id from fops where user_id = auth.uid()))
  with check (fop_id in (select id from fops where user_id = auth.uid()));

-- 3) Статутні документи ФОПа (окрема таблиця, бо мають категорію і опис)
create table if not exists fop_documents (
  id uuid primary key default gen_random_uuid(),
  fop_id uuid not null references fops(id) on delete cascade,
  category text not null,           -- passport | rnokpp | vat_cert | ep_extract | license | requisites | contract | other
  title text not null default '',
  filename text not null,
  storage_path text not null,
  mime text default '',
  size int default 0,
  created_at timestamptz default now()
);

alter table fop_documents enable row level security;
drop policy if exists fop_documents_owner on fop_documents;
create policy fop_documents_owner on fop_documents for all to authenticated
  using (fop_id in (select id from fops where user_id = auth.uid()))
  with check (fop_id in (select id from fops where user_id = auth.uid()));

-- 4) Факсиміле у профілі ФОПа: URL до storage
alter table fops add column if not exists stamp_path text default '';
alter table fops add column if not exists signature_path text default '';
