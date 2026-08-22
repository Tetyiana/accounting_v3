// Звірка полів, які надсилає код, з колонками в supabase/schema.sql + міграціях.
// Запуск: npm run check:schema
//
// Навіщо: розходження схеми з кодом дає insert 400 і МОВЧАЗНУ втрату даних.
// Ловилося вже тричі (vat_certificate, acts.*, employees.leave_accrued).
// Скрипт статичний — читає SQL-файли, до бази не звертається.

import fs from 'fs';
import path from 'path';

const SQL_DIR = 'supabase';
const TYPES = 'uuid|text|numeric|boolean|int|integer|bigint|date|timestamptz|jsonb';

// ── 1. Колонки з schema.sql + усіх міграцій ──────────────────────────
const sqlFiles = [
  path.join(SQL_DIR, 'schema.sql'),
  ...fs.readdirSync(SQL_DIR)
    .filter(f => /^migration_\d+\.sql$/.test(f))
    .sort()
    .map(f => path.join(SQL_DIR, f)),
].filter(f => fs.existsSync(f));

const cols = {};
for (const file of sqlFiles) {
  const sql = fs.readFileSync(file, 'utf8');
  for (const m of sql.matchAll(/create table if not exists (\w+)\s*\(([\s\S]*?)\n\);/g)) {
    const t = m[1];
    cols[t] ??= new Set();
    for (const line of m[2].split('\n')) {
      const c = line.trim().match(new RegExp(`^(\\w+)\\s+(${TYPES})`));
      if (c) cols[t].add(c[1]);
    }
  }
  for (const m of sql.matchAll(/alter table (\w+)\s+add column if not exists (\w+)/g)) {
    cols[m[1]] ??= new Set();
    cols[m[1]].add(m[2]);
  }
}

// ── 2. camelCase → snake_case, як у src/lib/db.js ────────────────────
const SPECIAL = { useRRO: 'use_rro' };
const snake = (k) => SPECIAL[k] || k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());

// ── 3. Константи-«форми» → таблиці ───────────────────────────────────
// Ключі верхнього рівня цих об'єктів мають існувати як колонки.
const SHAPES = [
  { file: 'src/constants/payrollTypes.js',  konst: 'EMPTY_EMPLOYEE', table: 'employees' },
  { file: 'src/constants/fopFields.js',     konst: 'EMPTY_FOP',      table: 'fops' },
  { file: 'src/constants/documentTypes.js', konst: 'EMPTY_INVOICE',  table: 'invoices' },
  { file: 'src/constants/documentTypes.js', konst: 'EMPTY_ACT',      table: 'acts' },
  { file: 'src/constants/documentTypes.js', konst: 'EMPTY_PAYMENT',  table: 'payments' },
];

// Поля, які додає DataContext або мапер, — не з константи
const EXTRA = { '*': ['id', 'fopId', 'createdAt'] };
// Поля, які свідомо НЕ їдуть у БД (мапер їх згортає або відкидає)
// RENAME — поля, які мапер перейменовує перед вставкою (actToRow тощо)
const RENAME = { acts: { type: 'actType' } };
const IGNORE = {
  invoices: ['items'],
  acts:     ['items'],
  employees: [],
  fops:     [],
  payments: [],
};

let problems = 0;
console.log('Звірка полів коду з колонками БД\n');

for (const { file, konst, table } of SHAPES) {
  if (!fs.existsSync(file)) { console.log(`  ?  ${konst}: немає файлу ${file}`); continue; }
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(new RegExp(`(?:export )?const ${konst} = \\{([\\s\\S]*?)\\n\\};`));
  if (!m) { console.log(`  ?  ${konst}: не знайдено в ${file}`); continue; }

  const keys = [...m[1].matchAll(/^\s{2}(\w+)\s*:/gm)].map((x) => x[1]);
  const ignore = new Set([...(IGNORE[table] || []), ...EXTRA['*']]);
  const missing = keys
    .filter((k) => !ignore.has(k))
    .map((k) => snake(RENAME[table]?.[k] || k))
    .filter((c) => !cols[table]?.has(c));

  if (missing.length) {
    problems++;
    console.log(`  ✗  ${table.padEnd(14)} ${konst} — немає колонок: ${missing.join(', ')}`);
  } else {
    console.log(`  ✓  ${table.padEnd(14)} ${konst}`);
  }
}

console.log('');
if (problems) {
  console.log(`Знайдено розходжень: ${problems}. Потрібна нова міграція — інакше`);
  console.log('insert поверне 400 і дані загубляться мовчки.');
  process.exit(1);
}
console.log('Розходжень не знайдено.');
