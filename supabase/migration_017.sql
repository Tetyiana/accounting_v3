-- Migration 017: зарплатний блок — накази про відпустку, табель, індексація,
-- лікарняні, реквізити ДПС для XML-звітності.
-- Виконати в Supabase → SQL Editor ДО деплою коду.

-- Працівник: стать (графа 6 ФІЗ-Д1), базовий місяць індексації,
-- відсоток лікарняних за страховим стажем, професія за Класифікатором (ФІЗ-Д5).
alter table employees add column if not exists gender text default '';
alter table employees add column if not exists index_base_month text default '';
alter table employees add column if not exists sick_percent numeric(5,2) default 100;
alter table employees add column if not exists kp_code text default '';
alter table employees add column if not exists kp_name text default '';

-- Відпустки й лікарняні: код зберігав поле type, а колонки не було —
-- записи не доходили до бази і зникали після перезавантаження.
alter table leave_records add column if not exists type text default 'annual';
alter table leave_records add column if not exists notes text default '';

-- Профіль ФОП: реквізити, без яких кабінет ДПС не приймає XML.
alter table fops add column if not exists dps_region text default '';
alter table fops add column if not exists dps_district text default '';
alter table fops add column if not exists dps_code text default '';
alter table fops add column if not exists dps_name text default '';
alter table fops add column if not exists katottg text default '';
alter table fops add column if not exists zip_code text default '';
alter table fops add column if not exists phone text default '';
alter table fops add column if not exists email text default '';

-- Нові типи кадрових наказів: відпустка щорічна і без збереження зарплати.
alter table hr_orders drop constraint if exists hr_orders_order_type_check;
alter table hr_orders add constraint hr_orders_order_type_check
  check (order_type in ('hire','transfer','dismiss','bonus','salary_change','leave','unpaid_leave'));
