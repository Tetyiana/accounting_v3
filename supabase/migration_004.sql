-- Migration 004: ставки ПДВ (20/14/7/0) і розрахунки коригування (РК)
-- Виконати в Supabase → SQL Editor. Перевірити хвіст запиту (iOS-клавіатура!).

alter table vat_invoices add column if not exists rate numeric(5,2) not null default 20;
alter table vat_invoices add column if not exists kind text not null default 'pn' check (kind in ('pn','rk'));
