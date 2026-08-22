// Синхронізація довідника ідентифікаторів електронних форм ДПС.
//
// Джерело: Реєстр електронних форм податкових документів, Державна податкова
// служба України, портал відкритих даних data.gov.ua
// https://data.gov.ua/dataset/9ea3566a-ce8e-47ca-bca1-8d2f625d1354
// Ліцензія: Creative Commons Attribution 4.0. Комерційне використання дозволене
// за умови посилання на джерело — воно зберігається у полі source вихідного файлу.
//
// Набір оновлюється щомісяця. Скрипт бере найсвіжіший ресурс, розкодовує
// з windows-1251, витягає ідентифікатори форм і пише src/constants/dpsForms.json.
//
// Запуск: npm run sync:forms

import fs from 'fs';
import path from 'path';

const DATASET_ID = '9ea3566a-ce8e-47ca-bca1-8d2f625d1354';
const CKAN_API   = `https://data.gov.ua/api/3/action/package_show?id=${DATASET_ID}`;
const OUT_FILE   = 'src/constants/dpsForms.json';

// Форми, які цікавлять застосунок. Префікс → підпис для людини.
const WANTED = [
  { prefix: 'F01033', label: 'Декларація платника ЄП — ФОП, 3 група (квартальна)' },
  { prefix: 'F01034', label: 'Декларація платника ЄП — ФОП, 1 і 2 групи (річна)' },
  { prefix: 'F01331', label: 'Додаток 1 (ЄСВ) до декларації ЄП, 3 група' },
  { prefix: 'F01332', label: 'Додаток 2 (МПЗ) до декларації ЄП, 3 група' },
  { prefix: 'F01341', label: 'Додаток 1 (ЄСВ) до декларації ЄП, 1 і 2 групи' },
  { prefix: 'F01342', label: 'Додаток 2 (МПЗ) до декларації ЄП, 1 і 2 групи' },
  { prefix: 'F01002', label: 'Декларація про майновий стан і доходи' },
  { prefix: 'F12010', label: 'Податкова накладна' },
  { prefix: 'F12011', label: 'Додаток 1 до податкової накладної' },
  { prefix: 'F12012', label: 'Розрахунок коригування до податкової накладної' },
  { prefix: 'F05101', label: 'Додаток ФІЗ-Д1 до об\'єднаної звітності' },
  { prefix: 'F05104', label: 'Додаток ФІЗ-4ДФ до об\'єднаної звітності' },
  { prefix: 'F05105', label: 'Додаток ФІЗ-Д5 до об\'єднаної звітності' },
  { prefix: 'F05106', label: 'Додаток ФІЗ-Д6 до об\'єднаної звітності' },
  { prefix: 'F05001', label: 'Податковий розрахунок (об\'єднана звітність), ФОП' },
  { prefix: 'J05001', label: 'Податковий розрахунок (об\'єднана звітність), юрособи' },
];

const FORM_ID_RE = /^[JF]\d{7}$/;

async function main() {
  process.stdout.write('Запит до CKAN API data.gov.ua… ');
  const meta = await fetch(CKAN_API).then((r) => r.json());
  if (!meta?.success) throw new Error('CKAN повернув помилку');
  console.log('ок');

  // Найсвіжіший ресурс з назвою виду reestr_form_YYYY-MM-DD_deklar.csv
  const resources = (meta.result.resources || [])
    .filter((r) => /reestr_form_\d{4}-\d{2}-\d{2}_deklar/i.test(r.name || r.url || ''))
    .sort((a, b) => String(b.name).localeCompare(String(a.name)));

  if (!resources.length) {
    console.error('Не знайдено ресурсу reestr_form_*_deklar.csv.');
    console.error('Перевір набір даних вручну:', `https://data.gov.ua/dataset/${DATASET_ID}`);
    process.exit(1);
  }

  const res = resources[0];
  console.log('Ресурс:', res.name);

  const buf = Buffer.from(await fetch(res.url).then((r) => r.arrayBuffer()));
  // Реєстр публікується у windows-1251
  const text = new TextDecoder('windows-1251').decode(buf);

  const lines = text.split(/\r?\n/).filter(Boolean);
  const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';

  // Структуру колонок не фіксуємо: шукаємо клітинку, що виглядає як ідентифікатор
  // форми, і беремо найдовшу текстову клітинку рядка як назву.
  // Реєстр публікується з поламаним екрануванням лапок, тому розбираємо
  // не як строгий CSV, а по рядках виду: "N,ІДЕНТИФІКАТОР,"додатки",назва,…
  // Важливо: додатки (зокрема РК до ПН) перелічені в другій колонці
  // основної форми, окремими записами вони не існують.
  const found = [];
  for (const line of lines) {
    const m = line.match(/^"?\d+,([JF]\d{7}),(.*)$/);
    if (!m) continue;
    const [, id, rest] = m;
    const clean = rest.replace(/""/g, '"');

    // Ідентифікатори з рядка: сама форма + усі її додатки
    const ids = [id, ...(clean.match(/[JF]\d{7}/g) || [])];
    // Назва форми — найдовший фрагмент у лапках або між комами
    const name = (clean.match(/"([^"]{15,300})"/g) || [])
      .map((x) => x.replace(/"/g, ''))
      .filter((x) => !/^[JF]\d{7}(,\s*[JF]\d{7})*$/.test(x.trim()))
      .sort((a, b) => b.length - a.length)[0] || '';

    for (const fid of new Set(ids)) {
      const want = WANTED.find((w) => fid.startsWith(w.prefix));
      if (!want) continue;
      found.push({
        id: fid, group: want.prefix, label: want.label,
        officialName: fid === id ? name.trim() : `${want.label} (до ${id})`,
        parent: fid === id ? null : id,
      });
    }
  }

  // На кожен префікс лишаємо найбільшу версію (останні дві цифри ідентифікатора)
  const byPrefix = new Map();
  for (const f of found) {
    const cur = byPrefix.get(f.group);
    if (!cur || f.id > cur.id) byPrefix.set(f.group, f);
  }

  const out = {
    source: `https://data.gov.ua/dataset/${DATASET_ID}`,
    sourceName: 'Реєстр електронних форм податкових документів, ДПС України',
    license: 'CC-BY 4.0',
    resource: res.name,
    syncedAt: new Date().toISOString().slice(0, 10),
    forms: Object.fromEntries([...byPrefix.values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((f) => [f.id, {
        label: f.label,
        officialName: f.officialName,
        parent: f.parent || undefined,
        schema: `${f.id}.xsd`,
      }])),
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + '\n', 'utf8');

  console.log(`\nЗаписано ${OUT_FILE}, форм: ${Object.keys(out.forms).length}\n`);
  for (const [id, f] of Object.entries(out.forms)) console.log(`  ${id}  ${f.label}`);

  // Порівняння з тим, що зашито в коді
  const xml = fs.existsSync('src/utils/xmlDps.js')
    ? fs.readFileSync('src/utils/xmlDps.js', 'utf8') : '';
  const inCode = [...xml.matchAll(/schema:\s*'([JF]\d{7})\.xsd'/g)].map((m) => m[1]);
  const stale = inCode.filter((id) => !out.forms[id]);
  if (stale.length) {
    console.log('\n⚠ У коді зашиті ідентифікатори, яких немає в актуальному реєстрі:');
    stale.forEach((id) => {
      const newer = Object.keys(out.forms).find((k) => k.slice(0, 6) === id.slice(0, 6));
      console.log(`  ${id}${newer ? `  →  ймовірно ${newer}` : '  (відповідника не знайдено)'}`);
    });
    process.exitCode = 1;
  } else if (inCode.length) {
    console.log('\nІдентифікатори в коді збігаються з реєстром.');
  }
}

main().catch((e) => {
  console.error('Помилка синхронізації:', e.message);
  console.error(`Перевір набір вручну: https://data.gov.ua/dataset/${DATASET_ID}`);
  process.exit(1);
});
