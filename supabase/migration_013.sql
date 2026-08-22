-- Migration 013: журнал поданих декларацій платника єдиного податку.
--
-- Навіщо: декларація заповнюється наростаючим підсумком з початку року.
-- Рядок 13 «Нараховано за попередній звітний період» дорівнює рядку 12
-- декларації попереднього періоду, рядок 24 — рядку 23 відповідно.
-- Без збереженої історії ці рядки завжди нулі, і сума до сплати (рядок 14)
-- завищується на все, що вже сплачено за попередні квартали.
--
-- Виконати в Supabase → SQL Editor.
-- Перевірити хвіст запиту перед виконанням (iOS-клавіатура вставляє «Є»).

create table if not exists declarations (
  id            uuid primary key default gen_random_uuid(),
  fop_id        uuid not null references fops(id) on delete cascade,

  year          int  not null,
  period_id     int  not null check (period_id between 1 and 4), -- 1=І кв, 2=півріччя, 3=три квартали, 4=рік
  tax_group     text not null default '',       -- '1' | '2' | '3_5' | '3_3_vat'
  form_id       text not null default '',       -- F0103309 / F0103407

  -- Ключові показники, з яких наступний період бере рядки 13 і 24
  row12         numeric(14,2) default 0,        -- ЄП нараховано всього за період
  row14         numeric(14,2) default 0,        -- ЄП до сплати за підсумками періоду
  row21         numeric(14,2) default 0,        -- ЄСВ (лише в річній)
  row23         numeric(14,2) default 0,        -- ВЗ нараховано (гр. 3)
  row25         numeric(14,2) default 0,        -- ВЗ до сплати (гр. 3)
  row22         numeric(14,2) default 0,        -- ВЗ фіксований (гр. 1, 2)

  rows_json     jsonb default '{}'::jsonb,      -- повний набір рядків 01-29
  income        numeric(14,2) default 0,        -- загальний дохід за період (рядок 08)

  -- Джерело запису: 'auto' — зафіксовано при друку/вивантаженні,
  --                 'manual' — введено руками (перехід із іншої програми)
  source        text default 'auto' check (source in ('auto','manual')),
  submitted_at  date,                           -- дата фактичного подання, якщо відома
  notes         text default '',

  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Одна декларація на ФОП + рік + період. Повторний друк оновлює запис.
create unique index if not exists uq_declarations_period
  on declarations (fop_id, year, period_id);

create index if not exists declarations_fop_year_idx
  on declarations (fop_id, year);

alter table declarations enable row level security;
drop policy if exists declarations_owner on declarations;
create policy declarations_owner on declarations for all to authenticated
  using      (fop_id in (select id from fops where user_id = auth.uid()))
  with check (fop_id in (select id from fops where user_id = auth.uid()));

-- Звірка
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'declarations'
order by ordinal_position;