# Підключення Supabase — покрокова інструкція

## 1. Створити проєкт
supabase.com → New project → назва `accounting-fop`, регіон EU (Frankfurt),
пароль бази згенерувати і зберегти.

## 2. Створити таблиці
Dashboard → SQL Editor → New query → вставити ВЕСЬ вміст файлу
`supabase/schema.sql` → Run. Має вивести "Success. No rows returned".

## 3. Увімкнути email-автентифікацію
Authentication → Providers → Email → увімкнено (за замовчуванням так).
Confirm email можна вимкнути для простоти на старті.

## 4. Взяти ключі
Project Settings → API:
- Project URL  → VITE_SUPABASE_URL
- anon public  → VITE_SUPABASE_ANON_KEY

## 5. Локально
Створити файл `.env` у корені проєкту (поруч з package.json)
за зразком `.env.example`, вставити ключі.

## 6. Для GitHub Pages
Settings → Secrets and variables → Actions → New repository secret:
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY
(і додати їх у workflow build step як env — зроблю в коді деплою)

Після цього повідом — переписую AuthContext/FopContext/DataContext на базу
і додаю міграцію даних з localStorage одним натисканням.
