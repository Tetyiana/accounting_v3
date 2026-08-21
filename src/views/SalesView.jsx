import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useData } from '../context/DataContext';
import { useSettings } from '../context/SettingsContext';
import { useFop } from '../context/FopContext';
import AttachmentsList from '../components/common/AttachmentsList';
import {
  INVOICE_STATUSES, ACT_TYPES, PAYMENT_METHODS, VAT_RATES, UNITS,
  EMPTY_INVOICE, EMPTY_ACT, EMPTY_PAYMENT, EMPTY_ITEM,
} from '../constants/documentTypes';
import {
  calcDocTotals, calcItemAmounts, calcInvoiceStatus,
  calcInvoicePaid, fmtMoney,
} from '../utils/documentLogic';
import Autocomplete from '../components/common/Autocomplete';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { openPrintWindow } from '../utils/printWindow';



const DOC_PRINT_STYLE = `
  body{font-family:Arial,Helvetica,sans-serif;font-size:12px;margin:30px;color:#111}
  h2{font-size:16px;text-align:center;margin:16px 0 4px}
  .center{text-align:center} .right{text-align:right}
  table{width:100%;border-collapse:collapse;margin:12px 0}
  td,th{border:1px solid #aaa;padding:5px 8px}
  th{background:#f0f0f0;font-weight:600}
  .total-row td{font-weight:700;background:#f8f8f8}
  .sig{margin-top:40px;display:flex;justify-content:space-between}
  @media print{body{margin:15mm}}
`;

const docHeaderHtml = (activeFop, mainIban) => `
<table style="border:none;margin-bottom:0">
  <tr>
    <td style="border:none;width:60%">
      <b>ФОП ${activeFop?.fullName||''}</b><br>
      РНОКПП: ${activeFop?.rnokpp||''}
      ${mainIban?.iban ? `<br>IBAN: ${mainIban.iban} (${mainIban.bankName||''})` : ''}
      ${activeFop?.legalAddress ? `<br>${activeFop.legalAddress}` : ''}
    </td>
    <td style="border:none;text-align:right">
      ${activeFop?.mainKved ? `КВЕД: ${activeFop.mainKved}` : ''}
    </td>
  </tr>
</table>`;

const docSignatureHtml = (activeFop) => `
<div class="sig">
  <div>ФОП ${activeFop?.fullName||''}<br><div id="fax-slot"></div>___________________________<br><small>(підпис)</small></div>
  <div style="text-align:right">М.П.</div>
</div>`;

// Простий рамковий договір про надання послуг / поставку товарів
const buildContractHtml = (inv, activeFop, settings) => {
  const mainIban = activeFop?.bankAccounts?.find(a => a.isMain) || activeFop?.bankAccounts?.[0];
  const subj = (inv.items || []).some(it => (it.unit || '').match(/послуга|год/i))
    ? 'надання послуг'
    : 'поставку товару';
  const totalsNow = calcDocTotals(inv.items || []);
  const itemsList = (inv.items || []).map((it, i) =>
    `${i + 1}. ${it.name} — ${it.qty} ${it.unit || 'шт'} × ${fmtMoney(it.price)} = ${fmtMoney((+it.qty || 0) * (+it.price || 0))} грн`
  ).join('<br>');

  return `<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8">
<title>Договір №${inv.number}</title>${DOC_PRINT_STYLE}</head><body>
<h2 style="text-align:center">ДОГОВІР № ${inv.number}<br><small style="font-weight:normal">про ${subj}</small></h2>
<p style="display:flex;justify-content:space-between"><span>м. ${activeFop?.legalAddressCity || 'Київ'}</span><span>${inv.date}</span></p>

<p><b>ФОП ${activeFop?.fullName || ''}</b> (РНОКПП ${activeFop?.rnokpp || ''}), надалі — «Виконавець/Постачальник», з однієї сторони,
та <b>${inv.clientName || ''}</b>${inv.clientIpn ? ` (ЄДРПОУ/РНОКПП ${inv.clientIpn})` : ''}, надалі — «Замовник/Покупець», з іншої сторони,
уклали цей Договір про таке:</p>

<h3>1. Предмет договору</h3>
<p>1.1. Виконавець зобов'язується ${subj === 'надання послуг' ? 'надати послуги' : 'поставити товар'} згідно з переліком, наведеним у п. 1.2, а Замовник — прийняти та оплатити їх.</p>
<p>1.2. Перелік та вартість:</p>
<p style="margin-left:20px">${itemsList}</p>
<p><b>Загальна сума: ${fmtMoney(totalsNow.total)} грн${settings.isVatPayer ? ' (у т.ч. ПДВ 20%)' : ' (без ПДВ)'}.</b></p>

<h3>2. Порядок оплати</h3>
<p>2.1. Оплата здійснюється у безготівковій формі на поточний рахунок Виконавця${mainIban?.iban ? ` (IBAN ${mainIban.iban})` : ''} протягом 5 (п'яти) банківських днів з дати отримання рахунку.</p>
<p>2.2. Обов'язок Замовника з оплати вважається виконаним з моменту зарахування коштів на рахунок Виконавця.</p>

<h3>3. Права та обов'язки Сторін</h3>
<p>3.1. Виконавець зобов'язується ${subj === 'надання послуг' ? 'надати послуги якісно та у строк, погоджений Сторонами' : 'поставити товар належної якості, у кількості та в строк, погоджені Сторонами'}.</p>
<p>3.2. Замовник зобов'язується прийняти ${subj === 'надання послуг' ? 'надані послуги' : 'поставлений товар'} та своєчасно їх оплатити.</p>
<p>3.3. Приймання оформлюється ${subj === 'надання послуг' ? 'Актом наданих послуг' : 'Видатковою накладною'}, який підписується Сторонами.</p>

<h3>4. Відповідальність Сторін</h3>
<p>4.1. За невиконання або неналежне виконання зобов'язань Сторони несуть відповідальність згідно з чинним законодавством України.</p>
<p>4.2. У разі прострочення оплати Замовник сплачує пеню у розмірі подвійної облікової ставки НБУ від суми заборгованості за кожен день прострочення.</p>

<h3>5. Строк дії та інші умови</h3>
<p>5.1. Договір набирає чинності з моменту підписання Сторонами і діє до повного виконання зобов'язань.</p>
<p>5.2. Усі зміни та доповнення оформлюються додатковими угодами.</p>
<p>5.3. Спори вирішуються шляхом переговорів, а у разі недосягнення згоди — у судовому порядку.</p>

<h3>6. Реквізити Сторін</h3>
<table style="width:100%; border:none; margin-top:8px"><tr>
<td style="width:50%; vertical-align:top; border:none; padding:0 8px 0 0">
  <b>Виконавець/Постачальник:</b><br>
  ФОП ${activeFop?.fullName || ''}<br>
  РНОКПП: ${activeFop?.rnokpp || ''}<br>
  Адреса: ${activeFop?.legalAddress || ''}<br>
  ${mainIban ? `IBAN: ${mainIban.iban}<br>Банк: ${mainIban.bankName || ''}<br>` : ''}
  ${activeFop?.phone ? `Тел.: ${activeFop.phone}<br>` : ''}
</td>
<td style="width:50%; vertical-align:top; border:none; padding:0 0 0 8px">
  <b>Замовник/Покупець:</b><br>
  ${inv.clientName || ''}<br>
  ${inv.clientIpn ? `ЄДРПОУ/РНОКПП: ${inv.clientIpn}<br>` : ''}
  ${inv.clientAddress ? `Адреса: ${inv.clientAddress}<br>` : ''}
</td>
</tr></table>

<div style="margin-top:30px; display:flex; justify-content:space-between">
  <div><b>Виконавець:</b><br>ФОП ${activeFop?.fullName || ''}<br><div id="fax-slot"></div>___________________________<br><small>(підпис)</small><br>М.П.</div>
  <div><b>Замовник:</b><br>${inv.clientName || ''}<br><br><br>___________________________<br><small>(підпис)</small><br>М.П.</div>
</div>
<script>window.onload=()=>window.print()</script>
</body></html>`;
};

// Друк рахунку (нового або вже збереженого)
const buildInvoiceHtml = (inv, activeFop, settings) => {
  const mainIban = activeFop?.bankAccounts?.find(a => a.isMain) || activeFop?.bankAccounts?.[0];
  // Факсиміле накладається через openPrintWindow за галочкою «з факсиміле»
  const totalsNow = calcDocTotals(inv.items || []);

  const itemRows = (inv.items || []).map((it, i) => {
    const { subtotal, vatAmount, total } = calcItemAmounts(it);
    return settings.isVatPayer
      ? `<tr><td>${i+1}</td><td>${it.name||''}</td><td>${it.qty}</td><td>${it.unit}</td>
         <td align="right">${fmtMoney(it.price)}</td><td align="right">${fmtMoney(vatAmount)}</td>
         <td align="right"><b>${fmtMoney(total)}</b></td></tr>`
      : `<tr><td>${i+1}</td><td>${it.name||''}</td><td>${it.qty}</td><td>${it.unit}</td>
         <td align="right">${fmtMoney(it.price)}</td><td align="right"><b>${fmtMoney(subtotal)}</b></td></tr>`;
  }).join('');

  const vatHeader = settings.isVatPayer
    ? '<th>Ціна, грн</th><th>ПДВ, грн</th><th>Сума, грн</th>'
    : '<th>Ціна, грн</th><th>Сума, грн</th>';

  return `<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8">
<title>Рахунок №${inv.number}</title>
<style>${DOC_PRINT_STYLE}</style></head><body>
${docHeaderHtml(activeFop, mainIban)}
<h2>РАХУНОК-ФАКТУРА № ${inv.number||'—'}</h2>
<p class="center">від ${inv.date||''} ${inv.dueDate?`· Термін оплати: ${inv.dueDate}`:''}</p>
<table style="border:none;border-top:2px solid #333;border-bottom:2px solid #333;padding:8px 0">
  <tr>
    <td style="border:none">Платник: <b>${inv.clientName||'—'}</b>
    ${inv.clientIpn ? ` | ЄДРПОУ/ІПН: ${inv.clientIpn}` : ''}
    ${inv.clientAddress ? `<br>${inv.clientAddress}` : ''}</td>
  </tr>
</table>
<table>
  <thead><tr><th>№</th><th>Найменування товару/послуги</th><th>К-сть</th><th>Од.</th>${vatHeader}</tr></thead>
  <tbody>${itemRows}</tbody>
  <tfoot>
    ${settings.isVatPayer ? `
    <tr class="total-row"><td colspan="6" align="right">Без ПДВ:</td><td align="right">${fmtMoney(totalsNow.subtotal)} грн</td></tr>
    <tr class="total-row"><td colspan="6" align="right">ПДВ 20%:</td><td align="right">${fmtMoney(totalsNow.vatAmount)} грн</td></tr>
    <tr class="total-row"><td colspan="6" align="right"><b>Разом до сплати:</b></td><td align="right"><b>${fmtMoney(totalsNow.total)} грн</b></td></tr>
    ` : `
    <tr class="total-row"><td colspan="5" align="right"><b>Разом до сплати:</b></td><td align="right"><b>${fmtMoney(totalsNow.total)} грн</b></td></tr>
    `}
  </tfoot>
</table>
${docSignatureHtml(activeFop)}
<script>window.onload=()=>window.print()</script>
</body></html>`;
};

// Друк акту / накладної
const buildActHtml = (act, activeFop, settings) => {
  const mainIban = activeFop?.bankAccounts?.find(a => a.isMain) || activeFop?.bankAccounts?.[0];
  // Факсиміле накладається через openPrintWindow за галочкою «з факсиміле»
  const totalsNow = calcDocTotals(act.items || []);
  const docLabel = ACT_TYPES.find(t => t.id === act.type)?.label || 'Акт';
  const isDeliveryNote = act.type === 'delivery_note';

  const itemRows = (act.items || []).map((it, i) => {
    const { subtotal, vatAmount, total } = calcItemAmounts(it);
    return settings.isVatPayer
      ? `<tr><td>${i+1}</td><td>${it.name||''}</td><td>${it.qty}</td><td>${it.unit}</td>
         <td align="right">${fmtMoney(it.price)}</td><td align="right">${fmtMoney(vatAmount)}</td>
         <td align="right"><b>${fmtMoney(total)}</b></td></tr>`
      : `<tr><td>${i+1}</td><td>${it.name||''}</td><td>${it.qty}</td><td>${it.unit}</td>
         <td align="right">${fmtMoney(it.price)}</td><td align="right"><b>${fmtMoney(subtotal)}</b></td></tr>`;
  }).join('');

  const vatHeader = settings.isVatPayer
    ? '<th>Ціна, грн</th><th>ПДВ, грн</th><th>Сума, грн</th>'
    : '<th>Ціна, грн</th><th>Сума, грн</th>';

  return `<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8">
<title>${docLabel} №${act.number}</title>
<style>${DOC_PRINT_STYLE}</style></head><body>
${docHeaderHtml(activeFop, mainIban)}
<h2>${docLabel.toUpperCase()} № ${act.number||'—'}</h2>
<p class="center">від ${act.date||''}</p>
${isDeliveryNote ? `
<table style="border:none;margin:8px 0">
  <tr><td style="border:none;width:50%">
    <b>Постачальник:</b> ФОП ${activeFop?.fullName||''}${activeFop?.rnokpp?`, РНОКПП ${activeFop.rnokpp}`:''}
    ${activeFop?.legalAddress?`<br>${activeFop.legalAddress}`:''}
  </td><td style="border:none">
    <b>Одержувач:</b> ${act.clientName||'—'}${act.clientIpn?`, ЄДРПОУ/ІПН ${act.clientIpn}`:''}
    ${act.clientAddress?`<br>${act.clientAddress}`:''}
  </td></tr>
</table>
${act.invoiceNumber ? `<p>Підстава: рахунок №${act.invoiceNumber}</p>` : ''}
` : `
<p>Виконавець: <b>ФОП ${activeFop?.fullName||''}</b>${activeFop?.rnokpp?` (РНОКПП ${activeFop.rnokpp})`:''}, з однієї сторони, та
Замовник: <b>${act.clientName||'—'}</b>${act.clientIpn?` (ЄДРПОУ/ІПН ${act.clientIpn})`:''}${act.clientAddress?`, ${act.clientAddress}`:''}, з іншої сторони,
склали цей акт про те, що Виконавцем надано, а Замовником прийнято наступні роботи (послуги):</p>
`}
<table>
  <thead><tr><th>№</th><th>${isDeliveryNote ? 'Найменування товару' : 'Найменування робіт (послуг)'}</th><th>К-сть</th><th>Од.</th>${vatHeader}</tr></thead>
  <tbody>${itemRows}</tbody>
  <tfoot>
    ${settings.isVatPayer ? `
    <tr class="total-row"><td colspan="6" align="right">Без ПДВ:</td><td align="right">${fmtMoney(totalsNow.subtotal)} грн</td></tr>
    <tr class="total-row"><td colspan="6" align="right">ПДВ 20%:</td><td align="right">${fmtMoney(totalsNow.vatAmount)} грн</td></tr>
    <tr class="total-row"><td colspan="6" align="right"><b>Разом:</b></td><td align="right"><b>${fmtMoney(totalsNow.total)} грн</b></td></tr>
    ` : `
    <tr class="total-row"><td colspan="5" align="right"><b>Разом:</b></td><td align="right"><b>${fmtMoney(totalsNow.total)} грн</b></td></tr>
    `}
  </tfoot>
</table>
${isDeliveryNote ? `
<div class="sig">
  <div>
    <b>Відпустив:</b><br>ФОП ${activeFop?.fullName||''}<br><div id="fax-slot"></div>
    ___________________________<br><small>(підпис)</small>
  </div>
  <div>
    <b>Отримав:</b><br>${act.clientName||''}<br><br>
    За довіреністю № _______ від _______________<br>
    Посада: ___________________ ПІБ: ___________________<br>
    ___________________________<br><small>(підпис)</small>
  </div>
` : `
<p>Роботи (послуги) виконано в повному обсязі, у визначений термін. Замовник претензій щодо обсягу, якості та строків виконання робіт (надання послуг) не має.</p>
<div class="sig">
  <div>
    <b>Виконавець:</b><br>ФОП ${activeFop?.fullName||''}<br><div id="fax-slot"></div>
    ___________________________<br><small>(підпис)</small>
  </div>
  <div>
    <b>Замовник:</b><br>${act.clientName||''}<br><br>
    Посада: ___________________ ПІБ: ___________________<br>
    ___________________________<br><small>(підпис)</small>
  </div>
`}
</div>
<script>window.onload=()=>window.print()</script>
</body></html>`;
};

const STATUS_BADGE = {
  draft:     'badge--muted',
  sent:      'badge--warning',
  partial:   'badge--warning',
  paid:      'badge--success',
  cancelled: 'badge--danger',
  overdue:   'badge--danger',
  advance:   'badge--info',
};

// Наскрізна нумерація в межах року. Беремо МАКСИМУМ уже виданих номерів,
// а не їх кількість: після видалення документа номер не має повторюватись.
const mkNum = (list, prefix, dateStr) => {
  const year = (dateStr || new Date().toISOString()).slice(0, 4);
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  const max = list.reduce((m, i) => {
    if ((i.date||'').slice(0,4) !== year) return m;
    const hit = re.exec(i.number || '');
    return hit ? Math.max(m, +hit[1]) : m;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
};

// Податкові накладні — нумерація в межах календарного місяця, тільки ВИДАНІ.
// Вхідні ПН нумерує постачальник — вони не зсувають власну нумерацію.
// Номер ПН: лише цифри, не може починатися з «0» (п. 6 Порядку № 1307,
// ЗІР 101.27), тому padStart не застосовуємо.
const mkVatNum = (vatInvoices, dateStr) => {
  const monthKey = (dateStr || new Date().toISOString()).slice(0, 7);
  const max = vatInvoices.reduce((m, v) => {
    if (v.direction !== 'outgoing' || (v.date||'').slice(0,7) !== monthKey) return m;
    const n = parseInt(String(v.number || '').split('/')[0], 10);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return String(max + 1);
};

// Автовизначення типу документа за одиницями вимірювання позицій рахунку:
// послуга/год → акт, будь-яка товарна одиниця → накладна
const SERVICE_UNITS = ['год', 'послуга'];
const inferDocType = (items = []) =>
  items.length > 0 && items.every(it => SERVICE_UNITS.includes(it.unit)) ? 'act' : 'delivery_note';

// ─── Компоненти форм ────────────────────────────────────────────────

const ItemsTable = ({ items, onChange, vatEnabled, productOptions = [] }) => {
  const setItem = (idx, field, val) =>
    onChange(items.map((it, i) => i === idx ? { ...it, [field]: val } : it));

  const handleProductSelect = (idx, product) => {
    onChange(items.map((it, i) => i === idx ? {
      ...it,
      name:    product.label,
      unit:    product.unit    || it.unit,
      price:   product.price   || it.price,
      vatRate: product.vatRate || it.vatRate,
    } : it));
  };

  const addItem = () => onChange([...items, {
    ...EMPTY_ITEM, id: Date.now().toString(),
  }]);

  const removeItem = (idx) => onChange(items.filter((_, i) => i !== idx));

  return (
    <div className="table-wrap" style={{ marginBottom: 8 }}>
      <datalist id="units-list">
        {UNITS.map(u => <option key={u} value={u} />)}
      </datalist>
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: '40%' }}>Найменування</th>
            <th style={{ textAlign: 'right' }}>К-сть</th>
            <th>Один.</th>
            <th style={{ textAlign: 'right' }}>Ціна, грн</th>
            {vatEnabled && <th>ПДВ</th>}
            <th style={{ textAlign: 'right' }}>Сума, грн</th>
            <th style={{ width: 28 }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => {
            const { total } = calcItemAmounts(it);
            return (
              <tr key={it.id || idx}>
                <td>
                  <Autocomplete
                    value={it.name}
                    onChange={v => setItem(idx, 'name', v)}
                    options={productOptions}
                    onSelect={(p) => handleProductSelect(idx, p)}
                    placeholder="Назва"
                  />
                </td>
                <td>
                  <input className="table-input table-input--right" type="number"
                    value={it.qty} min="0" step="any"
                    onChange={e => setItem(idx, 'qty', e.target.value)} />
                </td>
                <td>
                  <input className="table-input" list="units-list" value={it.unit || ''}
                    onChange={e => setItem(idx, 'unit', e.target.value)}
                    placeholder="од." />
                </td>
                <td>
                  <input className="table-input table-input--right" type="number"
                    value={it.price} min="0" step="0.01" placeholder="0.00"
                    onChange={e => setItem(idx, 'price', e.target.value)} />
                </td>
                {vatEnabled && (
                  <td>
                    <select className="table-input" value={it.vatRate}
                      onChange={e => setItem(idx, 'vatRate', e.target.value)}>
                      {VAT_RATES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                    </select>
                  </td>
                )}
                <td style={{ textAlign: 'right', fontWeight: 600 }}>
                  {fmtMoney(total)}
                </td>
                <td>
                  {items.length > 1 && (
                    <button className="btn-icon btn-icon--del" onClick={() => removeItem(idx)}>✕</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="btn btn--ghost btn--sm" onClick={addItem}>+ Рядок</button>
        <div style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>
          {(() => { const t = calcDocTotals(items); return (
            <>
              {vatEnabled ? <>Без ПДВ: <b>{fmtMoney(t.subtotal)}</b></> : <>Сума: <b>{fmtMoney(t.subtotal)}</b></>}
              {vatEnabled && t.vatAmount > 0 && <> · ПДВ: <b>{fmtMoney(t.vatAmount)}</b></>}
              {vatEnabled && t.vatAmount === 0 && <span style={{color:'var(--warning)'}}> · оберіть ставку ПДВ у рядку</span>}
              {' '} · Разом: <b style={{ color: 'var(--text)' }}>{fmtMoney(t.total)}</b>
            </>
          );})()}
        </div>
      </div>
    </div>
  );
};

// ─── Форма рахунку ───────────────────────────────────────────────────
const InvoiceForm = ({ initial, direction, onSave, onCancel, invoiceList, clientOptions, productOptions }) => {
  const { settings } = useSettings();
  const { activeFop } = useFop();
  const [form, setForm] = useState(() => ({
    ...EMPTY_INVOICE,
    ...initial,
    direction,
    number: initial?.number || mkNum(invoiceList, direction === 'outgoing' ? 'РАХ' : 'ВХ', initial?.date || EMPTY_INVOICE.date),
  }));

  const set = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));
  const totals = calcDocTotals(form.items);

  const handleSave = () => {
    try {
      if (!form.clientName?.trim()) { alert('Вкажіть контрагента'); return; }
      if (!form.items?.length) { alert('Додайте хоча б один рядок'); return; }
      if (form.items.some(it => !it.name?.trim())) { alert('Заповніть найменування у всіх рядках'); return; }
      const t = calcDocTotals(form.items);
      onSave({ ...form, ...t });
    } catch(e) {
      console.error('Помилка збереження рахунку:', e);
      alert('Помилка збереження: ' + (e.message || String(e)));
    }
  };

  // Баг 4: генерація рахунку через HTML+window.print() — підтримує кирилицю без embedded шрифтів
  const handlePdf = () => {
    try {
      openPrintWindow(buildInvoiceHtml(form, activeFop, settings), { fop: activeFop });
    } catch(e) {
      console.error('Помилка генерації рахунку:', e);
      alert('Помилка: ' + (e.message || String(e)));
    }
  };

  const handleShare = () => handlePdf(); // Web Share через вікно браузера



  return (
    <div className="inline-form">
      <div className="inline-form-header">
        <span>{direction === 'outgoing' ? 'Рахунок клієнту' : 'Вхідний рахунок'}</span>
        <div style={{display:'flex', gap:6}}>
          <button className="btn btn--ghost btn--sm" onClick={handlePdf} title="Зберегти PDF">⇩ PDF</button>
          <button className="btn-close" onClick={onCancel}>✕</button>
        </div>
      </div>
      {!settings.isVatPayer && (
        <div className="cell-muted" style={{fontSize:'.8rem', marginBottom:8}}>
          ⓘ ПДВ не застосовується (не платник ПДВ у налаштуваннях ФОП)
        </div>
      )}
      <div className="form-row-4" style={{ marginBottom: 12 }}>
        <div className="field">
          <label>Номер</label>
          <input name="number" value={form.number} onChange={set} />
        </div>
        <div className="field">
          <label>Дата</label>
          <input type="date" name="date" value={form.date} onChange={set} />
        </div>
        <div className="field">
          <label>Контрагент <span className="req">*</span></label>
          <Autocomplete
            value={form.clientName}
            onChange={v => setForm(p => ({ ...p, clientName: v }))}
            options={clientOptions}
            onSelect={c => setForm(p => ({
              ...p, clientName: c.label,
              clientIpn: c.ipn || p.clientIpn,
              clientAddress: c.address || p.clientAddress,
            }))}
            placeholder="Назва або ПІБ"
          />
        </div>
        <div className="field">
          <label>Термін оплати</label>
          <input type="date" name="dueDate" value={form.dueDate} onChange={set} />
        </div>
      </div>
      <div className="form-row-2" style={{ marginBottom: 12 }}>
        <div className="field">
          <label>ІПН/ЄДРПОУ контрагента</label>
          <input name="clientIpn" value={form.clientIpn || ''} onChange={set} placeholder="1234567890" />
        </div>
        <div className="field">
          <label>Адреса контрагента</label>
          <input name="clientAddress" value={form.clientAddress || ''} onChange={set} />
        </div>
      </div>
      <ItemsTable
        items={form.items}
        onChange={items => setForm(p => ({ ...p, items }))}
        vatEnabled={settings.isVatPayer}
        productOptions={productOptions}
      />
      {form.id && activeFop && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '.85rem', fontWeight: 500, marginBottom: 6 }}>Прикріплені файли</div>
          <AttachmentsList fopId={activeFop.id} entityType="invoice" entityId={form.id} />
        </div>
      )}
      <div className="form-actions">
        <button className="btn btn--primary" onClick={handleSave}>Зберегти рахунок</button>
        <button className="btn btn--ghost" onClick={handlePdf}>⇩ PDF</button>
        <button className="btn btn--ghost" onClick={onCancel}>Скасувати</button>
      </div>
    </div>
  );
};

// ─── Форма акту / накладної ─────────────────────────────────────────
const ActForm = ({ invoice, initial, onSave, onCancel, actList, forcedType }) => {
  const { settings } = useSettings();
  const { activeFop } = useFop();
  const inferredType = initial?.type || forcedType || inferDocType(invoice.items);
  const [form, setForm] = useState(initial ? { ...initial } : {
    ...EMPTY_ACT,
    invoiceId:  invoice.id,
    direction:  invoice.direction,
    type:       inferredType,
    clientName:    invoice.clientName,
    clientIpn:     invoice.clientIpn || '',
    clientAddress: invoice.clientAddress || '',
    items:      invoice.items?.map(it => ({ ...it })) || [],
    number:     mkNum(actList, inferredType === 'act' ? 'АКТ' : 'НАК', invoice.date),
  });
  const set = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));
  const totals = calcDocTotals(form.items);

  const handleSave = () => {
    if (!form.date) { alert('Вкажіть дату'); return; }
    onSave({ ...form, ...totals });
  };

  const handlePrint = () => {
    try {
      openPrintWindow(buildActHtml(form, activeFop, settings), { fop: activeFop });
    } catch(e) {
      console.error('Помилка генерації акту:', e);
      alert('Помилка: ' + (e.message || String(e)));
    }
  };

  return (
    <div className="inline-form" style={{ marginLeft: 16, borderLeft: '3px solid var(--mint-300)' }}>
      <div className="inline-form-header">
        <span>Новий акт / накладна до рах. №{invoice.number}</span>
        <div style={{display:'flex', gap:6}}>
          <button className="btn btn--ghost btn--sm" onClick={handlePrint} title="Друк">⇩ PDF</button>
          <button className="btn-close" onClick={onCancel}>✕</button>
        </div>
      </div>
      <div className="form-row-4" style={{ marginBottom: 12 }}>
        <div className="field">
          <label>Тип</label>
          <select name="type" value={form.type} onChange={set}>
            {ACT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Номер</label>
          <input name="number" value={form.number} onChange={set} />
        </div>
        <div className="field">
          <label>Дата</label>
          <input type="date" name="date" value={form.date} onChange={set} />
        </div>
        <div className="field">
          <label>Статус</label>
          <select name="status" value={form.status} onChange={set}>
            <option value="draft">Чернетка</option>
            <option value="signed">Підписано</option>
          </select>
        </div>
      </div>
      <div className="form-row-3" style={{ marginBottom: 12 }}>
        <div className="field">
          <label>Контрагент (покупець/замовник)</label>
          <input name="clientName" value={form.clientName} onChange={set} placeholder="Назва або ПІБ" />
        </div>
        <div className="field">
          <label>ІПН/ЄДРПОУ контрагента</label>
          <input name="clientIpn" value={form.clientIpn} onChange={set} placeholder="1234567890" />
        </div>
        <div className="field">
          <label>Адреса контрагента</label>
          <input name="clientAddress" value={form.clientAddress} onChange={set} />
        </div>
      </div>
      <ItemsTable items={form.items} onChange={items => setForm(p => ({ ...p, items }))} vatEnabled={settings.isVatPayer} />
      {form.id && activeFop && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '.85rem', fontWeight: 500, marginBottom: 6 }}>Прикріплені файли</div>
          <AttachmentsList fopId={activeFop.id} entityType={form.type === 'delivery_note' ? 'delivery_note' : 'act'} entityId={form.id} />
        </div>
      )}
      <div className="form-actions">
        <button className="btn btn--primary" onClick={handleSave}>Зберегти акт</button>
        <button className="btn btn--ghost" onClick={handlePrint}>⇩ PDF</button>
        <button className="btn btn--ghost" onClick={onCancel}>Скасувати</button>
      </div>
    </div>
  );
};

// ─── Форма платежу ───────────────────────────────────────────────────
const PaymentForm = ({ invoice, invoicePaid, onSave, onCancel }) => {
  const remaining = (+invoice.total || 0) - invoicePaid;
  const [form, setForm] = useState({
    ...EMPTY_PAYMENT,
    invoiceId: invoice.id,
    direction: invoice.direction,
    amount:    remaining > 0 ? remaining.toFixed(2) : '',
  });
  const set = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  return (
    <div className="inline-form" style={{ marginLeft: 16, borderLeft: '3px solid var(--saffron-300)' }}>
      <div className="inline-form-header">
        <span>Нова оплата до рах. №{invoice.number}</span>
        <button className="btn-close" onClick={onCancel}>✕</button>
      </div>
      <p className="cell-muted" style={{ marginBottom: 10, fontSize: '.83rem' }}>
        Залишок до оплати: <b>{fmtMoney(remaining)}</b> грн
      </p>
      <div className="form-row-4">
        <div className="field">
          <label>Дата</label>
          <input type="date" name="date" value={form.date} onChange={set} />
        </div>
        <div className="field">
          <label>Сума, грн</label>
          <input type="number" name="amount" value={form.amount} onChange={set} min="0" step="0.01" />
        </div>
        <div className="field">
          <label>Спосіб оплати</label>
          <select name="paymentMethod" value={form.paymentMethod} onChange={set}>
            {PAYMENT_METHODS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
        {form.paymentMethod === 'acquiring' && (
          <div className="field">
            <label>Комісія еквайрингу, грн</label>
            <input type="number" name="acquiringCommission" value={form.acquiringCommission}
              onChange={set} min="0" step="0.01" placeholder="0.00" />
          </div>
        )}
      </div>
      <div className="field" style={{ maxWidth: 400, marginTop: 8 }}>
        <label>Примітка</label>
        <input name="notes" value={form.notes} onChange={set} />
      </div>
      <div className="form-actions">
        <button className="btn btn--primary" onClick={() => {
          if (!form.amount || +form.amount <= 0) { alert('Вкажіть суму'); return; }
          onSave(form, invoice);
        }}>Зберегти оплату</button>
        <button className="btn btn--ghost" onClick={onCancel}>Скасувати</button>
      </div>
    </div>
  );
};

// ─── Рядок рахунку (розгортається) ──────────────────────────────────
// ─── Контекстне меню (права кнопка / довге натискання) ──────────────
const ContextMenu = ({ x, y, items, onClose }) => {
  const [sub, setSub] = useState(null);
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); };
  }, [onClose]);

  return (
    <div className="ctx-menu" style={{ top: y, left: x }} onClick={e => e.stopPropagation()}>
      {items.map((it, i) => it.sep ? <div key={i} className="ctx-sep" /> : (
        <div key={i}
          className={`ctx-item${it.danger ? ' ctx-item--danger' : ''}`}
          onMouseEnter={() => setSub(it.children ? i : null)}
          onClick={() => { if (!it.children) { it.action(); onClose(); } }}>
          <span>{it.label}</span>
          {it.children && <span className="ctx-arrow">›</span>}
          {it.children && sub === i && (
            <div className="ctx-menu ctx-submenu">
              {it.children.map((c, j) => (
                <div key={j} className="ctx-item" onClick={() => { c.action(); onClose(); }}>{c.label}</div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ─── Бейдж статусу зі списком ───────────────────────────────────────
const StatusBadge = ({ value, options, onChange, factLabel }) => {
  const [open, setOpen] = useState(false);
  const cur = options.find(o => o.id === value) || options[0];
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);

  return (
    <div className="status-wrap" onClick={e => e.stopPropagation()}>
      <button className={`status-badge status-badge--${cur.color || 'muted'}`} onClick={() => setOpen(p => !p)}>
        {cur.label} <span className="status-caret">▾</span>
      </button>
      {factLabel && <div className="status-fact">факт.: {factLabel}</div>}
      {open && (
        <div className="status-list">
          {options.map(o => (
            <div key={o.id} className={`status-option${o.id === value ? ' status-option--active' : ''}`}
              onClick={() => { onChange(o.id); setOpen(false); }}>{o.label}</div>
          ))}
        </div>
      )}
    </div>
  );
};

const InvoiceRow = ({ inv, allActs, invActs, invPayments, onAddAct, onUpdateAct, onDeleteAct, onUpdateActStatus, onAddPayment, onDelete, onEdit, onCopy, onUpdateStatus, onGenerateTaxInvoice, onRefund, isVatPayer, productOptions }) => {
  const { settings } = useSettings();
  const { activeFop } = useFop();
  const [ctx, setCtx] = useState(null);       // меню рахунку {x,y}
  const [ctxAct, setCtxAct] = useState(null); // меню акта {act,x,y}
  const [addActType, setAddActType] = useState(null);
  const [editAct, setEditAct] = useState(null);
  const [addPay, setAddPay] = useState(false);

  const status = calcInvoiceStatus(inv, invPayments);
  const paid   = calcInvoicePaid(inv.id, invPayments);
  const remain = (+inv.total || 0) - paid;
  const statusInfo = INVOICE_STATUSES[status] || INVOICE_STATUSES.draft;

  const handlePrintInvoice = () => {
    try {
      openPrintWindow(buildInvoiceHtml(inv, activeFop, settings), { fop: activeFop });
    } catch(e) {
      console.error('Помилка генерації рахунку:', e);
      alert('Помилка: ' + (e.message || String(e)));
    }
  };

  const handlePrintAct = (act) => {
    try {
      openPrintWindow(buildActHtml(act, activeFop, settings), { fop: activeFop });
    } catch(e) {
      console.error('Помилка генерації акту:', e);
      alert('Помилка: ' + (e.message || String(e)));
    }
  };

  const handlePrintContract = () => {
    try {
      openPrintWindow(buildContractHtml(inv, activeFop, settings), { fop: activeFop });
    } catch(e) {
      console.error('Помилка генерації договору:', e);
      alert('Помилка: ' + (e.message || String(e)));
    }
  };

  // Дочірні документи одним списком — щоб показати зв'язок з рахунком
  const children = [
    ...invActs.map(a => ({ kind: 'act', id: a.id, data: a })),
    ...invPayments.map(pm => ({ kind: 'payment', id: pm.id, data: pm })),
  ];

  const openCtx = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCtx({ x: Math.min(e.clientX, window.innerWidth - 240), y: e.clientY });
  };

  // Тач: довге натискання = права кнопка
  const touchTimer = useRef(null);
  const onTouchStart = (e) => {
    const t = e.touches[0];
    touchTimer.current = setTimeout(() => {
      setCtx({ x: Math.min(t.clientX, window.innerWidth - 240), y: t.clientY });
    }, 500);
  };
  const clearTouch = () => { if (touchTimer.current) clearTimeout(touchTimer.current); };

  const ctxItems = [
    { label: 'Ввести на основі', children: [
      { label: 'Акт виконаних робіт', action: () => { setAddActType('act'); setAddPay(false); } },
      { label: 'Накладна на товар',   action: () => { setAddActType('delivery_note'); setAddPay(false); } },
      { label: 'Оплата',              action: () => { setAddPay(true); setAddActType(null); } },
      { label: 'Договір (друк)',      action: handlePrintContract },
    ]},
    { sep: true },
    { label: 'Друк рахунку', action: handlePrintInvoice },
    { label: 'Редагувати',   action: () => onEdit && onEdit(inv) },
    { label: 'Копіювати',    action: () => onCopy && onCopy(inv) },
  ];

  if (paid > 0 && inv.direction === 'outgoing') {
    ctxItems.push({ label: 'Повернення коштів', action: () => {
      const sum = window.prompt('Сума повернення клієнту, грн:', String(paid));
      if (!sum) return;
      const amt = +sum.replace(',', '.');
      if (!(amt > 0)) { alert('Сума має бути > 0'); return; }
      const note = window.prompt('Причина повернення (необов\'язково):', '') || '';
      onRefund && onRefund(amt, note);
    }});
  }

  ctxItems.push({ sep: true });
  ctxItems.push({ label: 'Видалити рахунок', danger: true, action: () => {
    window.confirm('Видалити рахунок і всі пов\'язані документи?') && onDelete(inv.id);
  }});

  return (
    <>
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctxItems} onClose={() => setCtx(null)} />}

      {/* ── Рахунок ── */}
      <tr className="doc-row doc-row--parent"
        onContextMenu={openCtx}
        onTouchStart={onTouchStart} onTouchEnd={clearTouch} onTouchMove={clearTouch}>
        <td className="doc-cell-name">
          <span className="doc-type">Рахунок</span>
          <span className="doc-num">№{inv.number}</span>
        </td>
        <td className="doc-cell-date">{inv.date}</td>
        <td>{inv.clientName || '—'}</td>
        <td className="doc-cell-sum">{fmtMoney(inv.total)}</td>
        <td className="doc-cell-sum" style={{ color: paid > 0 ? 'var(--success)' : undefined }}>{fmtMoney(paid)}</td>
        <td className="doc-cell-sum" style={{ color: remain > 0 ? 'var(--error)' : undefined }}>{fmtMoney(remain)}</td>
        <td className="doc-cell-status">
          <StatusBadge
            value={inv.status || 'sent'}
            options={Object.values(INVOICE_STATUSES)}
            onChange={(v) => onUpdateStatus(inv.id, v)}
            factLabel={status !== (inv.status || 'sent') ? statusInfo.label : null}
          />
        </td>
      </tr>

      {/* ── Дочірні документи ── */}
      {children.map((ch, idx) => {
        const last = idx === children.length - 1;
        const branch = last ? '└─' : '├─';

        if (ch.kind === 'act') {
          const act = ch.data;
          const typeLabel = ACT_TYPES.find(t => t.id === act.type)?.label || act.type;
          return (
            <tr key={ch.id} className="doc-row doc-row--child"
              onContextMenu={(e) => {
                e.preventDefault(); e.stopPropagation();
                setCtxAct({ act, x: Math.min(e.clientX, window.innerWidth - 240), y: e.clientY });
              }}>
              <td className="doc-cell-name">
                <span className="doc-branch">{branch}</span>
                <span className="doc-type">{typeLabel}</span>
                <span className="doc-num">№{act.number}</span>
                {act.taxInvoiceId && <span className="doc-tag">ПН №{act.taxInvoiceNumber}</span>}
              </td>
              <td className="doc-cell-date">{act.date}</td>
              <td className="cell-muted">{act.clientName || inv.clientName || '—'}</td>
              <td className="doc-cell-sum">{fmtMoney(act.total)}</td>
              <td className="doc-cell-sum cell-muted">—</td>
              <td className="doc-cell-sum cell-muted">—</td>
              <td className="doc-cell-status">
                <StatusBadge
                  value={act.status || 'draft'}
                  options={[{ id:'draft', label:'Чернетка', color:'muted' }, { id:'signed', label:'Підписано', color:'success' }]}
                  onChange={(v) => onUpdateActStatus(act.id, v)}
                />
              </td>
            </tr>
          );
        }

        const pm = ch.data;
        return (
          <tr key={ch.id} className="doc-row doc-row--child">
            <td className="doc-cell-name">
              <span className="doc-branch">{branch}</span>
              <span className="doc-type">Оплата</span>
              <span className="cell-muted">{PAYMENT_METHODS.find(m => m.id === pm.paymentMethod)?.label || pm.paymentMethod}</span>
              {pm.notes && <span className="doc-tag">{pm.notes}</span>}
            </td>
            <td className="doc-cell-date">{pm.date}</td>
            <td className="cell-muted">{inv.clientName || '—'}</td>
            <td className="doc-cell-sum cell-muted">—</td>
            <td className="doc-cell-sum" style={{ color: 'var(--success)' }}>{fmtMoney(pm.amount)}</td>
            <td className="doc-cell-sum cell-muted">
              {+pm.acquiringCommission > 0 ? `коміс. ${fmtMoney(pm.acquiringCommission)}` : '—'}
            </td>
            <td></td>
          </tr>
        );
      })}

      {/* Контекстне меню акта */}
      {ctxAct && (
        <ContextMenu x={ctxAct.x} y={ctxAct.y} onClose={() => setCtxAct(null)} items={[
          { label: 'Друк', action: () => handlePrintAct(ctxAct.act) },
          { label: 'Редагувати', action: () => setEditAct(ctxAct.act) },
          ...(isVatPayer && !ctxAct.act.taxInvoiceId
            ? [{ label: 'Створити податкову накладну', action: () => onGenerateTaxInvoice(ctxAct.act) }]
            : []),
          { sep: true },
          { label: 'Видалити', danger: true, action: () => {
            window.confirm('Видалити акт/накладну?') && onDeleteAct && onDeleteAct(ctxAct.act.id);
          }},
        ]} />
      )}

      {/* ── Форми ── */}
      {(addActType || editAct || addPay) && (
        <tr>
          <td colSpan={7} style={{ padding: 0 }}>
            <div className="invoice-detail">
              {addActType && (
                <ActForm invoice={inv} actList={allActs} forcedType={addActType}
                  onSave={(act) => { onAddAct(act); setAddActType(null); }}
                  onCancel={() => setAddActType(null)} />
              )}
              {editAct && (
                <ActForm invoice={inv} initial={editAct} actList={allActs}
                  onSave={(act) => { onUpdateAct && onUpdateAct(editAct.id, act); setEditAct(null); }}
                  onCancel={() => setEditAct(null)} />
              )}
              {addPay && (
                <PaymentForm invoice={inv} invoicePaid={paid}
                  onSave={(payment, i) => { onAddPayment(payment, i); setAddPay(false); }}
                  onCancel={() => setAddPay(false)} />
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

// ─── Головний компонент ─────────────────────────────────────────────
const SalesView = () => {
  const { invoices, acts, payments, addInvoice, updateInvoice, addAct, updateAct, deleteAct, addPayment, deleteInvoice,
          clients, products, vatInvoices, addVatInvoice, addTransaction } = useData();
  const { settings } = useSettings();
  const [direction, setDirection]   = useState('outgoing');
  const [addInv, setAddInv]         = useState(false);
  const [editInv, setEditInv]       = useState(null); // invoice obj for editing
  const [copyInv, setCopyInv]       = useState(null); // джерело для копії (новий рахунок)
  const [filter, setFilter]         = useState({ search: '', status: '' });

  // Опції для автодоповнення
  const clientOptions = useMemo(() =>
    clients.map(c => ({ id: c.id, label: c.name, ipn: c.ipn, address: c.address })),
    [clients]
  );
  const productOptions = useMemo(() =>
    products.map(p => ({ id: p.id, label: p.name, unit: p.unit, price: p.price, vatRate: p.vatRate })),
    [products]
  );

  const dirInvoices = useMemo(() =>
    [...invoices]
      .filter(i => i.direction === direction)
      .filter(i => !filter.status || calcInvoiceStatus(i, payments) === filter.status)
      .filter(i => !filter.search || i.clientName?.toLowerCase().includes(filter.search.toLowerCase()) || i.number?.includes(filter.search))
      .sort((a, b) => b.date.localeCompare(a.date)),
    [invoices, payments, direction, filter]
  );

  const totals = useMemo(() => {
    const all = invoices.filter(i => i.direction === direction);
    const totalSum  = all.reduce((s, i) => s + (+i.total||0), 0);
    const totalPaid = payments.filter(p => p.direction === direction).reduce((s, p) => s + (+p.amount||0), 0);
    return { totalSum, totalPaid, totalUnpaid: totalSum - totalPaid };
  }, [invoices, payments, direction]);

  return (
    <div className="view-sales">
      <div className="view-toolbar">
        <h2 className="view-title">{direction === 'outgoing' ? 'Продажі' : 'Закупівлі'}</h2>
        <div className="toolbar-actions">
          <button className="btn btn--primary" onClick={() => { setAddInv(p => !p); setEditInv(null); }}>
            + {direction === 'outgoing' ? 'Рахунок клієнту' : 'Вхідний рахунок'}
          </button>
        </div>
      </div>

      <div className="tabs-bar" style={{ marginBottom: 16 }}>
        <button className={`tab-pill${direction==='outgoing'?' tab-pill--active':''}`} onClick={() => { setDirection('outgoing'); setAddInv(false); setEditInv(null); }}>Продажі</button>
        <button className={`tab-pill${direction==='incoming'?' tab-pill--active':''}`} onClick={() => { setDirection('incoming'); setAddInv(false); setEditInv(null); }}>Закупівлі</button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card"><div className="stat-label">Всього рахунків</div><div className="stat-value">{fmtMoney(totals.totalSum)}</div></div>
        <div className="stat-card"><div className="stat-label">Оплачено</div><div className="stat-value" style={{color:'var(--success)'}}>{fmtMoney(totals.totalPaid)}</div></div>
        <div className="stat-card stat-card--accent"><div className="stat-label">Залишок</div><div className="stat-value">{fmtMoney(totals.totalUnpaid)}</div></div>
      </div>

      {addInv && !editInv && (
        <InvoiceForm
          direction={direction}
          invoiceList={invoices}
          clientOptions={clientOptions}
          productOptions={productOptions}
          onSave={(inv) => { addInvoice(inv); setAddInv(false); }}
          onCancel={() => setAddInv(false)}
        />
      )}

      {editInv && (
        <InvoiceForm
          initial={editInv}
          direction={editInv.direction}
          invoiceList={invoices}
          clientOptions={clientOptions}
          productOptions={productOptions}
          onSave={(inv) => { updateInvoice(editInv.id, inv); setEditInv(null); }}
          onCancel={() => setEditInv(null)}
        />
      )}
            {copyInv && (
        <InvoiceForm
          initial={copyInv}
          direction={copyInv.direction || direction}
          invoiceList={invoices}
          clientOptions={clientOptions}
          productOptions={productOptions}
          onSave={(inv) => { addInvoice(inv); setCopyInv(null); }}
          onCancel={() => setCopyInv(null)}
        />
      )}

      <div className="filters-bar">
        <input placeholder="Пошук по контрагенту або №" value={filter.search}
          onChange={e => setFilter(p => ({ ...p, search: e.target.value }))} style={{ maxWidth: 280 }} />
        <select value={filter.status} onChange={e => setFilter(p => ({ ...p, status: e.target.value }))} style={{ maxWidth: 180 }}>
          <option value="">Всі статуси</option>
          {Object.values(INVOICE_STATUSES).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Документ</th>
              <th>Дата</th>
              <th>Контрагент</th>
              <th style={{ textAlign: 'right' }}>Сума, грн</th>
              <th style={{ textAlign: 'right' }}>Оплачено</th>
              <th style={{ textAlign: 'right' }}>Залишок</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {dirInvoices.length === 0 ? (
              <tr><td colSpan={7} className="table-empty">Рахунків немає</td></tr>
            ) : dirInvoices.map(inv => (
              <InvoiceRow
                key={inv.id}
                inv={inv}
                allActs={acts}
                invActs={acts.filter(a => a.invoiceId === inv.id)}
                invPayments={payments.filter(p => p.invoiceId === inv.id)}
                onAddAct={(act)     => addAct(act)}
                onUpdateAct={(id, patch) => updateAct(id, patch)}
                onDeleteAct={(id) => deleteAct(id)}
                onUpdateActStatus={(id, newStatus) => updateAct(id, { status: newStatus })}
                onAddPayment={(pay, inv) => addPayment(pay, { invoice: inv })}
                onDelete={deleteInvoice}
                onEdit={(inv) => { setEditInv(inv); setAddInv(false); }}
                onCopy={(src) => {
                  // Копія: позиції й контрагент переносяться, номер і дата — нові,
                  // статус і оплати не копіюються (це новий, ще не оплачений рахунок).
                  const { id, number, date, createdAt, status, paidAmount, ...rest } = src;
                  setCopyInv({ ...rest, date: new Date().toISOString().slice(0, 10) });
                  setEditInv(null);
                  setAddInv(false);
                }}
                onUpdateStatus={(id, newStatus) => updateInvoice(id, { status: newStatus })}
                onGenerateTaxInvoice={(act) => {
                  // Одна операція — одна ПН. Повторний клік не має плодити
                  // другу накладну з іншим номером на той самий акт.
                  const exists = vatInvoices.find(v =>
                    v.id === act.taxInvoiceId ||
                    (v.direction === 'outgoing' && v.sourceActId === act.id));
                  if (exists) {
                    alert(`На акт № ${act.number} вже виписано ПН № ${exists.number} від ${exists.date}.`
                      + (exists.registered
                          ? '\nВона зареєстрована в ЄРПН — зміни лише через РК.'
                          : '\nЯкщо ПН помилкова — видаліть її в модулі ПДВ і сформуйте заново.'));
                    return;
                  }
                  const num = mkVatNum(vatInvoices, act.date);
                  const vatInv = addVatInvoice({
                    date: act.date,
                    number: num,
                    direction: inv.direction,
                    counterparty: act.clientName,
                    amount: (calcDocTotals(act.items).subtotal || 0),
                    sourceActId: act.id,
                    sourceInvoiceNumber: inv.number,
                    registered: false,
                  });
                  updateAct(act.id, { taxInvoiceId: vatInv.id, taxInvoiceNumber: vatInv.number });
                }}
                onRefund={(refundAmount, note) => {
                  addTransaction({
                    date: new Date().toISOString().slice(0, 10),
                    type: 'refund_out',
                    counterparty: inv.clientName || '',
                    amount: refundAmount,
                    paymentMethod: 'bank',
                    description: note || `Повернення за рах. №${inv.number}`,
                    invoiceId: inv.id,
                  });
                  if (settings.isVatPayer) {
                    alert('Транзакцію повернення створено. Для платника ПДВ додатково сформуйте РК до ПН у розділі «ПДВ».');
                  }
                }}
                isVatPayer={settings.isVatPayer}
                productOptions={productOptions}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const SalesViewWrapped = () => (
  <ErrorBoundary>
    <SalesView />
  </ErrorBoundary>
);

export default SalesViewWrapped;
