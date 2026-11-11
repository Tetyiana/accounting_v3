import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useFop } from '../context/FopContext';
import { buildLedgerEntries, LEDGER_ACCOUNTS } from '../utils/accountingLogic';
import { buildSettlements } from '../utils/settlements';
import { fmtMoney } from '../utils/documentLogic';
import { openPrintWindow } from '../utils/printWindow';

// Бухгалтерія (спрощений облік ФОП):
// 1) Шахматка — оборотно-шахова відомість Дт×Кт за період
// 2) Журнал-ордер по обраному рахунку (усі проводки де рахунок бере участь)

const round2 = n => Math.round((+n || 0) * 100) / 100;
const signLabel = (v) => (v > 0 ? ' (Дт)' : v < 0 ? ' (Кт)' : '');
const monthAgo = () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10); };

const AccountingView = () => {
  const { transactions, acts, invoices, payments } = useData();
  const { activeFop } = useFop();
  const [tab, setTab] = useState('chess');
  const [dateStart, setDateStart] = useState(monthAgo());
  const [dateEnd, setDateEnd] = useState(new Date().toISOString().slice(0, 10));
  const [selAcc, setSelAcc] = useState('31');

  const allEntries = useMemo(
    () => buildLedgerEntries(transactions, { acts, invoices, payments }),
    [transactions, acts, invoices, payments]);
  const entries = useMemo(() => allEntries
    .filter(e => (!dateStart || e.date >= dateStart) && (!dateEnd || e.date <= dateEnd)),
    [allEntries, dateStart, dateEnd]);

  // Сальдо обраного рахунка: на початок періоду, обороти, на кінець (Дт − Кт)
  const accBalance = useMemo(() => {
    const side = (e) => (e.debit.code === selAcc ? e.amount : 0) - (e.credit.code === selAcc ? e.amount : 0);
    const opening = round2(allEntries.filter(e => dateStart && e.date < dateStart).reduce((s, e) => s + side(e), 0));
    const closing = round2(allEntries.filter(e => !dateEnd || e.date <= dateEnd).reduce((s, e) => s + side(e), 0));
    return { opening, closing };
  }, [allEntries, selAcc, dateStart, dateEnd]);

  // Розрахунки по контрагентах на кінець періоду — для рахунків 36 і 63
  const partyRows = useMemo(() => {
    if (selAcc !== '36' && selAcc !== '63') return [];
    const side = selAcc === '36' ? 'customer' : 'supplier';
    return buildSettlements({ acts, invoices, payments, transactions, asOf: dateEnd })
      .filter(p => p.side === side && (p.billed || p.received))
      .sort((a, b) => a.name.localeCompare(b.name, 'uk'));
  }, [selAcc, acts, invoices, payments, transactions, dateEnd]);

  // Шахматка: matrix[дебет][кредит] = сума
  const chess = useMemo(() => {
    const codes = new Set();
    const matrix = {};
    entries.forEach(e => {
      codes.add(e.debit.code); codes.add(e.credit.code);
      matrix[e.debit.code] = matrix[e.debit.code] || {};
      matrix[e.debit.code][e.credit.code] = round2((matrix[e.debit.code][e.credit.code] || 0) + e.amount);
    });
    const sorted = [...codes].sort();
    const debitTotals = {}, creditTotals = {};
    sorted.forEach(d => {
      debitTotals[d] = round2(sorted.reduce((s, c) => s + (matrix[d]?.[c] || 0), 0));
      creditTotals[d] = round2(sorted.reduce((s, c) => s + (matrix[c]?.[d] || 0), 0));
    });
    return { codes: sorted, matrix, debitTotals, creditTotals };
  }, [entries]);

  // Журнал-ордер по рахунку
  const accEntries = useMemo(() =>
    entries.filter(e => e.debit.code === selAcc || e.credit.code === selAcc),
    [entries, selAcc]);
  const accTotals = useMemo(() => ({
    debit:  round2(accEntries.filter(e => e.debit.code === selAcc).reduce((s, e) => s + e.amount, 0)),
    credit: round2(accEntries.filter(e => e.credit.code === selAcc).reduce((s, e) => s + e.amount, 0)),
  }), [accEntries, selAcc]);

  const printChess = () => {
    const { codes, matrix, debitTotals, creditTotals } = chess;
    const html = `<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8"><title>Шахматка</title>
<style>body{font-family:Arial,sans-serif;font-size:10.5px;margin:24px}h2{font-size:14px;text-align:center}
table{border-collapse:collapse;width:100%;margin-top:8px}td,th{border:1px solid #333;padding:3px 5px;text-align:right}
th{background:#f0f0f0}td:first-child,th:first-child{text-align:left}
@media print{body{margin:10mm}}</style></head><body>
<h2>Оборотно-шахова відомість</h2>
<p style="text-align:center">ФОП ${activeFop?.fullName || ''} · ${dateStart} — ${dateEnd}</p>
<table><thead><tr><th>Дт \\ Кт</th>${codes.map(c => `<th>${c}</th>`).join('')}<th>Разом Дт</th></tr></thead>
<tbody>${codes.map(d => `<tr><td><b>${d}</b> ${LEDGER_ACCOUNTS[d] || ''}</td>${codes.map(c =>
  `<td>${matrix[d]?.[c] ? fmtMoney(matrix[d][c]) : ''}</td>`).join('')}<td><b>${debitTotals[d] ? fmtMoney(debitTotals[d]) : ''}</b></td></tr>`).join('')}
<tr><td><b>Разом Кт</b></td>${codes.map(c => `<td><b>${creditTotals[c] ? fmtMoney(creditTotals[c]) : ''}</b></td>`).join('')}<td></td></tr>
</tbody></table></body></html>`;
    openPrintWindow(html, { fop: activeFop });
  };

  const printJournalOrder = () => {
    const html = `<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8"><title>Журнал-ордер ${selAcc}</title>
<style>body{font-family:Arial,sans-serif;font-size:11px;margin:24px}h2{font-size:14px;text-align:center}
table{border-collapse:collapse;width:100%;margin-top:8px}td,th{border:1px solid #333;padding:4px 6px}
th{background:#f0f0f0}@media print{body{margin:10mm}}</style></head><body>
<h2>Журнал-ордер по рахунку ${selAcc} «${LEDGER_ACCOUNTS[selAcc] || ''}»</h2>
<p style="text-align:center">ФОП ${activeFop?.fullName || ''} · ${dateStart} — ${dateEnd}</p>
<table><thead><tr><th>Дата</th><th>Контрагент</th><th>Зміст</th><th>Дт</th><th>Кт</th><th align="right">Сума, грн</th></tr></thead>
<tbody>${accEntries.map(e => `<tr><td>${e.date}</td><td>${e.counterparty}</td><td>${e.description}</td>
<td>${e.debit.code}</td><td>${e.credit.code}</td><td align="right">${fmtMoney(e.amount)}</td></tr>`).join('')}
<tr><td colspan="5" align="right"><b>Оборот по дебету рахунка ${selAcc}:</b></td><td align="right"><b>${fmtMoney(accTotals.debit)}</b></td></tr>
<tr><td colspan="5" align="right"><b>Оборот по кредиту рахунка ${selAcc}:</b></td><td align="right"><b>${fmtMoney(accTotals.credit)}</b></td></tr>
</tbody></table></body></html>`;
    openPrintWindow(html, { fop: activeFop });
  };

  return (
    <div className="view-accounting">
      <div className="view-toolbar">
        <h2 className="view-title">Бухгалтерія</h2>
        <div className="toolbar-actions">
          {tab === 'chess' && <button className="btn btn--primary" onClick={printChess}>🖨 Шахматка</button>}
          {tab === 'order' && <button className="btn btn--primary" onClick={printJournalOrder}>🖨 Журнал-ордер</button>}
        </div>
      </div>

      <div className="tabs-bar" style={{ marginBottom: 12 }}>
        <button className={`tab-pill${tab === 'chess' ? ' tab-pill--active' : ''}`} onClick={() => setTab('chess')}>Шахматка</button>
        <button className={`tab-pill${tab === 'order' ? ' tab-pill--active' : ''}`} onClick={() => setTab('order')}>Журнал-ордер по рахунку</button>
      </div>

      <div className="filters-bar">
        <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} />
        <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
        {tab === 'order' && (
          <select value={selAcc} onChange={e => setSelAcc(e.target.value)} style={{ maxWidth: 280 }}>
            {Object.entries(LEDGER_ACCOUNTS).map(([code, label]) =>
              <option key={code} value={code}>{code} — {label}</option>)}
          </select>
        )}
      </div>

      {tab === 'chess' && (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr>
              <th>Дт \ Кт</th>
              {chess.codes.map(c => <th key={c} style={{ textAlign: 'right' }} title={LEDGER_ACCOUNTS[c]}>{c}</th>)}
              <th style={{ textAlign: 'right' }}>Разом Дт</th>
            </tr></thead>
            <tbody>
              {chess.codes.length === 0 ? (
                <tr><td colSpan={2} className="table-empty">Проводок за період немає</td></tr>
              ) : chess.codes.map(d => (
                <tr key={d}>
                  <td><b>{d}</b> <span className="cell-muted">{LEDGER_ACCOUNTS[d]}</span></td>
                  {chess.codes.map(c => (
                    <td key={c} style={{ textAlign: 'right' }}>
                      {chess.matrix[d]?.[c] ? fmtMoney(chess.matrix[d][c]) : ''}
                    </td>
                  ))}
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{chess.debitTotals[d] ? fmtMoney(chess.debitTotals[d]) : ''}</td>
                </tr>
              ))}
              {chess.codes.length > 0 && (
                <tr>
                  <td style={{ fontWeight: 700 }}>Разом Кт</td>
                  {chess.codes.map(c => (
                    <td key={c} style={{ textAlign: 'right', fontWeight: 700 }}>
                      {chess.creditTotals[c] ? fmtMoney(chess.creditTotals[c]) : ''}
                    </td>
                  ))}
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'order' && (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Дата</th><th>Контрагент</th><th>Зміст</th><th>Дт</th><th>Кт</th><th style={{ textAlign: 'right' }}>Сума</th></tr></thead>
            <tbody>
              {accEntries.length === 0 ? (
                <tr><td colSpan={6} className="table-empty">Проводок немає</td></tr>
              ) : accEntries.map(e => (
                <tr key={e.id}>
                  <td>{e.date}</td><td>{e.counterparty || '—'}</td>
                  <td className="cell-muted">{e.description || '—'}</td>
                  <td>{e.debit.code}</td><td>{e.credit.code}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(e.amount)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={5} style={{ fontWeight: 700, textAlign: 'right' }}>Сальдо на початок періоду{signLabel(accBalance.opening)}:</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoney(Math.abs(accBalance.opening))}</td>
              </tr>
              <tr>
                <td colSpan={5} style={{ fontWeight: 700, textAlign: 'right' }}>Оборот по дебету рахунка {selAcc}:</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoney(accTotals.debit)}</td>
              </tr>
              <tr>
                <td colSpan={5} style={{ fontWeight: 700, textAlign: 'right' }}>Оборот по кредиту рахунка {selAcc}:</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoney(accTotals.credit)}</td>
              </tr>
              <tr>
                <td colSpan={5} style={{ fontWeight: 700, textAlign: 'right' }}>Сальдо на кінець періоду{signLabel(accBalance.closing)}:</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoney(Math.abs(accBalance.closing))}</td>
              </tr>
            </tbody>
          </table>

          {partyRows.length > 0 && (
            <>
              <h3 style={{ margin: '18px 0 8px', fontSize: '1rem' }}>
                {selAcc === '36' ? 'Розрахунки з покупцями' : 'Розрахунки з постачальниками'} на {dateEnd || 'сьогодні'}
              </h3>
              <table className="data-table">
                <thead><tr>
                  <th>Контрагент</th>
                  <th style={{ textAlign: 'right' }}>{selAcc === '36' ? 'Акти, накладні' : 'Отримано за актами'}</th>
                  <th style={{ textAlign: 'right' }}>Оплачено</th>
                  <th style={{ textAlign: 'right' }}>{selAcc === '36' ? 'Борг покупця' : 'Наш борг'}</th>
                  <th style={{ textAlign: 'right' }}>Аванс</th>
                  <th>Неоплачені документи</th>
                </tr></thead>
                <tbody>
                  {partyRows.map(p => (
                    <tr key={p.key}>
                      <td>{p.name}</td>
                      <td style={{ textAlign: 'right' }}>{fmtMoney(p.billed)}</td>
                      <td style={{ textAlign: 'right' }}>{fmtMoney(p.received)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{p.balance > 0 ? fmtMoney(p.balance) : '—'}</td>
                      <td style={{ textAlign: 'right' }}>{p.advance > 0 ? fmtMoney(p.advance) : '—'}</td>
                      <td className="cell-muted">
                        {p.docs.filter(d => d.remaining > 0).map(d =>
                          `№${d.act.number || 'б/н'} від ${d.act.date} — ${fmtMoney(d.remaining)}`).join('; ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default AccountingView;
