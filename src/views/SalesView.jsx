import React, { useState, useMemo, useCallback } from 'react';
import { useData } from '../context/DataContext';
import { useSettings } from '../context/SettingsContext';
import { useFop } from '../context/FopContext';
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

const openPrintWindow = (html) => {
  const w = window.open('', '_blank', 'width=900,height=700');
  if (w) {
    w.document.write(html);
    w.document.close();
  } else {
    alert('Дозвольте спливаючі вікна для цього сайту, щоб відкрити документ для друку.');
  }
};

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

const docSignatureHtml = (activeFop, facsimileHtml) => `
<div class="sig">
  <div>ФОП ${activeFop?.fullName||''}<br>${facsimileHtml}<br>___________________________<br><small>(підпис)</small></div>
  <div style="text-align:right">М.П.</div>
</div>`;

// Друк рахунку (нового або вже збереженого)
const buildInvoiceHtml = (inv, activeFop, settings) => {
  const mainIban = activeFop?.bankAccounts?.find(a => a.isMain) || activeFop?.bankAccounts?.[0];
  const facsimileHtml = activeFop?.facsimile
    ? `<img src="${activeFop.facsimile}" style="max-height:70px; max-width:180px; display:block; margin-top:10px">`
    : '';
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
${docSignatureHtml(activeFop, facsimileHtml)}
<script>window.onload=()=>window.print()</script>
</body></html>`;
};

// Друк акту / накладної
const buildActHtml = (act, activeFop, settings) => {
  const mainIban = activeFop?.bankAccounts?.find(a => a.isMain) || activeFop?.bankAccounts?.[0];
  const facsimileHtml = activeFop?.facsimile
    ? `<img src="${activeFop.facsimile}" style="max-height:70px; max-width:180px; display:block; margin-top:10px">`
    : '';
  const totalsNow = calcDocTotals(act.items || []);
  const docLabel = ACT_TYPES.find(t => t.id === act.type)?.label || 'Акт';

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
<p>Виконавець: <b>ФОП ${activeFop?.fullName||''}</b>${activeFop?.rnokpp?` (РНОКПП ${activeFop.rnokpp})`:''}, з однієї сторони, та
Замовник: <b>${act.clientName||'—'}</b>${act.clientIpn?` (ЄДРПОУ/ІПН ${act.clientIpn})`:''}${act.clientAddress?`, ${act.clientAddress}`:''}, з іншої сторони,
склали цей акт про те, що Виконавцем надано, а Замовником прийнято наступні роботи (послуги):</p>
<table>
  <thead><tr><th>№</th><th>Найменування товару/послуги</th><th>К-сть</th><th>Од.</th>${vatHeader}</tr></thead>
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
<p>Роботи (послуги) виконано в повному обсязі, у визначений термін. Замовник претензій щодо обсягу, якості та строків виконання робіт (надання послуг) не має.</p>
<div class="sig">
  <div>
    <b>Виконавець:</b><br>ФОП ${activeFop?.fullName||''}<br>${facsimileHtml}<br>
    ___________________________<br><small>(підпис)</small>
  </div>
  <div>
    <b>Замовник:</b><br>${act.clientName||''}<br><br>
    Посада: ___________________ ПІБ: ___________________<br>
    ___________________________<br><small>(підпис)</small>
  </div>
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

const mkNum = (list, prefix, dateStr) => {
  const year = (dateStr || new Date().toISOString()).slice(0, 4);
  const count = list.filter(i => (i.number||'').startsWith(prefix) && (i.date||'').slice(0,4) === year).length;
  return `${prefix}-${String(count + 1).padStart(3, '0')}`;
};

// Податкові накладні — наскрізна нумерація в межах календарного місяця
const mkVatNum = (vatInvoices, dateStr) => {
  const monthKey = (dateStr || new Date().toISOString()).slice(0, 7);
  const count = vatInvoices.filter(v => (v.date||'').slice(0,7) === monthKey).length;
  return String(count + 1).padStart(4, '0');
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
                  <select className="table-input" value={it.unit}
                    onChange={e => setItem(idx, 'unit', e.target.value)}>
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
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
      openPrintWindow(buildInvoiceHtml(form, activeFop, settings));
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
      <div className="form-actions">
        <button className="btn btn--primary" onClick={handleSave}>Зберегти рахунок</button>
        <button className="btn btn--ghost" onClick={handlePdf}>⇩ PDF</button>
        <button className="btn btn--ghost" onClick={onCancel}>Скасувати</button>
      </div>
    </div>
  );
};

// ─── Форма акту / накладної ─────────────────────────────────────────
const ActForm = ({ invoice, onSave, onCancel, actList }) => {
  const { settings } = useSettings();
  const { activeFop } = useFop();
  const inferredType = inferDocType(invoice.items);
  const [form, setForm] = useState({
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
      openPrintWindow(buildActHtml(form, activeFop, settings));
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
const InvoiceRow = ({ inv, allActs, invActs, invPayments, onAddAct, onUpdateActStatus, onAddPayment, onDelete, onEdit, onUpdateStatus, onGenerateTaxInvoice, isVatPayer, productOptions }) => {
  const { settings } = useSettings();
  const { activeFop } = useFop();
  const [open, setOpen] = useState(false);
  const [addAct, setAddAct] = useState(false);
  const [addPay, setAddPay] = useState(false);

  const status = calcInvoiceStatus(inv, invPayments);
  const paid   = calcInvoicePaid(inv.id, invPayments);
  const remain = (+inv.total || 0) - paid;
  const statusInfo = INVOICE_STATUSES[status] || INVOICE_STATUSES.draft;

  const handlePrintInvoice = () => {
    try {
      openPrintWindow(buildInvoiceHtml(inv, activeFop, settings));
    } catch(e) {
      console.error('Помилка генерації рахунку:', e);
      alert('Помилка: ' + (e.message || String(e)));
    }
  };

  const handlePrintAct = (act) => {
    try {
      openPrintWindow(buildActHtml(act, activeFop, settings));
    } catch(e) {
      console.error('Помилка генерації акту:', e);
      alert('Помилка: ' + (e.message || String(e)));
    }
  };

  return (
    <>
      <tr className={`invoice-row${open ? ' invoice-row--open' : ''}`} onClick={() => { setOpen(p=>!p); setAddAct(false); setAddPay(false); }}>
        <td onClick={e => e.stopPropagation()}>
          <select className="table-input" style={{minWidth:130}} value={inv.status || 'sent'}
            onChange={e => onUpdateStatus(inv.id, e.target.value)}>
            {Object.values(INVOICE_STATUSES).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          {status !== (inv.status || 'sent') && (
            <div className="cell-muted" style={{fontSize:'.72rem', marginTop:2}}>
              факт.: {statusInfo.label}
            </div>
          )}
        </td>
        <td>№{inv.number}</td>
        <td>{inv.date}</td>
        <td>{inv.clientName || '—'}</td>
        <td style={{ textAlign: 'right' }}>{fmtMoney(inv.total)}</td>
        <td style={{ textAlign: 'right', color: paid > 0 ? 'var(--success)' : undefined }}>{fmtMoney(paid)}</td>
        <td style={{ textAlign: 'right', color: remain > 0 ? 'var(--error)' : undefined }}>{fmtMoney(remain)}</td>
        <td onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn--ghost btn--sm" title="Друк рахунку" onClick={handlePrintInvoice}>⇩ PDF</button>
            <button className="btn btn--ghost btn--sm" title="Редагувати рахунок" onClick={() => onEdit && onEdit(inv)}>✎</button>
            <button className="btn btn--ghost btn--sm" title="Акт/Накладна" onClick={() => { setOpen(true); setAddAct(p=>!p); setAddPay(false); }}>
              + {inferDocType(inv.items) === 'act' ? 'Акт' : 'Накладна'}
            </button>
            <button className="btn btn--ghost btn--sm" title="Оплата" onClick={() => { setOpen(true); setAddPay(p=>!p); setAddAct(false); }}>+ Оплата</button>
            <button className="btn-icon btn-icon--del" title="Видалити" onClick={() => window.confirm('Видалити рахунок і всі пов\'язані документи?') && onDelete(inv.id)}>✕</button>
          </div>
        </td>
      </tr>

      {open && (
        <tr>
          <td colSpan={8} style={{ padding: 0 }}>
            <div className="invoice-detail">

              {/* Акти */}
              {invActs.length > 0 && (
                <div className="invoice-detail-section">
                  <div className="invoice-detail-title">Акти / Накладні</div>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Тип</th>
                        <th>Номер</th>
                        <th>Дата</th>
                        <th>Статус</th>
                        <th style={{ textAlign: 'right' }}>Сума, грн</th>
                        <th></th>
                        {isVatPayer && <th>Податкова накладна</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {invActs.map(act => (
                        <tr key={act.id}>
                          <td>{ACT_TYPES.find(t=>t.id===act.type)?.label || act.type}</td>
                          <td>№{act.number}</td>
                          <td>{act.date}</td>
                          <td>
                            <select className="table-input" style={{minWidth:120}} value={act.status || 'draft'}
                              onChange={e => onUpdateActStatus(act.id, e.target.value)}>
                              <option value="draft">Чернетка</option>
                              <option value="signed">Підписано</option>
                            </select>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(act.total)}</td>
                          <td><button className="btn btn--ghost btn--sm" title="Друк" onClick={() => handlePrintAct(act)}>⇩ PDF</button></td>
                          {isVatPayer && (
                            <td>
                              {act.taxInvoiceId ? (
                                <span className="cell-muted">ПН №{act.taxInvoiceNumber}</span>
                              ) : (
                                <button className="btn btn--ghost btn--sm" onClick={() => onGenerateTaxInvoice(act)}>+ ПН</button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {addAct && (
                <ActForm
                  invoice={inv}
                  actList={allActs}
                  onSave={(act) => { onAddAct(act); setAddAct(false); }}
                  onCancel={() => setAddAct(false)}
                />
              )}

              {/* Платежі */}
              {invPayments.length > 0 && (
                <div className="invoice-detail-section">
                  <div className="invoice-detail-title">Платежі</div>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Дата</th>
                        <th>Спосіб</th>
                        <th style={{ textAlign: 'right' }}>Сума, грн</th>
                        <th>Комісія, грн</th>
                        <th>Примітка</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invPayments.map(p => (
                        <tr key={p.id}>
                          <td>{p.date}</td>
                          <td>{PAYMENT_METHODS.find(m=>m.id===p.paymentMethod)?.label || p.paymentMethod}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(p.amount)}</td>
                          <td className="cell-muted">{+p.acquiringCommission > 0 ? fmtMoney(p.acquiringCommission) : '—'}</td>
                          <td className="cell-muted">{p.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {addPay && (
                <PaymentForm
                  invoice={inv}
                  invoicePaid={paid}
                  onSave={(payment, inv) => { onAddPayment(payment, inv); setAddPay(false); }}
                  onCancel={() => setAddPay(false)}
                />
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
  const { invoices, acts, payments, addInvoice, updateInvoice, addAct, updateAct, addPayment, deleteInvoice,
          clients, products, vatInvoices, addVatInvoice } = useData();
  const { settings } = useSettings();
  const [direction, setDirection]   = useState('outgoing');
  const [addInv, setAddInv]         = useState(false);
  const [editInv, setEditInv]       = useState(null); // invoice obj for editing
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
              <th>Статус</th>
              <th>Номер</th>
              <th>Дата</th>
              <th>Контрагент</th>
              <th style={{ textAlign: 'right' }}>Сума, грн</th>
              <th style={{ textAlign: 'right' }}>Оплачено</th>
              <th style={{ textAlign: 'right' }}>Залишок</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {dirInvoices.length === 0 ? (
              <tr><td colSpan={8} className="table-empty">Рахунків немає</td></tr>
            ) : dirInvoices.map(inv => (
              <InvoiceRow
                key={inv.id}
                inv={inv}
                allActs={acts}
                invActs={acts.filter(a => a.invoiceId === inv.id)}
                invPayments={payments.filter(p => p.invoiceId === inv.id)}
                onAddAct={(act)     => addAct(act)}
                onUpdateActStatus={(id, newStatus) => updateAct(id, { status: newStatus })}
                onAddPayment={(pay, inv) => addPayment(pay, { invoice: inv })}
                onDelete={deleteInvoice}
                onEdit={(inv) => { setEditInv(inv); setAddInv(false); }}
                onUpdateStatus={(id, newStatus) => updateInvoice(id, { status: newStatus })}
                onGenerateTaxInvoice={(act) => {
                  const num = mkVatNum(vatInvoices, act.date);
                  const vatInv = addVatInvoice({
                    date: act.date,
                    number: num,
                    direction: inv.direction,
                    counterparty: act.clientName,
                    amount: (calcDocTotals(act.items).subtotal || 0),
                    sourceActId: act.id,
                    sourceInvoiceNumber: inv.number,
                  });
                  updateAct(act.id, { taxInvoiceId: vatInv.id, taxInvoiceNumber: vatInv.number });
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
