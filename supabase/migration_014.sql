-- Міграція 014: параметри оподаткування в профілі ФОП
--   ep_rate_percent — ставка ЄП місцевої ради для груп 1, 2
--                     (% прожиткового мінімуму / мінімальної зарплати); null = максимальна
--   esv_exempt      — звільнення від сплати ЄСВ за себе (ч. 4, 6 ст. 4 Закону № 2464-VI)
--   ep4_annual      — річна сума ЄП групи 4 (з декларації)
-- Значення tax_group = '4' обмежень у базі не потребує (колонка text без check).
--
-- ВИКОНАТИ ДО ДЕПЛОЮ КОДУ: без цих колонок збереження профілю ФОП поверне 400.

alter table fops add column if not exists ep_rate_percent numeric(5,2);
alter table fops add column if not exists esv_exempt boolean not null default false;
alter table fops add column if not exists ep4_annual numeric(14,2) not null default 0;
