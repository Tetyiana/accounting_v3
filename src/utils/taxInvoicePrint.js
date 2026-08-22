// Друкована форма податкової накладної.
// Форма затверджена наказом Мінфіну від 31.12.2015 № 1307
// у редакції наказу від 09.08.2024 № 400 (чинна з 01.10.2024).
//
// ПН існує лише в електронному вигляді (п. 201.1 ПКУ) — паперовий примірник
// потрібен для внутрішнього контролю і звірки з контрагентом, не для подання.
//
// Структура: шапка з відмітками, Розділ А (рядки I–XII), Розділ Б (графи 1–11
// із підграфами 3.1, 3.2.1, 3.2.2, 3.3).

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const money = (n) => (+n || 0).toLocaleString('uk-UA',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const moneyOrEmpty = (n) => (+n || 0) === 0 ? '' : money(n);

// Дата складання у ПН — ДДММРРРР без роздільників
const dateDigits = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}${m}${y}`;
};

// Коди ставок за Порядком № 1307 (графа 8 розділу Б)
export const VAT_RATE_CODES = {
  20:  { code: '20',  label: 'основна ставка 20 %' },
  7:   { code: '7',   label: 'ставка 7 %' },
  14:  { code: '14',  label: 'ставка 14 %' },
  901: { code: '901', label: 'експорт, ставка 0 %' },
  902: { code: '902', label: 'постачання на митній території, ставка 0 %' },
  903: { code: '903', label: 'звільнено від оподаткування' },
};

const STYLES = `
  @page { size: A4 landscape; margin: 8mm; }
  body { font-family: "Times New Roman", serif; font-size: 8pt; color:#000; margin:0; }
  table { width:100%; border-collapse: collapse; }
  td, th { border: 1px solid #000; padding: 2px 3px; vertical-align: middle; }
  .nb, .nb td, .nb th { border: none; }
  .c { text-align:center; } .r { text-align:right; } .b { font-weight:bold; }
  .hdr { font-size:7pt; text-align:right; line-height:1.3; }
  .title { text-align:center; font-weight:bold; font-size:12pt; margin:8px 0 2px; }
  .cap { font-size:6.5pt; text-align:center; color:#000; }
  .box { display:inline-block; width:12px; height:12px; border:1px solid #000;
         text-align:center; line-height:12px; font-weight:bold; margin-right:3px; }
  .fld { border-bottom:1px solid #000; display:inline-block; min-width:40mm; }
  .rn { width:34px; text-align:center; }
  .note { font-size:6pt; line-height:1.25; margin-top:5px; }
  .sumrow td { height:16px; }
`;

const box = (on) => `<span class="box">${on ? 'X' : ''}</span>`;

/**
 * @param {object} pn   { date, number, counterparty, counterpartyTin, counterpartyEdrpou,
 *                        amount (база без ПДВ), rate, items[], summary, reasonType,
 *                        isSummary, isExempt, notForBuyer }
 * @param {object} fop  активний ФОП (продавець)
 */
export function buildTaxInvoiceHtml(pn = {}, fop = {}) {
  const rate = +pn.rate === 0 ? 0 : (+pn.rate || 20);
  const items = (pn.items && pn.items.length)
    ? pn.items
    : [{
        name: pn.description || pn.summary || 'Послуги',
        unitName: 'послуга', unitCode: '', qty: 1,
        price: +pn.amount || 0, base: +pn.amount || 0,
      }];

  // Розділ Б
  const rows = items.map((it, i) => {
    const base = +it.base || (+it.qty || 1) * (+it.price || 0);
    const vat  = rate ? Math.round(base * rate) / 100 : 0;
    return { ...it, base, vat, n: i + 1 };
  });

  const totalBase = rows.reduce((s, x) => s + x.base, 0);
  const totalVat  = rows.reduce((s, x) => s + x.vat, 0);

  const bodyRows = rows.map((x) => `
<tr>
  <td class="rn">${x.n}</td>
  <td>${esc(x.name)}</td>
  <td class="c">${esc(x.uktzed || '')}</td>
  <td class="c">${x.isImport ? 'X' : ''}</td>
  <td class="c">${x.isOwnAgro ? 'X' : ''}</td>
  <td class="c">${esc(x.dkpp || '')}</td>
  <td class="c">${esc(x.unitName || '')}</td>
  <td class="c">${esc(x.unitCode || '')}</td>
  <td class="r">${(+x.qty || 0).toLocaleString('uk-UA', { maximumFractionDigits: 6 })}</td>
  <td class="r">${money(x.price)}</td>
  <td class="c">${rate ? VAT_RATE_CODES[rate]?.code || rate : '903'}</td>
  <td class="c">${esc(x.exemptionCode || '')}</td>
  <td class="r">${money(x.base)}</td>
  <td class="r">${moneyOrEmpty(x.vat)}</td>
</tr>`).join('');

  // Розділ А — рядки I–XII
  const secA = [
    ['І',    'Загальна сума коштів, що підлягають сплаті, з урахуванням податку на додану вартість', totalBase + totalVat],
    ['ІІ',   'Загальна сума податку на додану вартість, у тому числі:', totalVat],
    ['ІІІ',  'загальна сума податку на додану вартість за основною ставкою', rate === 20 ? totalVat : 0],
    ['ІV',   'загальна сума податку на додану вартість за ставкою 7 %',      rate === 7  ? totalVat : 0],
    ['V',    'загальна сума податку на додану вартість за ставкою 14 %',     rate === 14 ? totalVat : 0],
    ['VІ',   'Усього обсяги постачання за основною ставкою (код ставки 20)', rate === 20 ? totalBase : 0],
    ['VIІ',  'Усього обсяги постачання за ставкою 7 % (код ставки 7)',       rate === 7  ? totalBase : 0],
    ['VIІІ', 'Усього обсяги постачання за ставкою 14 % (код ставки 14)',     rate === 14 ? totalBase : 0],
    ['ІХ',   'Усього обсяги постачання при експорті товарів за ставкою 0 % (код ставки 901)', 0],
    ['Х',    'Усього обсяги постачання на митній території України за ставкою 0 % (код ставки 902)', 0],
    ['ХІ',   'Усього обсяги операцій, звільнених від оподаткування (код ставки 903)', pn.isExempt ? totalBase : 0],
    ['ХІІ',  'Дані щодо зворотної (заставної) тари', 0],
  ].map(([num, label, val]) => `
<tr class="sumrow">
  <td class="c" style="width:34px">${num}</td>
  <td>${label}</td>
  <td class="r" style="width:120px">${moneyOrEmpty(val)}</td>
</tr>`).join('');

  const [numMain, numSuffix] = String(pn.number || '').split('/');

  return `<!DOCTYPE html><html lang="uk"><head><meta charset="utf-8">
<title>Податкова накладна № ${esc(pn.number)} від ${esc(pn.date)}</title>
<style>${STYLES}</style></head><body>

<table class="nb"><tr>
  <td class="nb" style="width:58%">
    ${box(pn.isSummary)} Зведена податкова накладна<br>
    ${box(pn.isExempt)} Складена на операції, звільнені від оподаткування<br>
    ${box(!!pn.reasonType)} Не підлягає наданню отримувачу (покупцю) з причини
    <span class="fld" style="min-width:22mm">${esc(pn.reasonType || '')}</span>
    <div class="cap" style="text-align:left">(зазначається відповідний тип причини)</div>
  </td>
  <td class="nb hdr">
    ЗАТВЕРДЖЕНО<br>
    Наказ Міністерства фінансів України<br>
    31 грудня 2015 року № 1307<br>
    (у редакції наказу Міністерства фінансів України<br>
    від 09 серпня 2024 року № 400)
  </td>
</tr></table>

<div class="title">Податкова накладна</div>

<table class="nb"><tr>
  <td class="nb c" style="width:30%">
    <span class="fld b" style="min-width:34mm">${esc(dateDigits(pn.date))}</span>
    <div class="cap">(дата складання)</div>
  </td>
  <td class="nb c" style="width:30%">
    <span class="fld b" style="min-width:26mm">${esc(numMain || '')}</span>
    &nbsp;/&nbsp;
    <span class="fld" style="min-width:10mm">${esc(numSuffix || '')}</span>
    <div class="cap">(порядковий номер)</div>
  </td>
  <td class="nb"></td>
</tr></table>

<table style="margin-top:4px">
  <tr class="b c"><td style="width:50%">Постачальник (продавець)</td>
      <td style="width:50%">Отримувач (покупець)</td></tr>
  <tr>
    <td>${esc(fop.fullName || '')}</td>
    <td>${esc(pn.counterparty || '')}</td>
  </tr>
  <tr class="cap">
    <td>(найменування; прізвище, ім'я, по батькові — для фізичної особи – підприємця)</td>
    <td>(найменування; прізвище, ім'я, по батькові — для фізичної особи – підприємця)</td>
  </tr>
  <tr>
    <td>ІПН: <b>${esc(fop.vatIpn || fop.rnokpp || '')}</b>
        &nbsp;&nbsp;Податковий номер: ${esc(fop.rnokpp || '')} &nbsp;&nbsp;Код: 2</td>
    <td>ІПН: <b>${esc(pn.counterpartyTin || '')}</b>
        &nbsp;&nbsp;Податковий номер: ${esc(pn.counterpartyEdrpou || pn.counterpartyTin || '')}
        &nbsp;&nbsp;Код: ${esc(pn.counterpartyCodeSource || '')}</td>
  </tr>
  <tr class="cap">
    <td>(індивідуальний податковий номер) (податковий номер платника податку) (код)</td>
    <td>(індивідуальний податковий номер) (податковий номер платника податку) (код)</td>
  </tr>
</table>

<div class="b" style="margin:6px 0 2px">Розділ А</div>
<table>${secA}</table>

<div class="b" style="margin:6px 0 2px">Розділ Б</div>
<table>
  <tr class="b c">
    <td rowspan="2" class="rn">№ з/п</td>
    <td rowspan="2">Опис (номенклатура) товарів / послуг продавця</td>
    <td colspan="4">Код</td>
    <td colspan="2">Одиниця виміру товару / послуги</td>
    <td rowspan="2">Кількість (об'єм, обсяг)</td>
    <td rowspan="2">Ціна постачання одиниці товару / послуги без ПДВ</td>
    <td rowspan="2">Код ставки</td>
    <td rowspan="2">Код пільги</td>
    <td rowspan="2">Обсяги постачання (база оподаткування) без ПДВ</td>
    <td rowspan="2">Сума податку на додану вартість</td>
  </tr>
  <tr class="b c">
    <td>товару згідно з УКТ ЗЕД</td>
    <td>імпорт</td>
    <td>власна с/г продукція</td>
    <td>послуги згідно з ДКПП</td>
    <td>умовне позначення</td>
    <td>код</td>
  </tr>
  <tr class="c b">
    <td>1</td><td>2</td><td>3.1</td><td>3.2.1</td><td>3.2.2</td><td>3.3</td>
    <td>4</td><td>5</td><td>6</td><td>7</td><td>8</td><td>9</td><td>10</td><td>11</td>
  </tr>
  ${bodyRows}
  <tr class="b">
    <td colspan="12" class="r">Усього</td>
    <td class="r">${money(totalBase)}</td>
    <td class="r">${moneyOrEmpty(totalVat)}</td>
  </tr>
</table>

<div style="margin-top:8px;font-size:7.5pt">
  Суми податку на додану вартість, нараховані (сплачені) у зв'язку з постачанням
  товарів / послуг, зазначених у цій накладній, визначені правильно,
  відповідають сумі податкових зобов'язань продавця.
</div>

<table class="nb" style="margin-top:8px">
  <tr class="nb">
    <td class="nb" style="width:40%">
      Посадова (уповноважена) особа / фізична особа (законний представник)
    </td>
    <td class="nb" style="width:20%"><div id="fax-slot"></div></td>
    <td class="nb c" style="width:22%">
      <div style="border-bottom:1px solid #000;height:14px">${esc(fop.fullName || '')}</div>
      <div class="cap">(Власне ім'я ПРІЗВИЩЕ)</div>
    </td>
    <td class="nb c">
      <div style="border-bottom:1px solid #000;height:14px">${esc(fop.rnokpp || '')}</div>
      <div class="cap">(реєстраційний номер облікової картки платника податків)</div>
    </td>
  </tr>
</table>

<div class="note">
  Податкова накладна складається в електронній формі (п. 201.1 ПКУ) і реєструється
  в Єдиному реєстрі податкових накладних. Цей примірник — для внутрішнього
  контролю та звірки з контрагентом, поданням не є.
  ${pn.registered
    ? `Зареєстрована в ЄРПН${pn.registrationDate ? ' ' + esc(pn.registrationDate) : ''}.`
    : 'Станом на дату друку в ЄРПН не зареєстрована.'}
</div>

</body></html>`;
}
