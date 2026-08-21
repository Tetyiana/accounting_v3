-- Migration 011: ЄСВ 8,41% для працівників з інвалідністю, реєстрація ПН в ЄРПН,
-- ПДВ у складі надходження (для доходу ФОП 3 групи — платника ПДВ).
-- Виконати в Supabase → SQL Editor. Перевірити хвіст запиту (iOS-клавіатура вставляє «Є»!).

-- Працівники: підтверджена інвалідність → ЄСВ 8,41% (ч. 13 ст. 8 ЗУ № 2464-VI)
alter table employees add column if not exists has_disability      boolean default false;
alter table employees add column if not exists disability_doc_date date;

-- Нарахування: фіксуємо застосовану ставку ЄСВ, щоб звіт не «поїхав» заднім числом
alter table payroll_records add column if not exists esv_rate       numeric(6,4) default 0.22;
alter table payroll_records add column if not exists has_disability boolean default false;

-- Податкові накладні: факт реєстрації в ЄРПН. Зареєстровану ПН видалити не можна —
-- виправлення лише розрахунком коригування (РК).
alter table vat_invoices add column if not exists registered        boolean default false;
alter table vat_invoices add column if not exists registration_date date;
alter table vat_invoices add column if not exists source_act_id     uuid;
alter table vat_invoices add column if not exists source_invoice_number text default '';

-- Захист на рівні БД: заборона видалення зареєстрованої ПН
create or replace function block_registered_vat_invoice_delete()
returns trigger language plpgsql as $$
begin
  if old.registered then
    raise exception 'ПН № % від % зареєстрована в ЄРПН — видалення заборонено, оформіть РК',
      old.number, old.date;
  end if;
  return old;
end $$;

drop trigger if exists trg_block_registered_vat_delete on vat_invoices;
create trigger trg_block_registered_vat_delete
  before delete on vat_invoices
  for each row execute function block_registered_vat_invoice_delete();

-- Дублювання номера ПН за одну дату не допускається (п. 6 Порядку № 1307):
-- друга ПН з таким номером не буде зареєстрована в ЄРПН.
create unique index if not exists uq_vat_invoices_out_num_date
  on vat_invoices (fop_id, date, number)
  where direction = 'outgoing';

-- Сума ПДВ у складі надходження. До доходу платника ЄП ПДВ не включається
-- (пп. 1 п. 292.11 ПКУ) — декларація рахує дохід як amount - vat_amount.
alter table transactions add column if not exists vat_amount numeric(14,2) default 0;
