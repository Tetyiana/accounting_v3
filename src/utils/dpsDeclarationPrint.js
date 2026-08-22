// Друкована форма податкової декларації платника єдиного податку –
// фізичної особи – підприємця (наказ Мінфіну від 19.06.2015 № 578
// у редакції наказу від 31.01.2025 № 57).
//
// Відтворює структуру офіційного бланка: розділи I–VIII, коди рядків,
// текст назв показників і формули в дужках — як у затвердженій формі.
// Додаток 1 «Відомості про суми нарахованого доходу застрахованих осіб
// та суми нарахованого єдиного внеску» друкується окремою сторінкою.

import { MONTHS_UA, DECL_ORDER, DECL_FORM_ID } from './dpsDeclaration';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const money = (n) => (+n || 0) === 0
  ? ''
  : (+n).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const box = (on) => `<span class="box">${on ? 'X' : ''}</span>`;

const STYLES = `
  @page { size: A4 portrait; margin: 10mm 8mm; }
  body { font-family: "Times New Roman", serif; font-size: 8.5pt; color:#000; margin:0; }
  table { width:100%; border-collapse: collapse; }
  td, th { border: 1px solid #000; padding: 2px 4px; vertical-align: middle; }
  .no-border, .no-border td { border: none; }
  .c { text-align:center; } .r { text-align:right; } .b { font-weight:bold; }
  .sec { background:#e8e8e8; font-weight:bold; text-align:center; padding:3px; }
  .code { text-align:center; width:52px; font-weight:bold; }
  .sum  { text-align:right;  width:110px; }
  .box { display:inline-block; width:14px; height:14px; border:1px solid #000;
         text-align:center; line-height:14px; font-weight:bold; margin:0 2px; }
  .hdr { font-size:7.5pt; text-align:right; line-height:1.25; }
  .title { text-align:center; font-weight:bold; font-size:11pt; margin:6px 0; }
  .fld { border-bottom:1px solid #000; display:inline-block; min-width:60mm; }
  .note { font-size:6.5pt; line-height:1.3; margin-top:6px; }
  .pagebreak { page-break-before: always; }
  .mono { font-family:"Courier New",monospace; letter-spacing:1px; }
`;

// Рядок таблиці показників: назва | код | сума
const row = (label, code, value, cls = '') => `
<tr class="${cls}">
  <td>${label}</td>
  <td class="code">${code}</td>
  <td class="sum">${money(value)}</td>
</tr>`;

const sectionHead = (title) =>
  `<tr><td class="sec" colspan="3">${title}</td></tr>`;

const colHead = () => `
<tr class="b c">
  <td>Назва показника</td><td class="code">Код рядка</td><td class="sum">Обсяг (грн, коп)</td>
</tr>`;

/**
 * @param {object} decl   результат buildDeclaration()
 * @param {object} fop    активний ФОП
 * @param {object} opts   { year, declType: 'Звітна'|'Звітна нова'|'Уточнююча', controlBody, kveds }
 */
export function buildDeclarationHtml(decl, fop = {}, opts = {}) {
  const { rows: r, period, esvRows, esvTotal, vzMonthMarks, meta } = decl;
  const year = opts.year || new Date().getFullYear();
  const declType = opts.declType || 'Звітна';
  const empCount = opts.employeesCount ?? 0;

  const periodMarks = [1, 2, 3, 4]
    .map((id) => box(period.id === id))
    .join('');

  const vzCells = MONTHS_UA.map((_, i) =>
    `<td class="c" style="width:7%">${String(i + 1).padStart(2, '0')}<br>${box(vzMonthMarks[i])}</td>`
  ).join('');

  // ── Сторінка 1: шапка + розділи I–IV ──────────────────────────────
  const page1 = `
<table class="no-border"><tr>
  <td style="width:55%"></td>
  <td class="hdr">
    ЗАТВЕРДЖЕНО<br>${esc(DECL_ORDER)}<br>
    Ідентифікатор форми ${esc(DECL_FORM_ID)}
  </td>
</tr></table>

<div class="title">Податкова декларація<br>
платника єдиного податку – фізичної особи – підприємця</div>

<table>
  <tr>
    <td style="width:52%">
      01 Звітна ${box(declType === 'Звітна')}
      02 Звітна нова ${box(declType === 'Звітна нова')}
      03 Уточнююча ${box(declType === 'Уточнююча')}
      04 Довідково ${box(declType === 'Довідково')}
    </td>
    <td>
      2. Податковий (звітний) період: ${periodMarks}
      &nbsp;(І кв. · півріччя · три квартали · рік) &nbsp;<b>${year}</b> р.
    </td>
  </tr>
  <tr><td colspan="2">4. ${esc(opts.controlBody || '____________________________________________')}
    <div style="font-size:6.5pt">(найменування контролюючого органу, до якого подається звітність)</div></td></tr>
  <tr><td colspan="2">5. Платник податку: <b>${esc(fop.fullName)}</b></td></tr>
  <tr><td colspan="2">6. Податкова адреса: ${esc(fop.legalAddress || fop.actualAddress || '')}
    &nbsp;&nbsp;Тел.: ${esc(fop.phone || '')}</td></tr>
  <tr><td colspan="2">7. Реєстраційний номер облікової картки платника податку:
    <span class="mono b">${esc(fop.rnokpp)}</span></td></tr>
</table>

<table style="margin-top:4px">
  ${sectionHead('І. Загальні показники підприємницької діяльності')}
  <tr><td colspan="2">9. Фактична чисельність найманих працівників у звітному періоді (осіб)</td>
      <td class="sum b">${empCount}</td></tr>
  <tr><td colspan="3">10. Види підприємницької діяльності у звітному періоді:<br>
      ${esc(opts.kveds || fop.mainKved || '')}</td></tr>
</table>

<table style="margin-top:4px">
  ${sectionHead('ІІ. Показники господарської діяльності для платників єдиного податку першої групи')}
  ${colHead()}
  ${row('Обсяг доходу за звітний (податковий) період відповідно до статті 292 глави 1 розділу XIV ПКУ (згідно з пп. 1 п. 291.4 ст. 291)', '01', r['01'])}
  ${row('Обсяг доходу, що оподаткований за ставкою 15 відсотків (згідно з п. 293.4 ст. 293)', '02', r['02'])}
</table>

<table style="margin-top:4px">
  ${sectionHead('ІІІ. Показники господарської діяльності для платників єдиного податку другої групи')}
  ${colHead()}
  ${row('Обсяг доходу за звітний (податковий) період відповідно до статті 292 глави 1 розділу XIV ПКУ (згідно з пп. 2 п. 291.4 ст. 291)', '03', r['03'])}
  ${row('Обсяг доходу, що оподаткований за ставкою 15 відсотків (згідно з п. 293.4 ст. 293)', '04', r['04'])}
</table>

<table style="margin-top:4px">
  ${sectionHead('ІV. Показники господарської діяльності для платників єдиного податку третьої групи')}
  ${colHead()}
  ${row('Обсяг доходу за звітний (податковий) період, що оподатковується за ставкою 3 %', '05', r['05'])}
  ${row('Обсяг доходу за звітний (податковий) період, що оподатковується за ставкою 5 %', '06', r['06'])}
  ${row('Обсяг доходу, що оподаткований за ставкою 15 відсотків (згідно з п. 293.4 ст. 293)', '07', r['07'])}
</table>`;

  // ── Сторінка 2: розділи V–VIII ────────────────────────────────────
  const page2 = `
<div class="pagebreak"></div>
<table>
  ${sectionHead('V. Визначення податкових зобов\'язань по єдиному податку')}
  ${colHead()}
  ${row('Загальна сума доходу за звітний (податковий) період (сума значень рядків 01 + 02 + 03 + 04 + 05 + 06 + 07)', '08', r['08'])}
  ${row('Сума податку за ставкою 15 % ((рядок 02 + рядок 04 + рядок 07) × 15 %)', '09', r['09'])}
  ${row('Сума податку за ставкою 3 % (рядок 05 × 3 %)', '10', r['10'])}
  ${row('Сума податку за ставкою 5 % (рядок 06 × 5 %)', '11', r['11'])}
  ${row('Нараховано всього за звітний (податковий) період (рядок 09 + рядок 10 + рядок 11)', '12', r['12'], 'b')}
  ${row('Нараховано за попередній звітний (податковий) період (значення рядка 12 декларації попереднього періоду)', '13', r['13'])}
  ${row('Сума єдиного податку, яка підлягає нарахуванню та сплаті в бюджет за підсумками поточного звітного (податкового) періоду (рядок 12 – рядок 13)', '14.1', r['14.1'])}
  ${row('Позитивне значення різниці між сумою загального мінімального податкового зобов\'язання та загальною сумою сплачених податків (рядок 04 графи 3 розділу ІІ додатка 2)', '14.2', r['14.2'])}
  ${row('Загальна сума єдиного податку, яка підлягає нарахуванню та сплаті в бюджет за підсумками поточного звітного (податкового) періоду (рядок 14.1 + рядок 14.2)', '14', r['14'], 'b')}
</table>

<table style="margin-top:4px">
  ${sectionHead('VІ. Визначення податкових зобов\'язань по єдиному податку у зв\'язку з виправленням самостійно виявлених помилок')}
  ${colHead()}
  ${row('Сума єдиного податку, яка підлягала перерахуванню до бюджету, за даними звітного періоду, в якому виявлена помилка (рядок 14 відповідної декларації)', '15', r['15'])}
  ${row('Уточнена сума податкових зобов\'язань єдиного податку за звітний (податковий) період, у якому виявлена помилка', '16', r['16'])}
  ${row('Збільшення суми, яка підлягала перерахуванню до бюджету (рядок 16 – рядок 15, якщо рядок 16 &gt; рядка 15)', '17', r['17'])}
  ${row('Зменшення суми, яка підлягала перерахуванню до бюджету (рядок 16 – рядок 15, якщо рядок 16 &lt; рядка 15)', '18', r['18'])}
  ${row('Сума штрафу, яка нарахована платником податку самостійно у зв\'язку з виправленням помилки', '19', r['19'])}
  ${row('Сума пені, яка нарахована платником податку самостійно відповідно до пп. 129.1.3 п. 129.1 ст. 129 ПКУ', '20', r['20'])}
</table>

<table style="margin-top:4px">
  ${sectionHead('VІI. Визначення зобов\'язань із сплати єдиного внеску за даними звітного (податкового) періоду')}
  ${colHead()}
  ${row('Сума єдиного внеску, яка підлягає сплаті на небюджетні рахунки, за даними звітного (податкового) періоду (рядок "Усього" графа 4 розділу 9 додатка 1)', '21', r['21'], 'b')}
</table>

<table style="margin-top:4px">
  ${sectionHead('VІІI. Визначення податкових зобов\'язань по військовому збору')}
  <tr><td colspan="3" style="padding:0">
    <table style="border:none">
      <tr><td colspan="12" style="border:none;font-size:7.5pt">
        Відмітка про щомісячні авансові внески військового збору платників єдиного податку першої, другої груп
      </td></tr>
      <tr>${vzCells}</tr>
    </table>
  </td></tr>
  ${colHead()}
  <tr><td colspan="3" class="b" style="background:#f5f5f5">1. Для платників єдиного податку першої, другої груп</td></tr>
  ${row('Сума військового збору, нарахованого за ставкою 10 % розміру мінімальної заробітної плати, встановленої законом на 01 січня податкового (звітного) року, з розрахунку на календарний місяць та сплаченого за період перебування на спрощеній системі оподаткування платником єдиного податку першої, другої груп (МЗП × 10 % × кількість місяців)', '22', r['22'], 'b')}
  <tr><td colspan="3" class="b" style="background:#f5f5f5">2. Для платників єдиного податку третьої групи</td></tr>
  ${row('Сума військового збору за ставкою 1 % для платників єдиного податку третьої групи ((рядок 05 + рядок 06 + рядок 07) × 1 %)', '23', r['23'])}
  ${row('Нараховано військового збору за попередній звітний (податковий) період (значення рядка 23 декларації попереднього періоду)', '24', r['24'])}
  ${row('Сума військового збору, яка підлягає нарахуванню та сплаті в бюджет за підсумками поточного звітного періоду для платників єдиного податку третьої групи (рядок 23 – рядок 24)', '25', r['25'], 'b')}
  ${row('Сума військового збору, яка підлягала перерахуванню до бюджету, за даними раніше поданого звітного періоду, в якому виявлена помилка (рядок 25 відповідної декларації)', '26', r['26'])}
  ${row('Уточнена сума податкових зобов\'язань військового збору за звітний період, у якому виявлена помилка', '27', r['27'])}
  ${row('Збільшення суми військового збору, яка підлягала перерахуванню до бюджету (рядок 27 – рядок 26, якщо рядок 27 &gt; рядка 26)', '28', r['28'])}
  ${row('Зменшення суми військового збору, яка підлягала перерахуванню до бюджету (рядок 27 – рядок 26, якщо рядок 27 &lt; рядка 26)', '29', r['29'])}
</table>

<table class="no-border" style="margin-top:10px">
  <tr class="no-border">
    <td class="no-border" style="width:45%">Дата подання декларації: «___» __________ ${year} р.</td>
    <td class="no-border" style="width:25%"><div id="fax-slot"></div></td>
    <td class="no-border">
      <div style="border-bottom:1px solid #000;height:16px"></div>
      <div style="font-size:6.5pt;text-align:center">
        (підпис) &nbsp; ${esc(fop.fullName)}
      </div>
    </td>
  </tr>
</table>

<div class="note">
  Показники заповнюються наростаючим підсумком з початку року у гривнях з двома
  десятковими знаками після коми. Форма — ${esc(DECL_ORDER)}.
  Декларація подається в електронній формі через Електронний кабінет платника;
  паперовий примірник — для внутрішнього контролю.
</div>`;

  // ── Сторінка 3: Додаток 1 (ЄСВ) ───────────────────────────────────
  const esvBody = esvRows.map((x, i) => `
<tr>
  <td>${esc(x.month)}</td>
  <td class="sum">${money(x.base)}</td>
  <td class="c" style="width:80px">${x.ratePercent ? x.ratePercent.toFixed(2).replace('.', ',') : ''}</td>
  <td class="sum">${money(x.amount)}</td>
</tr>`).join('');

  const page3 = `
<div class="pagebreak"></div>
<table class="no-border"><tr>
  <td style="width:55%"></td>
  <td class="hdr">Додаток 1<br>до податкової декларації платника єдиного податку –
    фізичної особи – підприємця</td>
</tr></table>

<div class="title">Відомості<br>
про суми нарахованого доходу застрахованих осіб та суми нарахованого єдиного внеску</div>

<table>
  <tr><td colspan="4">1. Реєстраційний номер облікової картки платника податків:
    <span class="mono b">${esc(fop.rnokpp)}</span></td></tr>
  <tr><td colspan="4">3. Прізвище, ім'я, по батькові: <b>${esc(fop.fullName)}</b></td></tr>
  <tr><td colspan="4">4. Податковий (звітний) період: ${periodMarks} &nbsp;<b>${year}</b> р.</td></tr>
  <tr><td colspan="4">7. Код основного виду економічної діяльності: ${esc(fop.mainKved || '')}</td></tr>
  <tr><td colspan="4">8.1 Код категорії застрахованої особи: <b>${esc(meta.insuredPersonCategory)}</b>
    <span style="font-size:6.5pt">(ФОП на спрощеній системі оподаткування)</span></td></tr>
</table>

<table style="margin-top:4px">
  ${sectionHead('9. Визначення сум нарахованого доходу застрахованих осіб та суми нарахованого єдиного внеску')}
  <tr class="b c">
    <td>Місяць</td>
    <td class="sum">Самостійно визначена сума доходу, на яку нараховується єдиний внесок, з урахуванням максимальної величини</td>
    <td>Розмір єдиного внеску, відсоток</td>
    <td class="sum">Сума єдиного внеску, яка підлягає сплаті на небюджетні рахунки (графа 2 × графа 3)</td>
  </tr>
  <tr class="c b"><td>1</td><td>2</td><td>3</td><td>4</td></tr>
  ${esvBody}
  <tr class="b"><td>УСЬОГО</td><td class="c">Х</td><td class="c">Х</td>
      <td class="sum">${money(esvTotal)}</td></tr>
</table>

<table class="no-border" style="margin-top:10px">
  <tr class="no-border">
    <td class="no-border" style="width:55%">Наведена інформація є вірною:</td>
    <td class="no-border">
      <div style="border-bottom:1px solid #000;height:16px"></div>
      <div style="font-size:6.5pt;text-align:center">(підпис) &nbsp; ${esc(fop.fullName)}</div>
    </td>
  </tr>
</table>

<div class="note">
  Додаток 1 подається платниками єдиного податку першої – третьої груп, які є
  платниками єдиного внеску відповідно до п. 4 ч. 1 ст. 4 Закону України
  «Про збір та облік єдиного внеску…» від 08.07.2010 № 2464-VI.
  Особи, звільнені від сплати єдиного внеску за себе (ч. 4 і 6 ст. 4 того ж Закону),
  Додаток 1 не подають, крім випадку добровільної участі у страхуванні.
</div>`;

  return `<!DOCTYPE html><html lang="uk"><head><meta charset="utf-8">
<title>Декларація платника ЄП — ${esc(fop.fullName)} — ${year}</title>
<style>${STYLES}</style></head><body>
${page1}${page2}${page3}
</body></html>`;
}
