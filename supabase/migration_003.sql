-- Migration 003: технічна підтримка (реєстр звернень + AI-асистент)
-- Виконати в Supabase → SQL Editor. Перевірити хвіст запиту (iOS-клавіатура!).

create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  description text,
  page text,
  status text not null default 'new' check (status in ('new','in_progress','answered','fixed','closed')),
  created_at timestamptz not null default now()
);

create table if not exists support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id) on delete cascade,
  author text not null check (author in ('user','assistant','admin')),
  body text not null,
  created_at timestamptz not null default now()
);

-- Адміністратори бачать усі звернення. Додайте свій email:
create table if not exists app_admins (email text primary key);
insert into app_admins (email)
  select email from auth.users order by created_at limit 1
  on conflict do nothing;  -- перший зареєстрований користувач = адмін; за потреби додайте інших вручну

grant all on support_tickets, support_messages to authenticated;
grant select on app_admins to authenticated;
grant all on support_tickets, support_messages, app_admins to service_role;

alter table support_tickets enable row level security;
alter table support_messages enable row level security;
alter table app_admins enable row level security;

create or replace function is_support_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists(select 1 from app_admins where email = auth.jwt()->>'email') $$;

drop policy if exists support_tickets_owner on support_tickets;
create policy support_tickets_owner on support_tickets for all to authenticated
  using (user_id = auth.uid() or is_support_admin())
  with check (user_id = auth.uid() or is_support_admin());

drop policy if exists support_messages_owner on support_messages;
create policy support_messages_owner on support_messages for all to authenticated
  using (ticket_id in (select id from support_tickets))
  with check (ticket_id in (select id from support_tickets));

drop policy if exists app_admins_read on app_admins;
create policy app_admins_read on app_admins for select to authenticated using (true);
