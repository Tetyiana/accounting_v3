-- Migration 009: критичні виправлення + договори
-- Виконати в Supabase → SQL Editor.

-- 1) Забутий стовпець invoices.notes (використовувався в UI без міграції)
alter table invoices add column if not exists notes text default '';

-- 2) Договори з контрагентами
create table if not exists contracts (
  id            uuid primary key default gen_random_uuid(),
  fop_id        uuid not null references fops(id) on delete cascade,
  counterparty_id uuid,             -- посилання на клієнта/постачальника (nullable для сумісності)
  counterparty_name text default '',
  number        text not null default '',
  date          date not null default current_date,
  valid_until   date,
  subject       text default '',    -- предмет договору
  total_amount  numeric(14,2) default 0,   -- сума договору (0 = без ліміту)
  status        text default 'active' check (status in ('active','completed','cancelled','paused')),
  notes         text default '',
  created_at    timestamptz default now()
);

alter table contracts enable row level security;
drop policy if exists contracts_owner on contracts;
create policy contracts_owner on contracts for all to authenticated
  using (fop_id in (select id from fops where user_id = auth.uid()))
  with check (fop_id in (select id from fops where user_id = auth.uid()));

-- 3) Прив'язка рахунку до договору (не обов'язкова)
alter table invoices add column if not exists contract_id uuid;

-- 4) Прив'язка платежу з журналу до рахунку/договору
alter table transactions add column if not exists invoice_id uuid;
alter table transactions add column if not exists contract_id uuid;
