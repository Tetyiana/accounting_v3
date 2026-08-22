-- Migration 012: колонки employees, яких бракувало.
-- Причина: EMPTY_EMPLOYEE надсилав leaveAccrued і notes, а в таблиці їх не було —
-- insert повертав 400 «Could not find the 'leave_accrued' column», працівник не зберігався.
-- Виконати в Supabase → SQL Editor. Перевірити хвіст запиту (iOS-клавіатура вставляє «Є»).

alter table employees add column if not exists leave_accrued numeric(5,1) default 0;
alter table employees add column if not exists notes         text default '';

-- Примітка щодо fire_date:
-- колонка вже існувала і в неї пише наказ про звільнення (HrOrders.jsx).
-- Форма працівника писала окреме поле terminationDate, якого в БД не було, —
-- у коді уніфіковано на fireDate. Нової колонки не потрібно.

-- Звірка
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'employees'
order by ordinal_position;
