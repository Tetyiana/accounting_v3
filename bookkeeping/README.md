# Бухгалтерія ФОП

Локальний застосунок (React + Vite, PWA) для обліку доходів/витрат, складу,
дебіторів/кредиторів, ПДВ-накладних і документів ФОП. Усі дані зберігаються
в localStorage браузера — без бекенду.

## Запуск

```bash
npm install
npm run dev      # розробка
npm run build    # продакшн-білд у dist/
npm run preview  # перегляд білду локально
```

## Структура

```
src/
  context/     — Auth (логін/реєстрація), Settings (прапорці isVatPayer/useWarehouse), Data (журнал, склад, дебітори, ПДВ, кошик)
  constants/   — taxOptions.js (групи ФОП), tableConfigs.js (єдине джерело колонок усіх таблиць)
  utils/       — taxLogic.js (розрахунок податків по групах), parser.js (Excel/Word/PDF/фото → операція),
                 fileHandlers.js (банківські виписки CSV/MT940), accountingLogic.js, warehouseLogic.js, exportUtils.js, crypto.js
  components/  — Layout/MainLayout, Operations/UploadOperation+ReviewOperation, common/DynamicTable
  views/       — Home, Journal, Warehouse, Debtors, Documents, Reports, Vat, Trash, Settings
  pages/       — AuthPage (вхід/реєстрація)
```

## Важливі технічні рішення

- **Сховище даних:** localStorage (без Firebase). Кожна зміна одразу пишеться на диск; видалення —
  м'яке (записи переїжджають у Кошик), плюс ручний експорт/імпорт резервної копії в Налаштуваннях.
- **Пароль:** хешується (SHA-256 + сіль) перед збереженням, не зберігається у відкритому вигляді.
  Це не замінює повноцінний бекенд — справжня серверна авторизація вимагає окремого API.
- **Розпізнавання документів (OCR):** Tesseract.js, локально в браузері, без зовнішніх API і витрат.
  PDF без текстового шару (скани) — пропонується завантажити як фото. Якщо потрібна вища точність
  на складних таблицях — можна підключити хмарний Document AI чи інший API замість `runOCR`
  у `src/utils/parser.js` (потребує власного облікового запису й ключа).
- **Банківські виписки:** парсяться напряму з CSV (Monobank/PrivatBank) та базового MT940,
  без підключення до банківського API.
