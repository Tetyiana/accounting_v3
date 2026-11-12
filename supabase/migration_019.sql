-- Migration 019: ПДВ (види ПН, позиції, коригування, підстава), роздрібний акциз, ліцензії.
-- Виконати в Supabase → SQL Editor ДО деплою коду.

-- Податкові накладні й розрахунки коригування
alter table vat_invoices add column if not exists counterparty_tin text default '';
alter table vat_invoices add column if not exists buyer_ipn text default '';
alter table vat_invoices add column if not exists description text default '';
alter table vat_invoices add column if not exists items jsonb;
alter table vat_invoices add column if not exists spec text default '';
alter table vat_invoices add column if not exists reason_type text default '';
alter table vat_invoices add column if not exists consolidated_code text default '';
alter table vat_invoices add column if not exists basis text default 'manual';
alter table vat_invoices add column if not exists source_invoice_id uuid;
alter table vat_invoices add column if not exists corrected_id uuid;
alter table vat_invoices add column if not exists reason_code text default '';

-- Довідники: ІПН платника ПДВ у контрагента; коди та ознака підакцизного товару
alter table clients add column if not exists vat_ipn text default '';
alter table products add column if not exists uktzed text default '';
alter table products add column if not exists is_excise boolean default false;

-- Чек ПРРО: вартість підакцизних товарів у чеку (база роздрібного акцизу)
alter table transactions add column if not exists excise_base numeric(14,2) default 0;

-- Ліцензії (алкоголь, тютюн, пальне) і ручні дані акцизної декларації — у профілі ФОП
alter table fops add column if not exists licenses jsonb;
