-- Migration 008: розширений набір типів транзакцій + поворотна фін.допомога
-- Виконати в Supabase → SQL Editor.

-- Розширюємо перелік типів: refund_out, refund_in, non_income
alter table transactions drop constraint if exists transactions_type_check;
alter table transactions add constraint transactions_type_check
  check (type in ('income', 'expense', 'refund_out', 'refund_in', 'non_income'));

-- Категорія для non_income:
--   own_funds            — власні кошти на рахунок ФОПа
--   fin_aid_returnable   — поворотна фін.допомога (стає доходом після 365 днів)
--   loan                 — кредит / позика
--   transfer             — переказ між власними рахунками
--   overpayment_return   — повернення помилково переказаних коштів
--   personal_use         — особисті потреби (для expense; при знятті готівки на себе)
--   other                — інше
alter table transactions add column if not exists non_income_category text default '';

-- Планова дата повернення (для fin_aid_returnable, за замовчуванням +365 днів від date)
alter table transactions add column if not exists expected_return_date date;

-- Прапорець «повернено» — виставляється вручну або автоматично при створенні
-- refund_out з посиланням на цю транзакцію
alter table transactions add column if not exists mat_dop_returned boolean default false;

-- Посилання рефанду на оригінальну fin_aid_returnable транзакцію
alter table transactions add column if not exists refund_of_transaction_id uuid;
