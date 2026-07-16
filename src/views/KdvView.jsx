import React, { useState, useMemo, useRef } from 'react';
import { useData } from '../context/DataContext';
import { useSettings } from '../context/SettingsContext';
import { useFop } from '../context/FopContext';
import { KDV_CONFIGS, QUARTER_LABEL, HALF_LABEL } from '../constants/kdvConfig';
import { buildKdvEntries, fmtMoney } from '../utils/documentLogic';
import { exportCSV } from '../utils/exportUtils';
import { openPrintWindow } from '../utils/printWindow';

const PERIODS = [
  { id: 'day',   label: 'По днях' },
  { id: 'month', label: 'По місяцях' },
];

const MONTHS_UK = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];

const sumField = (rows, key) => rows.reduce((s, r) => s + (+r[key]||0), 0);

const TotalRow = ({ label, rows, columns, bold = false }) => (
  <tr className="kdv-total-row" style={bold ? { fontWeight: 700, background: 'var(--mint-50)' } : { fontWeight: 600, background: 'var(--saffron-50)' }}>
    <td colSpan={3} style={{ paddingLeft: 12 }}>{label}</td>
    {columns.slice(3).map(col => (
      <td key={col.key} style={{ textAlign: 'right', paddingRight: 12 }}>
        {col.total ? fmtMoney(sumField(rows, col.key)) : ''}
      </td>
    ))}
  </tr>
);

const KdvView = () => {
  const { transactions, invoices, acts, payments } = useData();
  const { settings }  = useSettings();
  const { activeFop } = useFop();

  const year  = new Date().getFullYear();
  const [selYear,  setSelYear]  = useState(year);
  const [selMonth, setSelMonth] = useState(0); // 0 = весь рік

  const config = KDV_CONFIGS[settings.taxGroup] || KDV_CONFIGS['3_5'];

  const diag = useMemo(() => {
    const incomeTx = transactions.filter(t => t.type === 'income');
    const years = [...new Set(incomeTx.map(t => (t.date||'').slice(0,4)).filter(Boolean))].sort();
    return { totalTx: transactions.length, incomeTx: incomeTx.length, years };
  }, [transactions]);

  const allEntries = useMemo(() => {
    try {
      return buildKdvEntries({ invoices, acts, payments, transactions, taxGroup: settings.taxGroup }) || [];
    } catch(e) {
      console.error('КДВ помилка:', e);
      return [];
    }
  }, [invoices, acts, payments, transactions, settings.taxGroup]);

  const entries = useMemo(() => {
    if (!Array.isArray(allEntries)) return [];
    return allEntries.filter(e => {
      const d = e.date || '';
      const entryYear  = +d.slice(0,4);
      const entryMonth = +d.slice(5,7);
      if (entryYear !== selYear) return false;
      if (selMonth !== 0 && entryMonth !== selMonth) return false;
      return true;
    });
  }, [allEntries, selYear, selMonth]);

  // ─── Порівняння з банком ────────────────────────────────────────
  const bankIncome = useMemo(() => {
    return transactions
      .filter(t => t.type === 'income')
      .filter(t => {
        const d = t.date || '';
        const y = +d.slice(0,4), m = +d.slice(5,7);
        if (y !== selYear) return false;
        if (selMonth && m !== selMonth) return false;
        return true;
      })
      .reduce((s, t) => s + (+t.amount||0), 0);
  }, [transactions, selYear, selMonth]);

  const kdvIncome   = sumField(entries, 'income');
  const hasMismatch = Math.abs(kdvIncome - bankIncome) > 0.01;

  // ─── Групування для підсумків ───────────────────────────────────
  // Рядки згруповані: звичайні записи + підсумки місяць/квартал/рік
  const tableRows = useMemo(() => {
    const rows = [];
    const byMonth = {};
    entries.forEach(e => {
      const m = +(e.date||'').slice(5,7);
      if (!byMonth[m]) byMonth[m] = [];
      byMonth[m].push(e);
    });

    const months = Object.keys(byMonth).map(Number).sort((a,b)=>a-b);

    months.forEach(m => {
      rows.push(...byMonth[m].map(e => ({ type: 'data', data: e })));
      rows.push({ type: 'month', label: `Разом за ${MONTHS_UK[m-1]}`, rows: byMonth[m] });

      // Квартальний підсумок
      if ([3, 6, 9, 12].includes(m)) {
        const qIdx  = Math.floor((m - 1) / 3);
        const qRows = months.filter(mm => Math.floor((mm-1)/3) === qIdx).flatMap(mm => byMonth[mm] || []);
        rows.push({ type: 'quarter', label: `Разом за ${QUARTER_LABEL[qIdx]}`, rows: qRows });
      }

      // Піврічний підсумок
      if ([6, 12].includes(m)) {
        const hIdx   = m <= 6 ? 0 : 1;
        const hStart = hIdx === 0 ? 1 : 7;
        const hEnd   = hIdx === 0 ? 6 : 12;
        const hRows  = months.filter(mm => mm >= hStart && mm <= hEnd).flatMap(mm => byMonth[mm]||[]);
        rows.push({ type: 'half', label: `Разом за ${HALF_LABEL[hIdx]}`, rows: hRows });
      }

      // 9 місяців
      if (m === 9) {
        const r9 = months.filter(mm => mm <= 9).flatMap(mm => byMonth[mm]||[]);
        rows.push({ type: 'nine', label: 'Разом за 9 місяців', rows: r9 });
      }
    });

    if (months.length > 0) {
      rows.push({ type: 'year', label: `Разом за ${selYear} рік`, rows: entries });
    }

    return rows;
  }, [entries, selYear]);

  // ─── Експорт CSV ───────────────────────────────────────────────
  const handleExportCsv = () => {
    const cols = config.columns.map(c => ({ key: c.key, label: c.label }));
    exportCSV(entries, cols, `КДВ_${selYear}${selMonth?'_'+selMonth:''}.csv`);
  };

  // Формування друкованої книги (форма для подання/зберігання)
  const handlePrint = () => {
    const cols = config.columns;
    const rowsHtml = entries.map(e => `<tr>${cols.map(c => {
      const v = e[c.key];
      const num = typeof v === 'number';
      return `<td align="${c.align || (num ? 'right' : 'left')}">${num ? fmtMoney(v) : (v ?? '')}</td>`;
    }).join('')}</tr>`).join('');
    const totals = cols.map(c => {
      if (c.key === 'num')  return '<td></td>';
      if (c.key === 'date') return '<td><b>Разом</b></td>';
      const sum = entries.reduce((s2, e) => typeof e[c.key] === 'number' ? s2 + e[c.key] : s2, 0);
      return `<td align="right"><b>${sum ? fmtMoney(sum) : ''}</b></td>`;
    }).join('');
    const html = `<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8">
<title>${config.title} ${selYear}</title>
<style>body{font-family:Arial,sans-serif;font-size:11px;margin:24px;color:#111}
h2{font-size:15px;text-align:center;margin:6px 0}.center{text-align:center}
table{width:100%;border-collapse:collapse;margin-top:10px}
td,th{border:1px solid #333;padding:4px 6px}th{background:#f0f0f0}
@media print{body{margin:10mm}}</style></head><body>
<h2>${config.title}</h2>
<p class="center">${config.subtitle || ''}</p>
<p class="center">ФОП ${activeFop?.fullName || ''} · РНОКПП ${activeFop?.rnokpp || ''}<br>
за ${selMonth ? MONTHS_UK[selMonth-1] + ' ' : ''}${selYear} р.</p>
<table><thead><tr>${cols.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>
<tbody>${rowsHtml || `<tr><td colspan="${cols.length}" align="center">Записів немає</td></tr>`}</tbody>
<tfoot><tr>${totals}</tr></tfoot></table>
<p style="margin-top:24px">Підпис: ___________________ ФОП ${activeFop?.fullName || ''}</p>
</body></html>`;
    openPrintWindow(html);
  };

  // ─── Рендер ────────────────────────────────────────────────────
  return (
    <div className="view-kdv">
      <div className="view-toolbar">
        <div>
          <h2 className="view-title">{config.title}</h2>
          <div className="cell-muted" style={{ fontSize: '.8rem' }}>{config.subtitle}</div>
        </div>
        <div className="toolbar-actions">
          <button className="btn btn--primary" onClick={handlePrint}>🖨 Сформувати книгу</button>
          <button className="btn btn--ghost" onClick={handleExportCsv}>⇩ CSV</button>
        </div>
      </div>

      {/* Реквізити ФОП */}
      <div className="kdv-fop-info">
        ФОП {activeFop?.fullName} · РНОКПП {activeFop?.rnokpp}
        {allEntries.length > 0 && entries.length > 0 && (
          <span style={{marginLeft:12, color:'var(--success)'}}>
            Всього записів: {allEntries.length} · У фільтрі: {entries.length}
          </span>
        )}
        {allEntries.length > 0 && entries.length === 0 && (
          <span style={{marginLeft:12, color:'var(--warning)'}}>
            Є {allEntries.length} записів, але не за {selYear} рік.
            Доступні роки: {diag.years.join(', ') || '—'} — змініть рік у фільтрі нижче.
          </span>
        )}
        {allEntries.length === 0 && (
          <span style={{marginLeft:12, color:'var(--error)'}}>
            Записів немає. Транзакцій у журналі: {diag.totalTx},
            з них «Надходження»: {diag.incomeTx}.
            {diag.incomeTx === 0 && ' Імпортуйте виписку або додайте надходження вручну.'}
          </span>
        )}
      </div>

      {/* Попередження про розбіжність з банком */}
      {hasMismatch && (
        <div className="kdv-mismatch-warn">
          ⚠ Розбіжність між КДВ та журналом банку:
          КДВ — <b>{fmtMoney(kdvIncome)} грн</b>, журнал — <b>{fmtMoney(bankIncome)} грн</b>.
          Різниця: {fmtMoney(Math.abs(kdvIncome - bankIncome))} грн.
          Це може бути законним (аванси, ПДВ, повернення) — перевірте.
        </div>
      )}

      {/* Фільтри */}
      <div className="filters-bar" style={{ marginBottom: 16 }}>
        <div className="field">
          <label style={{ fontSize: '.78rem' }}>Рік</label>
          <select value={selYear} onChange={e => setSelYear(+e.target.value)} style={{ width: 100 }}>
            {[...new Set([...diag.years.map(Number), year-1, year, year+1])].sort().map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
        <div className="field">
          <label style={{ fontSize: '.78rem' }}>Місяць</label>
          <select value={selMonth} onChange={e => setSelMonth(+e.target.value)} style={{ width: 160 }}>
            <option value={0}>Весь рік</option>
            {MONTHS_UK.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Таблиця КДВ */}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {config.columns.map(col => (
                <th key={col.key} style={{ textAlign: col.align || 'left' }}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.length === 0 ? (
              <tr><td colSpan={config.columns.length} className="table-empty">Записів за цей період немає</td></tr>
            ) : tableRows.map((row, idx) => {
              if (row.type === 'data') {
                const e = row.data;
                return (
                  <tr key={e.id} className={e.isReturn ? 'row-expense' : ''}>
                    {config.columns.map(col => (
                      <td key={col.key} style={{ textAlign: col.align || 'left' }}>
                        {col.key === 'num'    ? e.num
                        : col.key === 'date'  ? e.date
                        : col.key === 'docRef'? <span title={e.note}>{e.docRef}{e.note ? ' ⓘ' : ''}</span>
                        : (+e[col.key] || 0) !== 0 ? fmtMoney(e[col.key]) : '—'}
                      </td>
                    ))}
                  </tr>
                );
              }
              const bold = row.type === 'year' || row.type === 'quarter';
              return <TotalRow key={`${row.type}_${idx}`} label={row.label} rows={row.rows} columns={config.columns} bold={bold} />;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default KdvView;
