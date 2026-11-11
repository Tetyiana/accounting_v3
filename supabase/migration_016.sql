-- Міграція 016: склад
-- Форма складу записувала поля operation, batch, sku, description, яких у таблиці
-- не було, а обов'язкова колонка movement_type лишалась порожньою — жоден рух
-- складу в базу не зберігався. Додаємо колонки і знімаємо обов'язковість.

alter table movements alter column movement_type drop not null;
alter table movements alter column movement_type set default '';

alter table movements add column if not exists operation    text default 'in';   -- in | out
alter table movements add column if not exists kind         text default '';     -- purchase | sale | writeoff | ...
alter table movements add column if not exists unit         text default 'шт';
alter table movements add column if not exists batch        text default '';
alter table movements add column if not exists sku          text default '';
alter table movements add column if not exists counterparty text default '';
alter table movements add column if not exists description  text default '';

-- Старі записи (якщо є): тип операції з movement_type
update movements set operation = movement_type
 where movement_type in ('in', 'out') and (operation is null or operation = 'in');

