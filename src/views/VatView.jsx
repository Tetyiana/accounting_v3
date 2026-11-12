import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useFop } from '../context/FopContext';
import { fmtMoney } from '../utils/documentLogic';
import { effectivePayments } from '../utils/settlements';
import { openPrintWindow } from '../utils/printWindow';
import { downloadXml } from '../utils/xmlDps';
import { buildPnXml, buildRkXml, pnXmlGaps } from '../utils/vatXml';
import { buildTaxInvoiceHtml } from '../utils/taxInvoicePrint';
import Autocomplete from '../components/common/Autocomplete';
import {
  PN_SPECS, REASON_TYPES, RK_REASONS, VAT_RATE_LIST, specOf, vatLines, vatTotals, nextVatNumber,
  registrationDeadline, declarationSlot, calcVatChain, pendingPnEvents, draftPnForEvent,
  pendingRetailDays, draftRetailPn, buildRkItems, draftRk, rkRegistrar, isSelfPn, isNonpayerPn,
} from '../utils/vatLogic';

// Модуль ПДВ: реєстр виданих і отриманих ПН та РК, контроль подій без ПН і строків
// реєстрації, розрахунок декларації. Логіка — у utils/vatLogic.js.

const today = () => new Date().toISOString().slice(0, 10);
const r2 = (n) => Math.round((+n || 0) * 100) / 100;
const dots = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '');
const EMPTY_ITEM = () => ({ name: '', unitName: '', uktzed: '', qty: 1, price: '', rate: 20 });
const emptyPn = (direction, vatInvoices) => ({
  kind: 'pn', direction, date: today(), number: direction === 'outgoing' ? nextVatNumber(vatInvoices, today()) : '',
  spec: '', reasonType: '', counterparty: '', buyerIpn: '', counterpartyTin: '',
  items: [EMPTY_ITEM()], registered: false, registrationDate: '', basis: 'manual',
});

const VatView = () => {
  const {
    vatInvoices, addVatInvoice, updateVatInvoice, deleteVatInvoice,
    invoices, acts, payments, transactions, clients, updateAct,
  } = useData();
  const { activeFop } = useFop();
  const [tab, setTab] = useState('outgoing');
  const [period, setPeriod] = useState(today().slice(0, 7));
  const [form, setForm] = useState(null);       // ПН у формі
  const [rkForm, setRkForm] = useState(null);   // { pn, date, reasonCode, changes: [{lineNo, qtyDelta, priceDelta}], registered, registrationDate }
  const [err, setErr] = useState('');

  const payEff = useMemo(() => effectivePayments({ invoices, payments, transactions, acts }), [invoices, payments, transactions, acts]);
  const calc = useMemo(() => calcVatChain(vatInvoices, period), [vatInvoices, period]);
  const events = useMemo(() => pendingPnEvents({ invoices, acts, payments: payEff, vatInvoices }), [invoices, acts, payEff, vatInvoices]);
  const retail = useMemo(() => pendingRetailDays({ transactions, vatInvoices }), [transactions, vatInvoices]);
  const rows = useMemo(() => vatInvoices
    .filter(v => v.direction === tab && (String(v.date).startsWith(period) || declarationSlot(v).period === period))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || (parseInt(b.number, 10) || 0) - (parseInt(a.number, 10) || 0)),
  [vatInvoices, tab, period]);
  const overdue = useMemo(() => vatInvoices.filter(v => {
    if (v.registered) return false;
    const dl = registrationDeadline(v);
    return dl && dl.date < today() && (v.direction === 'outgoing' ? dl.by === 'seller' : false);
  }), [vatInvoices]);
  const clientOptions = useMemo(() => clients.map(c => ({ id: c.id, label: c.name, ...c })), [clients]);
  const clientOf = (inv) => clients.find(c => c.name === inv.clientName) || (inv.clientIpn ? clients.find(c => c.ipn === inv.clientIpn) : null);

  // ─── ПН ───
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setItem = (i, k, v) => setForm(p => ({ ...p, items: p.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)) }));
  const applySpec = (id) => {
    const s = PN_SPECS.find(x => x.id === id) || PN_SPECS[0];
    setForm(p => ({
      ...p, spec: id, reasonType: s.reasonType || (s.reasons ? s.reasons[0] : ''), consolidatedCode: s.consolidatedCode || '',
      counterparty: s.buyer || (s.self ? `ФОП ${activeFop?.fullName || ''}` : (PN_SPECS.some(x => x.buyer === p.counterparty) ? '' : p.counterparty)),
      buyerIpn: s.ipn || (/^[1-6]0{11}$/.test(p.buyerIpn) ? '' : p.buyerIpn),
      counterpartyTin: s.ipn ? '' : p.counterpartyTin,
    }));
  };
  const savePn = () => {
    const f = form;
    const out = f.direction === 'outgoing';
    const num = String(f.number || '').trim();
    const items = f.items.filter(it => (it.name || '').trim() || +it.price)
      .map(it => ({ ...it, qty: +it.qty || 1, price: +it.price || 0, rate: +it.rate, base: r2((+it.qty || 1) * (+it.price || 0)) }));
    if (!f.date || !num || !f.counterparty) { setErr('Вкажіть дату, номер і контрагента'); return; }
    if (!items.length || items.some(it => it.base <= 0)) { setErr('Додайте позиції із сумою більше нуля (зменшення оформлюється розрахунком коригування)'); return; }
    if (out) {
      // п. 6 Порядку № 1307: номер — лише цифри, не починається з «0»; після «/» — код спецрежиму
      if (!/^[1-9]\d*(\/\d+)?$/.test(num)) { setErr('Номер ПН — лише цифри, не може починатися з «0» (п. 6 Порядку № 1307)'); return; }
      if (vatInvoices.some(v => v.id !== f.id && v.direction === 'outgoing' && v.date === f.date && String(v.number).trim() === num)) {
        setErr(`Документ № ${num} за ${dots(f.date)} вже є: за однією датою двох ПН з однаковим номером бути не може`); return;
      }
      if (!specOf(f).ipn && !/^\d{10,12}$/.test(f.buyerIpn || '')) { setErr('Вкажіть ІПН покупця — платника ПДВ (10 або 12 цифр). Якщо покупець не платник — оберіть вид «Неплатнику ПДВ»'); return; }
    }
    if (f.registered && !f.registrationDate) { setErr('Вкажіть дату реєстрації в ЄРПН'); return; }
    const doc = {
      ...f, number: num, items, amount: r2(items.reduce((s, x) => s + x.base, 0)), rate: items[0].rate,
      registrationDate: f.registered ? f.registrationDate : null,
    };
    if (f.id) updateVatInvoice(f.id, doc); else addVatInvoice(doc);
    setForm(null); setErr('');
  };

  // ─── РК ───
  const openRk = (pn) => {
    setErr('');
    setRkForm({
      pn, date: today(), reasonCode: '103', registered: false, registrationDate: '',
      number: pn.direction === 'incoming' ? '' : nextVatNumber(vatInvoices, today()),
      changes: vatLines(pn).map((_, i) => ({ lineNo: i + 1, qtyDelta: '', priceDelta: '' })),
    });
  };
  const rkItems = rkForm ? buildRkItems(rkForm.pn, rkForm.changes, rkForm.reasonCode) : [];
  const rkDraft = rkForm ? draftRk(rkForm.pn, rkItems, vatInvoices, rkForm.date) : null;
  const saveRk = () => {
    if (!rkItems.length) { setErr('Вкажіть зміну кількості або ціни хоча б в одному рядку'); return; }
    if (!rkForm.number) { setErr('Вкажіть номер розрахунку коригування'); return; }
    if (rkForm.date < rkForm.pn.date) { setErr('Розрахунок коригування не може бути складений раніше за податкову накладну'); return; }
    if (rkForm.registered && !rkForm.registrationDate) { setErr('Вкажіть дату реєстрації в ЄРПН'); return; }
    const corrected = vatTotals(rkForm.pn).base + vatInvoices
      .filter(v => v.kind === 'rk' && v.correctedId === rkForm.pn.id).reduce((s, v) => s + vatTotals(v).base, 0);
    if (corrected + rkDraft.amount < -0.004) { setErr('Сума зменшення перевищує залишок за податковою накладною з урахуванням попередніх коригувань'); return; }
    addVatInvoice({
      ...rkDraft, number: String(rkForm.number).trim(), reasonCode: rkForm.reasonCode,
      correctionReason: RK_REASONS.find(x => x.id === rkForm.reasonCode)?.label || '',
      registered: rkForm.registered, registrationDate: rkForm.registered ? rkForm.registrationDate : null,
    });
    setRkForm(null); setErr('');
  };

  // ─── Дії над рядком ───
  const markRegistered = (v) => {
    const d = window.prompt('Дата реєстрації в ЄРПН (РРРР-ММ-ДД):', today());
    if (!d) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < String(v.date).slice(0, 10)) { setErr('Некоректна дата реєстрації'); return; }
    if (!window.confirm(`Позначити ${v.kind === 'rk' ? 'РК' : 'ПН'} № ${v.number} від ${dots(v.date)} як зареєстровану ${dots(d)}?\nПісля цього документ не можна буде змінити чи видалити — лише коригувати.`)) return;
    updateVatInvoice(v.id, { registered: true, registrationDate: d }); setErr('');
  };
  const remove = (v) => {
    if (v.registered) { setErr('Зареєстрований документ видалити не можна — оформіть розрахунок коригування'); return; }
    if (vatInvoices.some(x => x.correctedId === v.id)) { setErr('До цієї ПН є розрахунки коригування — спершу видаліть їх'); return; }
    if (!window.confirm(`Видалити ${v.kind === 'rk' ? 'РК' : 'ПН'} № ${v.number} від ${dots(v.date)}?`)) return;
    const problem = deleteVatInvoice(v.id);
    if (problem) { setErr(problem); return; }
    if (v.sourceActId) updateAct(v.sourceActId, { taxInvoiceId: null, taxInvoiceNumber: '' });
  };
  const exportXml = (v) => {
    const gaps = pnXmlGaps(activeFop, v);
    if (gaps.length && !window.confirm(`Не заповнено: ${gaps.join(', ')}.\nБез цього ЄРПН документ не прийме. Сформувати все одно?`)) return;
    const { xml, name } = v.kind === 'rk' ? buildRkXml({ fop: activeFop, rk: v }) : buildPnXml({ fop: activeFop, pn: v });
    downloadXml(xml, name);
  };
  const printPn = (v) => openPrintWindow(buildTaxInvoiceHtml({
    ...v, items: vatLines(v), counterpartyTin: v.buyerIpn, counterpartyEdrpou: v.counterpartyTin,
    isSummary: !!(v.consolidatedCode || specOf(v).consolidatedCode), reasonType: v.reasonType || specOf(v).reasonType || '',
  }, activeFop || {}), { fop: activeFop });

  // ─── Контроль: виписати ПН на подію ───
  const issueForEvent = (e) => {
    const created = addVatInvoice(draftPnForEvent(e, vatInvoices, clientOf(e.invoice)));
    if (e.act) updateAct(e.act.id, { taxInvoiceId: created.id, taxInvoiceNumber: created.number });
  };
  const issueRetail = (day) => addVatInvoice(draftRetailPn(day, vatInvoices));

  // ─── Декларація ───
  const declRows = () => {
    const o = calc.oblig, s = calc.self, c = calc.credit;
    return [
      ['1.1', 'Постачання за основною ставкою 20 %', o[20].base, o[20].vat],
      ['1.2', 'Постачання за ставкою 7 %', o[7].base, o[7].vat],
      ['1.3', 'Постачання за ставкою 14 %', o[14].base, o[14].vat],
      ['2, 3', 'Постачання за ставкою 0 %', o[0].base, 0],
      ['4.1', 'Зобов\'язання за пп. 198.5, 199.1 ПКУ, ставка 20 %', s[20].base, s[20].vat],
      ['4.2', 'Зобов\'язання за пп. 198.5, 199.1 ПКУ, ставка 7 %', s[7].base, s[7].vat],
      ['4.3', 'Зобов\'язання за пп. 198.5, 199.1 ПКУ, ставка 14 %', s[14].base, s[14].vat],
      ['7', 'Коригування податкових зобов\'язань (розрахунки коригування)', calc.obligAdjust.base, calc.obligAdjust.vat],
      ['9', 'Усього податкових зобов\'язань', null, calc.obligVat, true],
      ['10.1', 'Придбання за основною ставкою 20 %', c[20].base, c[20].vat],
      ['10.2', 'Придбання за ставкою 7 %', c[7].base, c[7].vat],
      ['10.3', 'Придбання за ставкою 14 %', c[14].base, c[14].vat],
      ['14', 'Коригування податкового кредиту (розрахунки коригування)', calc.creditAdjust.base, calc.creditAdjust.vat],
      ['16.1', 'Від\'ємне значення попереднього періоду', null, calc.carryIn],
      ['17', 'Усього податкового кредиту', null, calc.creditVat, true],
      ['18', 'Позитивне значення — до сплати', null, calc.toPay, true],
      ['19', 'Від\'ємне значення — до кредиту наступного періоду', null, calc.negative, true],
    ];
  };
  const printDeclaration = () => {
    const [y, m] = period.split('-');
    openPrintWindow(`<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8"><title>ПДВ ${period}</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;margin:30px}h2{font-size:14px;text-align:center}
table{width:100%;border-collapse:collapse;margin:10px 0}td,th{border:1px solid #333;padding:5px 8px}td.r{text-align:right}
.b td{font-weight:bold}@media print{body{margin:12mm}}</style></head><body>
<h2>РОЗРАХУНОК ДО ПОДАТКОВОЇ ДЕКЛАРАЦІЇ З ПОДАТКУ НА ДОДАНУ ВАРТІСТЬ</h2>
<p style="text-align:center">за ${m}.${y} · ФОП ${activeFop?.fullName || ''} · ІПН ${activeFop?.vatCertificate || activeFop?.rnokpp || ''}</p>
<table><tr><th>Рядок</th><th>Показник</th><th>Обсяг без ПДВ</th><th>ПДВ</th></tr>
${declRows().map(([n, label, base, vat, bold]) => `<tr class="${bold ? 'b' : ''}"><td>${n}</td><td>${label}</td><td class="r">${base == null ? '' : fmtMoney(base)}</td><td class="r">${fmtMoney(vat)}</td></tr>`).join('')}
</table>
${calc.pending.length ? `<p><b>Не враховано (${calc.pending.length}):</b><br>${calc.pending.map(p => `${p.doc.kind === 'rk' ? 'РК' : 'ПН'} № ${p.doc.number} від ${dots(p.doc.date)}, ${p.doc.counterparty} — ${p.reason}`).join('<br>')}</p>` : ''}
<p style="font-size:10.5px">Робочий розрахунок для перенесення в декларацію в Електронному кабінеті, не офіційна форма.
Строк подання — 20 календарних днів після звітного місяця, сплата — протягом 10 календарних днів після граничного строку подання.</p>
</body></html>`, { fop: activeFop });
  };

  const status = (v) => {
    if (v.registered) return <span className="badge badge--success">ЄРПН {dots(v.registrationDate)}</span>;
    const dl = registrationDeadline(v);
    if (!dl) return null;
    const late = dl.date < today();
    return <span className={`badge ${late ? 'badge--danger' : 'badge--warning'}`} title={dl.by === 'buyer' ? 'Реєструє покупець: 18 днів з дня отримання' : 'Граничний строк реєстрації'}>
      {dl.by === 'buyer' ? 'покупець до ' : 'до '}{dots(dl.date)}</span>;
  };
  const tabBtn = (id, label) => <button className={`tab-pill${tab === id ? ' tab-pill--active' : ''}`} onClick={() => { setTab(id); setForm(null); setRkForm(null); setErr(''); }}>{label}</button>;
  const isDocTab = tab === 'outgoing' || tab === 'incoming';
  const ft = form ? vatTotals({ ...form, items: form.items.map(it => ({ ...it, base: r2((+it.qty || 1) * (+it.price || 0)) })) }) : null;

  return (
    <div className="view-vat">
      <div className="view-toolbar">
        <h2 className="view-title">ПДВ</h2>
        <div className="toolbar-actions">
          {isDocTab && <button className="btn btn--primary" onClick={() => { setErr(''); setRkForm(null); setForm(emptyPn(tab, vatInvoices)); }}>+ {tab === 'outgoing' ? 'Видана ПН' : 'Отримана ПН'}</button>}
        </div>
      </div>

      <div className="filters-bar">
        <div className="field"><label style={{ fontSize: '.78rem' }}>Звітний місяць</label>
          <input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ width: 160 }} /></div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 14 }}>
        <div className="stat-card"><div className="stat-label">Зобов'язання (рядок 9)</div><div className="stat-value">{fmtMoney(calc.obligVat)}</div></div>
        <div className="stat-card"><div className="stat-label">Кредит (рядок 17)</div><div className="stat-value" style={{ color: 'var(--success)' }}>{fmtMoney(calc.creditVat)}</div></div>
        <div className="stat-card stat-card--accent"><div className="stat-label">{calc.negative > 0 ? 'Від\'ємне значення' : `До сплати за ${period}`}</div>
          <div className="stat-value" style={{ color: calc.toPay > 0 ? 'var(--warning)' : undefined }}>{fmtMoney(calc.negative > 0 ? calc.negative : calc.toPay)}</div></div>
        <div className="stat-card"><div className="stat-label">Потребує уваги</div>
          <div className="stat-value" style={{ color: (events.length + retail.length + overdue.length + calc.pending.length) ? 'var(--warning)' : undefined }}>
            {events.length + retail.length + overdue.length + calc.pending.length}</div></div>
      </div>

      <div className="tabs-bar" style={{ marginBottom: 12 }}>
        {tabBtn('outgoing', 'Видані')}{tabBtn('incoming', 'Отримані')}
        {tabBtn('control', `Контроль (${events.length + retail.length + overdue.length + calc.pending.length})`)}
        {tabBtn('declaration', 'Декларація')}
      </div>
      {err && <div className="form-error" style={{ marginBottom: 10 }}>{err}</div>}

      {/* ─── Форма ПН ─── */}
      {form && (
        <div className="inline-form">
          <div className="inline-form-header">
            <span>{form.id ? 'Редагування' : 'Нова'} {form.direction === 'outgoing' ? 'видана' : 'отримана'} податкова накладна</span>
            <button className="btn-close" onClick={() => setForm(null)}>✕</button>
          </div>
          <div className="form-row-4">
            <div className="field"><label>Дата складання</label>
              <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value, number: p.direction === 'outgoing' && !p.id ? nextVatNumber(vatInvoices, e.target.value) : p.number }))} /></div>
            <div className="field"><label>Номер</label><input value={form.number} onChange={e => setF('number', e.target.value)} /></div>
            {form.direction === 'outgoing' && (
              <div className="field" style={{ gridColumn: 'span 2' }}><label>Вид накладної</label>
                <select value={form.spec || ''} onChange={e => applySpec(e.target.value)}>
                  {PN_SPECS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select></div>
            )}
          </div>
          <div className="form-row-4">
            <div className="field" style={{ gridColumn: 'span 2' }}><label>{form.direction === 'outgoing' ? 'Покупець' : 'Постачальник'}</label>
              <Autocomplete value={form.counterparty} options={clientOptions} placeholder="Назва"
                onChange={v => setF('counterparty', v)}
                onSelect={c => setForm(p => ({ ...p, counterparty: c.name, counterpartyTin: c.ipn || '', buyerIpn: c.vatIpn || (/^\d{10}$|^\d{12}$/.test(c.ipn || '') && c.isVatPayer ? c.ipn : p.buyerIpn) }))} /></div>
            <div className="field"><label>ІПН платника ПДВ</label>
              <input value={form.buyerIpn || ''} onChange={e => setF('buyerIpn', e.target.value.replace(/\D/g, ''))} maxLength={12} disabled={!!specOf(form).ipn} /></div>
            <div className="field"><label>Податковий номер (ЄДРПОУ / РНОКПП)</label>
              <input value={form.counterpartyTin || ''} onChange={e => setF('counterpartyTin', e.target.value.replace(/\D/g, ''))} maxLength={10} disabled={!!specOf(form).ipn} /></div>
          </div>
          {specOf(form).reasons && (
            <div className="field" style={{ maxWidth: 520 }}><label>Тип причини</label>
              <select value={form.reasonType} onChange={e => setF('reasonType', e.target.value)}>
                {specOf(form).reasons.map(r => <option key={r} value={r}>{r} — {REASON_TYPES[r]}</option>)}
              </select></div>
          )}
          <table className="data-table" style={{ marginTop: 8 }}>
            <thead><tr><th>Номенклатура</th><th style={{ width: 90 }}>Од.</th><th style={{ width: 110 }}>УКТ ЗЕД / ДКПП</th>
              <th style={{ width: 90 }}>К-сть</th><th style={{ width: 120 }}>Ціна без ПДВ</th><th style={{ width: 80 }}>Ставка</th>
              <th style={{ width: 120, textAlign: 'right' }}>Обсяг</th><th style={{ width: 30 }}></th></tr></thead>
            <tbody>{form.items.map((it, i) => (
              <tr key={i}>
                <td><input className="table-input" value={it.name} onChange={e => setItem(i, 'name', e.target.value)} /></td>
                <td><input className="table-input" value={it.unitName || ''} onChange={e => setItem(i, 'unitName', e.target.value)} /></td>
                <td><input className="table-input" value={it.uktzed || it.dkpp || ''} onChange={e => setItem(i, 'uktzed', e.target.value)} /></td>
                <td><input className="table-input" type="number" value={it.qty} onChange={e => setItem(i, 'qty', e.target.value)} /></td>
                <td><input className="table-input" type="number" step="0.01" value={it.price} onChange={e => setItem(i, 'price', e.target.value)} /></td>
                <td><select className="table-input" value={it.rate} onChange={e => setItem(i, 'rate', +e.target.value)}>
                  {VAT_RATE_LIST.map(r => <option key={r} value={r}>{r}%</option>)}</select></td>
                <td style={{ textAlign: 'right' }}>{fmtMoney((+it.qty || 1) * (+it.price || 0))}</td>
                <td><button className="btn-icon btn-icon--del" onClick={() => setForm(p => ({ ...p, items: p.items.length > 1 ? p.items.filter((_, j) => j !== i) : p.items }))}>✕</button></td>
              </tr>))}</tbody>
          </table>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            <button className="btn btn--ghost btn--sm" onClick={() => setForm(p => ({ ...p, items: [...p.items, EMPTY_ITEM()] }))}>+ Рядок</button>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={!!form.registered} onChange={e => setF('registered', e.target.checked)} /> Зареєстрована в ЄРПН</label>
            {form.registered && <input type="date" value={form.registrationDate || ''} onChange={e => setF('registrationDate', e.target.value)} style={{ width: 160 }} />}
            <span style={{ marginLeft: 'auto' }}>Без ПДВ: <b>{fmtMoney(ft.base)}</b> · ПДВ: <b>{fmtMoney(ft.vat)}</b> · Разом: <b>{fmtMoney(ft.total)}</b></span>
          </div>
          {form.direction === 'incoming' && !form.registered && (
            <p className="cell-muted" style={{ fontSize: '.82rem' }}>Податковий кредит за цією накладною буде враховано лише після реєстрації в ЄРПН (п. 198.6 ПКУ).</p>
          )}
          <div className="form-actions">
            <button className="btn btn--primary" onClick={savePn}>Зберегти</button>
            <button className="btn btn--ghost" onClick={() => setForm(null)}>Скасувати</button>
          </div>
        </div>
      )}

      {/* ─── Форма РК ─── */}
      {rkForm && (
        <div className="inline-form">
          <div className="inline-form-header">
            <span>Розрахунок коригування до ПН № {rkForm.pn.number} від {dots(rkForm.pn.date)} · {rkForm.pn.counterparty}</span>
            <button className="btn-close" onClick={() => setRkForm(null)}>✕</button>
          </div>
          <div className="form-row-4">
            <div className="field"><label>Дата складання</label>
              <input type="date" value={rkForm.date} onChange={e => setRkForm(p => ({ ...p, date: e.target.value, number: p.pn.direction === 'outgoing' ? nextVatNumber(vatInvoices, e.target.value) : p.number }))} /></div>
            <div className="field"><label>Номер</label><input value={rkForm.number} onChange={e => setRkForm(p => ({ ...p, number: e.target.value }))} /></div>
            <div className="field" style={{ gridColumn: 'span 2' }}><label>Причина коригування</label>
              <select value={rkForm.reasonCode} onChange={e => setRkForm(p => ({ ...p, reasonCode: e.target.value }))}>
                {RK_REASONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></div>
          </div>
          <table className="data-table" style={{ marginTop: 8 }}>
            <thead><tr><th>№</th><th>Номенклатура</th><th style={{ textAlign: 'right' }}>К-сть у ПН</th><th style={{ textAlign: 'right' }}>Ціна у ПН</th>
              <th style={{ width: 130 }}>Зміна кількості (±)</th><th style={{ width: 130 }}>Зміна ціни (±)</th><th style={{ textAlign: 'right' }}>Зміна обсягу</th></tr></thead>
            <tbody>{vatLines(rkForm.pn).map((l, i) => {
              const ch = rkForm.changes[i]; const res = rkItems.find(x => x.lineNo === i + 1);
              const setCh = (k, v) => setRkForm(p => ({ ...p, changes: p.changes.map((c, j) => (j === i ? { ...c, [k]: v } : c)) }));
              return (<tr key={i}><td>{i + 1}</td><td>{l.name || 'Товари/послуги'}</td>
                <td style={{ textAlign: 'right' }}>{+l.qty || 1}</td><td style={{ textAlign: 'right' }}>{fmtMoney(+l.price || l.base)}</td>
                <td><input className="table-input" type="number" value={ch.qtyDelta} onChange={e => setCh('qtyDelta', e.target.value)} placeholder="напр. -2" /></td>
                <td><input className="table-input" type="number" step="0.01" value={ch.priceDelta} onChange={e => setCh('priceDelta', e.target.value)} placeholder="напр. -100" /></td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{res ? fmtMoney(res.base) : ''}</td></tr>);
            })}</tbody>
          </table>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={rkForm.registered} onChange={e => setRkForm(p => ({ ...p, registered: e.target.checked }))} /> Зареєстровано в ЄРПН</label>
            {rkForm.registered && <input type="date" value={rkForm.registrationDate} onChange={e => setRkForm(p => ({ ...p, registrationDate: e.target.value }))} style={{ width: 160 }} />}
            <span style={{ marginLeft: 'auto' }}>Коригування обсягу: <b>{fmtMoney(rkDraft.amount)}</b> · ПДВ: <b>{fmtMoney(vatTotals(rkDraft).vat)}</b></span>
          </div>
          {rkItems.length > 0 && (
            <p className="cell-muted" style={{ fontSize: '.82rem' }}>
              {rkRegistrar(rkDraft) === 'buyer'
                ? 'Сума зменшується, покупець — платник ПДВ: розрахунок реєструє покупець (п. 192.1 ПКУ). Зобов\'язання зменшаться лише після реєстрації.'
                : rkForm.pn.direction === 'outgoing' ? 'Розрахунок реєструє постачальник.' : 'Розрахунок реєструє постачальник; зменшення кредиту враховується за датою складання.'}
            </p>
          )}
          <div className="form-actions">
            <button className="btn btn--primary" onClick={saveRk}>Зберегти РК</button>
            <button className="btn btn--ghost" onClick={() => setRkForm(null)}>Скасувати</button>
          </div>
        </div>
      )}

      {/* ─── Реєстр ─── */}
      {isDocTab && (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Дата</th><th>Тип</th><th>№</th><th>Контрагент</th><th>Підстава</th>
              <th style={{ textAlign: 'right' }}>Без ПДВ</th><th style={{ textAlign: 'right' }}>ПДВ</th><th>ЄРПН</th><th>Період</th><th></th></tr></thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={10} className="table-empty">Документів за {period} немає</td></tr> : rows.map(v => {
                const t = vatTotals(v); const slot = declarationSlot(v);
                return (
                  <tr key={v.id}>
                    <td>{dots(v.date)}</td>
                    <td>{v.kind === 'rk' ? <span className="badge badge--warning">РК</span> : <span className="badge badge--info">ПН</span>}
                      {isNonpayerPn(v) && <span className="badge" style={{ marginLeft: 4 }}>{v.reasonType || '02'}</span>}
                      {(v.consolidatedCode || isSelfPn(v)) && <span className="badge" style={{ marginLeft: 4 }}>звед.</span>}</td>
                    <td>{v.number}{v.kind === 'rk' && <span className="cell-muted"> до № {v.correctedNumber}</span>}</td>
                    <td>{v.counterparty}</td>
                    <td className="cell-muted">{v.basis === 'prepayment' ? `передоплата, рах. ${v.sourceInvoiceNumber || ''}` : v.basis === 'act' ? `акт, рах. ${v.sourceInvoiceNumber || ''}` : v.basis === 'retail' ? 'роздріб' : ''}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMoney(t.base)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(t.vat)}</td>
                    <td>{status(v)}</td>
                    <td title={slot.pending}>{slot.period || <span style={{ color: 'var(--warning)' }}>не враховано</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {tab === 'outgoing' && <button className="btn-icon" title="XML для ЄРПН" onClick={() => exportXml(v)}>⬇</button>}
                      {tab === 'outgoing' && v.kind !== 'rk' && <button className="btn-icon" title="Друк" onClick={() => printPn(v)}>🖨</button>}
                      {v.kind !== 'rk' && <button className="btn-icon" title="Розрахунок коригування" onClick={() => { setForm(null); openRk(v); }}>±</button>}
                      {!v.registered && v.kind !== 'rk' && <button className="btn-icon" title="Редагувати" onClick={() => { setRkForm(null); setErr(''); setForm({ ...v, items: vatLines(v).map(l => ({ ...l, price: l.price || l.base, qty: l.qty || 1 })), registrationDate: v.registrationDate || '' }); }}>✎</button>}
                      {!v.registered && <button className="btn-icon" title="Позначити зареєстрованою в ЄРПН" onClick={() => markRegistered(v)}>✓</button>}
                      <button className="btn-icon btn-icon--del" disabled={!!v.registered} title={v.registered ? 'Зареєстровано — лише коригування' : 'Видалити'} onClick={() => remove(v)}>✕</button>
                    </td>
                  </tr>);
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Контроль ─── */}
      {tab === 'control' && (
        <div>
          <div className="settings-section">
            <h3>Події без податкової накладної ({events.length})</h3>
            <p className="cell-muted" style={{ fontSize: '.83rem' }}>Правило першої події (п. 187.1 ПКУ): накладна потрібна на дату оплати або відвантаження — що сталося раніше. Передоплата береться з оплат рахунку, відвантаження — з актів і накладних.</p>
            {events.length === 0 ? <p className="cell-muted">Усі події закриті накладними.</p> : (
              <table className="data-table"><thead><tr><th>Дата події</th><th>Подія</th><th>Рахунок</th><th>Покупець</th><th style={{ textAlign: 'right' }}>Сума з ПДВ</th><th></th></tr></thead>
                <tbody>{events.map((e, i) => (
                  <tr key={i}><td>{dots(e.date)}</td><td>{e.kind === 'act' ? `Відвантаження, акт № ${e.act.number}` : 'Попередня оплата'}</td>
                    <td>{e.invoice.number}</td><td>{e.invoice.clientName}{clientOf(e.invoice) && !clientOf(e.invoice).isVatPayer ? <span className="cell-muted"> · неплатник</span> : ''}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMoney(e.amount)}</td>
                    <td><button className="btn btn--primary btn--sm" onClick={() => issueForEvent(e)}>Виписати ПН</button></td></tr>))}</tbody></table>
            )}
          </div>
          {retail.length > 0 && (
            <div className="settings-section" style={{ marginTop: 16 }}>
              <h3>Роздрібна виручка без підсумкової накладної ({retail.length})</h3>
              <p className="cell-muted" style={{ fontSize: '.83rem' }}>Продажі кінцевим споживачам через ПРРО: одна накладна за день, тип причини 11 (п. 201.4 ПКУ). Роздрібний акциз до бази ПДВ не входить.</p>
              <table className="data-table"><thead><tr><th>День</th><th style={{ textAlign: 'right' }}>Виручка</th><th style={{ textAlign: 'right' }}>у т. ч. акциз</th><th style={{ textAlign: 'right' }}>База ПДВ</th><th></th></tr></thead>
                <tbody>{retail.map(d => (<tr key={d.date}><td>{dots(d.date)}</td><td style={{ textAlign: 'right' }}>{fmtMoney(d.gross)}</td>
                  <td style={{ textAlign: 'right' }}>{fmtMoney(d.excise)}</td><td style={{ textAlign: 'right' }}>{fmtMoney(d.base)}</td>
                  <td><button className="btn btn--primary btn--sm" onClick={() => issueRetail(d)}>Підсумкова ПН</button></td></tr>))}</tbody></table>
            </div>
          )}
          <div className="settings-section" style={{ marginTop: 16 }}>
            <h3>Прострочена реєстрація виданих документів ({overdue.length})</h3>
            {overdue.length === 0 ? <p className="cell-muted">Прострочених немає.</p> : overdue.map(v => (
              <p key={v.id}>{v.kind === 'rk' ? 'РК' : 'ПН'} № {v.number} від {dots(v.date)}, {v.counterparty} — строк минув {dots(registrationDeadline(v).date)}</p>))}
          </div>
          <div className="settings-section" style={{ marginTop: 16 }}>
            <h3>Не враховано в розрахунку ({calc.pending.length})</h3>
            {calc.pending.length === 0 ? <p className="cell-muted">Усі документи враховано.</p> : calc.pending.map((p, i) => (
              <p key={i}>{p.doc.direction === 'incoming' ? 'Отримана' : 'Видана'} {p.doc.kind === 'rk' ? 'РК' : 'ПН'} № {p.doc.number} від {dots(p.doc.date)}, {p.doc.counterparty}: {p.reason}</p>))}
          </div>
        </div>
      )}

      {/* ─── Декларація ─── */}
      {tab === 'declaration' && (
        <div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th style={{ width: 70 }}>Рядок</th><th>Показник</th><th style={{ textAlign: 'right' }}>Обсяг без ПДВ</th><th style={{ textAlign: 'right' }}>ПДВ</th></tr></thead>
              <tbody>{declRows().map(([n, label, base, vat, bold]) => (
                <tr key={n} style={bold ? { fontWeight: 700 } : undefined}><td>{n}</td><td>{label}</td>
                  <td style={{ textAlign: 'right' }}>{base == null ? '' : fmtMoney(base)}</td><td style={{ textAlign: 'right' }}>{fmtMoney(vat)}</td></tr>))}</tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="btn btn--primary" onClick={printDeclaration}>🖨 Друк розрахунку</button>
          </div>
          <p className="cell-muted" style={{ fontSize: '.82rem', marginTop: 8 }}>
            Це робочий розрахунок рядків декларації, а не офіційна форма з додатками. Від'ємне значення попереднього місяця
            переноситься автоматично. Імпорт, послуги від нерезидентів, бюджетне відшкодування і уточнюючі розрахунки не обробляються.
          </p>
        </div>
      )}
    </div>
  );
};

export default VatView;
