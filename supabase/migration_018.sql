-- Migration 018: «фіксована» індексація працівника (п. 5 Порядку № 1078).
-- Виконати в Supabase → SQL Editor ДО деплою коду.
alter table employees add column if not exists index_fixed numeric(10,2) default 0;
