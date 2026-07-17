-- Модульні підписки: активні модулі на кожного ФОПа
create table if not exists subscriptions (
  id           uuid primary key default gen_random_uuid(),
  fop_id       uuid not null references fops(id) on delete cascade,
  module       text not null,           -- base | warehouse | payroll | vat | rro | hr
  active_until date,                    -- null = безстроково (тест-режим)
  created_at   timestamptz default now(),
  unique (fop_id, module)
);
alter table subscriptions enable row level security;
create policy subscriptions_owner on subscriptions for all
  using (fop_id in (select id from fops where user_id = auth.uid()))
  with check (fop_id in (select id from fops where user_id = auth.uid()));
