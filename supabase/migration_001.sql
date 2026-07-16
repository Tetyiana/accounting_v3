-- Виправлення: колонки, яких бракувало таблиці fops
alter table fops add column if not exists is_active boolean not null default true;
alter table fops add column if not exists use_rro  boolean not null default false;
