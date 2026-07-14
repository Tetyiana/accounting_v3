-- ═══════════════════════════════════════════════════════════════
-- Облік ФОП — схема Supabase (PostgreSQL)
-- Виконати в Supabase Dashboard → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════════

-- ФОПи користувача
create table if not exists fops (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  full_name     text not null default '',
  rnokpp        text not null default '',
  tax_group     text not null default '3_5',
  is_vat_payer  boolean not null default false,
  use_warehouse boolean not null default false,
  use_rro       boolean not null default false,
  legal_address text default '',
  actual_address text default '',
  same_address  boolean default true,
  bank_accounts jsonb default '[]',
  main_kved     text default '',
  additional_kveds text default '',
  registration_date date,
  edr_record    text default '',
  ep_certificate text default '',
  vat_certificate text default '',
  checkbox_login text default '',
  checkbox_password text default '',
  checkbox_license_key text default '',
  facsimile     text,                -- base64 зображення
  xml_doc_ver   text default '01',
  notes         text default '',
  created_at    timestamptz default now()
);

-- Транзакції журналу (банк/каса)
create table if not exists transactions (
  id            uuid primary key default gen_random_uuid(),
  fop_id        uuid not null references fops(id) on delete cascade,
  date          date not null,
  type          text not null check (type in ('income','expense')),
  counterparty  text default '',
  amount        numeric(14,2) not null default 0,
  description   text default '',
  payment_method text default 'bank',
  invoice_payment_id uuid,
  created_at    timestamptz default now()
);

-- Рахунки (вихідні і вхідні)
create table if not exists invoices (
  id            uuid primary key default gen_random_uuid(),
  fop_id        uuid not null references fops(id) on delete cascade,
  direction     text not null check (direction in ('outgoing','incoming')),
  number        text not null default '',
  date          date not null,
  due_date      date,
  client_name   text default '',
  client_ipn    text default '',
  client_address text default '',
  items         jsonb default '[]',
  subtotal      numeric(14,2) default 0,
  vat_amount    numeric(14,2) default 0,
  total         numeric(14,2) default 0,
  status        text default 'draft',
  created_at    timestamptz default now()
);

-- Акти / накладні
create table if not exists acts (
  id            uuid primary key default gen_random_uuid(),
  fop_id        uuid not null references fops(id) on delete cascade,
  invoice_id    uuid references invoices(id) on delete cascade,
  direction     text default 'outgoing',
  number        text default '',
  date          date not null,
  act_type      text default 'act',
  items         jsonb default '[]',
  total         numeric(14,2) default 0,
  status        text default 'draft',
  created_at    timestamptz default now()
);

-- Оплати
create table if not exists payments (
  id            uuid primary key default gen_random_uuid(),
  fop_id        uuid not null references fops(id) on delete cascade,
  invoice_id    uuid references invoices(id) on delete cascade,
  direction     text default 'outgoing',
  date          date not null,
  amount        numeric(14,2) not null default 0,
  payment_method text default 'bank',
  acquiring_commission numeric(14,2) default 0,
  created_at    timestamptz default now()
);

-- Ручні борги (дебітори/кредитори)
create table if not exists debts (
  id            uuid primary key default gen_random_uuid(),
  fop_id        uuid not null references fops(id) on delete cascade,
  kind          text default 'debtor',
  counterparty  text default '',
  amount        numeric(14,2) default 0,
  due_date      date,
  note          text default '',
  created_at    timestamptz default now()
);

-- Податкові накладні (ПДВ)
create table if not exists vat_invoices (
  id            uuid primary key default gen_random_uuid(),
  fop_id        uuid not null references fops(id) on delete cascade,
  direction     text default 'outgoing',
  number        text default '',
  date          date,
  counterparty  text default '',
  amount        numeric(14,2) default 0,
  created_at    timestamptz default now()
);

-- Склад: рухи
create table if not exists movements (
  id            uuid primary key default gen_random_uuid(),
  fop_id        uuid not null references fops(id) on delete cascade,
  date          date not null,
  item_name     text not null,
  movement_type text not null,
  qty           numeric(14,3) default 0,
  price         numeric(14,2) default 0,
  note          text default '',
  created_at    timestamptz default now()
);

-- Працівники
create table if not exists employees (
  id            uuid primary key default gen_random_uuid(),
  fop_id        uuid not null references fops(id) on delete cascade,
  full_name     text not null default '',
  rnokpp        text default '',
  position      text default '',
  salary        numeric(14,2) default 0,
  iban          text default '',
  hire_date     date,
  fire_date     date,
  is_active     boolean default true,
  leave_entitlement numeric(5,1) default 24,
  leave_used    numeric(6,1) default 0,
  created_at    timestamptz default now()
);

-- Нарахування зарплати
create table if not exists payroll_records (
  id            uuid primary key default gen_random_uuid(),
  fop_id        uuid not null references fops(id) on delete cascade,
  employee_id   uuid not null references employees(id) on delete cascade,
  period        text not null,          -- '2026-06'
  data          jsonb not null default '{}',  -- весь розрахунок
  status        text default 'draft',
  created_at    timestamptz default now()
);

-- Відпустки
create table if not exists leave_records (
  id            uuid primary key default gen_random_uuid(),
  fop_id        uuid not null references fops(id) on delete cascade,
  employee_id   uuid not null references employees(id) on delete cascade,
  leave_type    text default 'annual',
  start_date    date not null,
  end_date      date,
  days          numeric(5,1) default 0,
  created_at    timestamptz default now()
);

-- Кадрові накази (Фаза 6)
create table if not exists hr_orders (
  id            uuid primary key default gen_random_uuid(),
  fop_id        uuid not null references fops(id) on delete cascade,
  employee_id   uuid not null references employees(id) on delete cascade,
  order_type    text not null check (order_type in ('hire','transfer','dismiss','bonus','salary_change')),
  order_number  text not null default '',
  order_date    date not null,
  effective_date date,
  details       jsonb default '{}',    -- посада/оклад/сума премії/підстава
  created_at    timestamptz default now()
);

-- Контрагенти
create table if not exists clients (
  id            uuid primary key default gen_random_uuid(),
  fop_id        uuid not null references fops(id) on delete cascade,
  name          text not null default '',
  ipn           text default '',
  phone         text default '',
  email         text default '',
  address       text default '',
  is_vat_payer  boolean default false,
  notes         text default '',
  created_at    timestamptz default now()
);

-- Номенклатура
create table if not exists products (
  id            uuid primary key default gen_random_uuid(),
  fop_id        uuid not null references fops(id) on delete cascade,
  name          text not null default '',
  unit          text default 'шт',
  price         numeric(14,2) default 0,
  vat_rate      text default 'no_vat',
  notes         text default '',
  created_at    timestamptz default now()
);

-- Кошик (м'яке видалення)
create table if not exists trash (
  id            uuid primary key default gen_random_uuid(),
  fop_id        uuid not null references fops(id) on delete cascade,
  entity_type   text not null,
  entity_data   jsonb not null,
  deleted_at    timestamptz default now()
);

-- ═══ Індекси ═══
create index if not exists idx_tx_fop_date  on transactions(fop_id, date);
create index if not exists idx_inv_fop      on invoices(fop_id, direction);
create index if not exists idx_pay_fop      on payments(fop_id);
create index if not exists idx_emp_fop      on employees(fop_id);
create index if not exists idx_orders_emp   on hr_orders(employee_id);
create index if not exists idx_clients_fop  on clients(fop_id);

-- ═══ Row Level Security: кожен бачить лише свої дані ═══
alter table fops enable row level security;
create policy fops_owner on fops for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Для дочірніх таблиць: доступ через володіння ФОПом
do $$
declare t text;
begin
  foreach t in array array['transactions','invoices','acts','payments','debts',
    'vat_invoices','movements','employees','payroll_records','leave_records',
    'hr_orders','clients','products','trash']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I_owner on %I for all
       using (fop_id in (select id from fops where user_id = auth.uid()))
       with check (fop_id in (select id from fops where user_id = auth.uid()))', t, t);
  end loop;
end $$;
