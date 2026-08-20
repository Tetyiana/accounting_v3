-- Migration 010: реквізити замовника і примітка в актах
-- (використовуються у друкованій формі акта, але були відсутні в схемі)
-- Виконати в Supabase → SQL Editor. Перевірити хвіст запиту (iOS-клавіатура!).

alter table acts add column if not exists client_name    text default '';
alter table acts add column if not exists client_ipn     text default '';
alter table acts add column if not exists client_address text default '';
alter table acts add column if not exists notes          text default '';
alter table acts add column if not exists subtotal   numeric(14,2) default 0;
alter table acts add column if not exists vat_amount numeric(14,2) default 0;
alter table payments add column if not exists notes text default '';