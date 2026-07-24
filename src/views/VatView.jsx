import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useFop } from '../context/FopContext';
import { fmtMoney } from '../utils/documentLogic';
import { openPrintWindow } from '../utils/printWindow';
import { buildPnXml, downloadXml } from '../utils/xmlDps';

// Модуль ПДВ: реєстр виданих/отриманих ПН і РК, місячний розрахунок,
// друкована декларація з ПДВ + XML-експорт ПН для е-кабінету.
// Ставки: 20% (основна), 14% (окремі с/г продукти), 7% (ліки, книги, готельні),
// 0% (експорт). РК (розрахунок коригування) вводиться сумою зі знаком.

const RATES = [20, 14, 7, 0];
const round2 = n => Math.round((+n || 0) * 100) / 100;
const EMPTY = {
  date: new Date().toISOString().slice(0, 10),
  number: '', direction: 'outgoing', counterparty: '', amount: '',
  rate: 20, kind: 'pn',
};
const thisMonth = () => new Date().toISOString().slice(0, 7);
const RATE_LABEL = { 20: 'Р.1.1', 14: 'Р.1.2', 7: 'Р.1.3', 0: 'Р.2/Р.3' };
const CREDIT_ROW = { 20: 'Р.10.1', 14: 'Р.10.2', 7: 'Р.10.3', 0: 'Р.10.4' };

const VatView = () => {
  const { vatInvoices, addVatInvoice, deleteVatInvoice } = useData();
  const { activeFop } = useFop();
  const [tab, setTab] = useState('outgoing');
  const [period, setPeriod] = useState(thisMonth());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [err, setErr] = useState('');
  const set = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const handleSave = () => {
    if (!form.number || !form.counterparty || !form.amount || !form.date) { setErr('Заповніть обов\'язкові поля'); return; }
    if (isNaN(+form.amount)) { setErr('Некоректна сума'); return; }
    if (form.kind === 'pn' && +form.amount <= 0) { setErr('Сума ПН має бути > 0 (для коригування — оберіть РК)'); return; }
    addVatInvoice({ ...form, direction: tab, rate: +form.rate });
    setShowForm(false); setForm(EMPTY); setErr('');
  };

  const enriched = useMemo(() => [...vatInvoices]
    .map(v => {
      const base = +v.amount || 0;
      const rate = v.rate == null ? 20 : +v.rate;
      return { ...v, base, rate, vat: round2(base * rate / 100), total: round2(base * (1 + rate / 100)) };
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')),
  [vatInvoices]);

  const inPeriod = useMemo(() => enriched.filter(v => (v.date || '').startsWith(period)), [enriched, period]);
  const tabRows  = useMemo(() => inPeriod.filter(v => v.direction === tab), [inPeriod, tab]);

  const calc = useMemo(() => {
    const out = inPeriod.filter(v => v.direction === 'outgoing');
    const inc = inPeriod.filter(v => v.direction === 'incoming');
    const byRate = (arr, rate) => arr.filter(v => v.rate === rate);
    const sumBase = arr => round2(arr.reduce((s, v) => s + v.base, 0));
    const sumVat  = arr => round2(arr.reduce((s, v) => s + v.vat, 0));

    const oblig = { 20: { base: sumBase(byRate(out, 20)), vat: sumVat(byRate(out, 20)) },
                    14: { base: sumBase(byRate(out, 14)), vat: sumVat(byRate(out, 14)) },
                    7:  { base: sumBase(byRate(out, 7)),  vat: sumVat(byRate(out, 7))  },
                    0:  { base: sumBase(byRate(out, 0)),  vat: 0 } };
    const credit = { 20: { base: sumBase(byRate(inc, 20)), vat: sumVat(byRate(inc, 20)) },
                     14: { base: sumBase(byRate(inc, 14)), vat: sumVat(byRate(inc, 14)) },
                     7:  { base: sumBase(byRate(inc, 7)),  vat: sumVat(byRate(inc, 7))  },
                     0:  { base: sumBase(byRate(inc, 0)),  vat: 0 } };
    const obligVat  = round2(oblig[20].vat + oblig[14].vat + oblig[7].vat);
    const creditVat = round2(credit[20].vat + credit[14].vat + credit[7].vat);
    const diff = round2(obligVat - creditVat);
    return { oblig, credit, obligVat, creditVat,
             toPay: diff > 0 ? diff : 0, negative: diff < 0 ? -diff : 0 };
  }, [inPeriod]);

  const printDeclaration = () => {
    const [y, m] = period.split('-');
    const oblRows = RATES.filter(r => r > 0).map(r => `
<tr><td>${RATE_LABEL[r]} Постачання зі ставкою ${r}%</td>
  <td align="right">${fmtMoney(calc.oblig[r].base)}</td>
  <td align="right">${fmtMoney(calc.oblig[r].vat)}</td></tr>`).join('');
    const zeroRow = calc.oblig[0].base > 0
      ? `<tr><td>Р.2/Р.3 Постачання за ставкою 0% (експорт/інші)</td>
          <td align="right">${fmtMoney(calc.oblig[0].base)}</td><td align="right">0.00</td></tr>` : '';
    const creditRows = RATES.filter(r => r > 0).map(r => calc.credit[r].base > 0 ? `
<tr><td>${CREDIT_ROW[r]} Придбання з ПДВ ${r}%</td>
  <td align="right">${fmtMoney(calc.credit[r].base)}</td>
  <td align="right">${fmtMoney(calc.credit[r].vat)}</td></tr>` : '').join('');

    const html = `<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8"><title>Декларація з ПДВ</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;margin:30px;line-height:1.45}
h2{font-size:14px;text-align:center}table{width:100%;border-collapse:collapse;margin:10px 0}
td,th{border:1px solid #333;padding:5px 8px}.nb td{border:none;padding:2px 4px}
@media print{body{margin:12mm}}</style></head><body>
<h2>ПОДАТКОВА ДЕКЛАРАЦІЯ З ПОДАТКУ НА ДОДАНУ ВАРТІСТЬ</h2>
<p style="text-align:center">Звітний період: ${m}.${y}</p>
<table class="nb">
<tr><td width="40%">Платник:</td><td><b>ФОП ${activeFop?.fullName || ''}</b></td></tr>
<tr><td>ІПН платника ПДВ:</td><td>${activeFop?.vatCertificate || activeFop?.rnokpp || ''}</td></tr>
<tr><td>Податкова адреса:</td><td>${activeFop?.legalAddress || ''}</td></tr>
</table>
<table>
<tr><th>Показник (рядок декларації)</th><th align="right">Обсяг без ПДВ</th><th align="right">ПДВ</th></tr>
${oblRows}${zeroRow}
<tr><td><b>Р.9 Усього податкових зобов'язань</b></td>
  <td align="right"></td><td align="right"><b>${fmtMoney(calc.obligVat)}</b></td></tr>
${creditRows || '<tr><td>Р.10 Податковий кредит</td><td align="right">0.00</td><td align="right">0.00</td></tr>'}
<tr><td><b>Р.17 Усього податкового кредиту</b></td>
  <td align="right"></td><td align="right"><b>${fmtMoney(calc.creditVat)}</b></td></tr>
<tr><td><b>Р.18 Позитивне значення (ПДВ до сплати)</b></td>
  <td align="right"></td><td align="right"><b>${fmtMoney(calc.toPay)}</b></td></tr>
<tr><td>Р.19 Від'ємне значення (до складу кредиту наст. періоду)</td>
  <td align="right"></td><td align="right">${fmtMoney(calc.negative)}</td></tr>
</table>
<p style="font-size:10.5px">Сформовано для контролю і перенесення в Електронний кабінет.
Строк подання — 20 к.д. після місяця; сплата — 10 к.д. після граничного строку подання.</p>
<div style="margin-top:30px;display:flex;justify-content:space-between">
<div>Дата: ${new Date().toISOString().slice(0, 10)}</div>
<div>Підпис: ___________________</div>
</div></body></html>`;
    openPrintWindow(html);
  };

  const exportPnXml = (v) => {
    const { xml, name } = buildPnXml({
      fop: activeFop,
      pn: {
        date: v.date, number: v.number, counterparty: v.counterparty,
        counterpartyTin: v.counterpartyTin || '', base: v.base, rate: v.rate,
        description: v.description || 'Товари/послуги',
      },
    });
    downloadXml(xml, name);
  };

  return (
    <div className="view-vat">
      <div className="view-toolbar">
        <h2 className="view-title">ПДВ</h2>
        <div className="toolbar-actions">
          <button className="btn btn--primary" onClick={() => { setForm({ ...EMPTY, kind: 'pn' }); setShowForm(true); }}>+ ПН</button>
          <button className="btn btn--ghost" onClick={() => { setForm({ ...EMPTY, kind: 'rk' }); setShowForm(true); }}>+ РК</button>
          <button className="btn btn--ghost" onClick={printDeclaration}>🖨 Декларація</button>
        </div>
      </div>

      <div className="filters-bar">
        <div className="field"><label style={{ fontSize: '.78rem' }}>Звітний місяць</label>
          <input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ width: 160 }} /></div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 14 }}>
        <div className="stat-card"><div className="stat-label">Зобов'язання (видані ПН)</div>
          <div className="stat-value">{fmtMoney(calc.obligVat)}</div></div>
        <div className="stat-card"><div className="stat-label">Кредит (отримані ПН)</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{fmtMoney(calc.creditVat)}</div></div>
        <div className="stat-card stat-card--accent"><div className="stat-label">До сплати за {period}</div>
          <div className="stat-value" style={{ color: calc.toPay > 0 ? 'var(--warning)' : undefined }}>{fmtMoney(calc.toPay)}</div></div>
        {calc.negative > 0 && (
          <div className="stat-card"><div className="stat-label">Від'ємне значення</div>
            <div className="stat-value" style={{ color: 'var(--success)' }}>{fmtMoney(calc.negative)}</div></div>
        )}
      </div>

      <div className="tabs-bar" style={{ marginBottom: 12 }}>
        <button className={`tab-pill${tab === 'outgoing' ? ' tab-pill--active' : ''}`} onClick={() => setTab('outgoing')}>
          Видані ({inPeriod.filter(v => v.direction === 'outgoing').length})</button>
        <button className={`tab-pill${tab === 'incoming' ? ' tab-pill--active' : ''}`} onClick={() => setTab('incoming')}>
          Отримані ({inPeriod.filter(v => v.direction === 'incoming').length})</button>
      </div>

      {showForm && (
        <div className="inline-form">
          <div className="inline-form-header">
            <span>Нова {tab === 'outgoing' ? 'видана' : 'отримана'} {form.kind === 'rk' ? 'РК (розрахунок коригування)' : 'ПН'}</span>
            <button className="btn-close" onClick={() => setShowForm(false)}>✕</button>
          </div>
          {err && <div className="form-error">{err}</div>}
          <div className="form-row-4">
            <div className="field"><label>Дата складання</label>
              <input type="date" name="date" value={form.date} onChange={set} /></div>
            <div className="field"><label>Номер</label>
              <input name="number" value={form.number} onChange={set} /></div>
            <div className="field"><label>Контрагент</label>
              <input name="counterparty" value={form.counterparty} onChange={set} /></div>
            <div className="field"><label>Ставка</label>
              <select name="rate" value={form.rate} onChange={set}>
                {RATES.map(r => <option key={r} value={r}>{r}%</option>)}
              </select></div>
            <div className="field"><label>База без ПДВ, грн{form.kind === 'rk' ? ' (може бути -)' : ''}</label>
              <input type="number" name="amount" value={form.amount} onChange={set} step="0.01" /></div>
          </div>
          {form.amount !== '' && !isNaN(+form.amount) && (
            <p className="cell-muted" style={{ fontSize: '.83rem' }}>
              ПДВ {form.rate}%: <b>{fmtMoney((+form.amount) * form.rate / 100)}</b> ·
              Разом: <b>{fmtMoney((+form.amount) * (1 + form.rate / 100))}</b>
            </p>
          )}
          <div className="form-actions">
            <button className="btn btn--primary" onClick={handleSave}>Зберегти</button>
            <button className="btn btn--ghost" onClick={() => setShowForm(false)}>Скасувати</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Дата</th><th>Тип</th><th>№</th><th>Контрагент</th><th>Ставка</th>
            <th style={{ textAlign: 'right' }}>База</th>
            <th style={{ textAlign: 'right' }}>ПДВ</th>
            <th style={{ textAlign: 'right' }}>Разом</th><th></th></tr></thead>
          <tbody>
            {tabRows.length === 0 ? (
              <tr><td colSpan={9} className="table-empty">Записів за {period} немає</td></tr>
            ) : tabRows.map(v => (
              <tr key={v.id}>
                <td>{v.date}</td>
                <td>{v.kind === 'rk' ? <span className="badge badge--warning">РК</span> : <span className="badge badge--info">ПН</span>}</td>
                <td>{v.number}</td><td>{v.counterparty}</td>
                <td>{v.rate}%</td>
                <td style={{ textAlign: 'right' }}>{fmtMoney(v.base)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(v.vat)}</td>
                <td style={{ textAlign: 'right' }}>{fmtMoney(v.total)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {tab === 'outgoing' && v.kind === 'pn' && (
                    <button className="btn-icon" title="XML для кабінету" onClick={() => exportPnXml(v)}>⬇</button>
                  )}
                  <button className="btn-icon btn-icon--del"
                    onClick={() => window.confirm('Видалити запис?') && deleteVatInvoice(v.id)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default VatView;
