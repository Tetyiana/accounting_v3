import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useSettings } from '../context/SettingsContext';
import { TAX_GROUPS } from '../constants/taxOptions';
import { TAX_STRATEGIES, ESV_AMOUNT } from '../utils/taxLogic';
import { exportJSON, exportCSV } from '../utils/exportUtils';

const ReportsView = () => {
  const { transactions }  = useData();
  const { settings }      = useSettings();
  const year              = new Date().getFullYear();

  const [dateStart, setDateStart] = useState(`${year}-01-01`);
  const [dateEnd,   setDateEnd]   = useState(`${year}-12-31`);
  const [generated, setGenerated] = useState(false);

  const report = useMemo(() => {
    if (!generated) return null;
    const inRange = transactions.filter(t => t.date >= dateStart && t.date <= dateEnd);
    const income  = inRange.filter(t => t.type === 'income').reduce((s,t) => s + (+t.amount||0), 0);
    const expense = inRange.filter(t => t.type === 'expense').reduce((s,t) => s + (+t.amount||0), 0);
    const group   = TAX_GROUPS.find(g => g.id === settings.taxGroup);

    // Реальна стратегія по групі (з ЄСВ) замість спрощеного відсотка від доходу.
    const strategy = TAX_STRATEGIES[settings.taxGroup];
    const calc     = strategy ? strategy(income, expense) : { tax: ESV_AMOUNT, breakdown: { esv: ESV_AMOUNT }, note: '' };

    return {
      income, expense, net: income - expense,
      tax: calc.tax, breakdown: calc.breakdown, note: calc.note,
      group: group?.label, count: inRange.length, rows: inRange,
    };
  }, [generated, transactions, dateStart, dateEnd, settings]);

  const fmt = n => n.toLocaleString('uk-UA', { minimumFractionDigits: 2 }) + ' грн';

  return (
    <div className="view-reports">
      <div className="view-toolbar">
        <h2 className="view-title">Звіти</h2>
      </div>

      <div className="report-filters">
        <div className="field">
          <label>Дата з</label>
          <input type="date" value={dateStart} onChange={e => { setDateStart(e.target.value); setGenerated(false); }} />
        </div>
        <div className="field">
          <label>Дата по</label>
          <input type="date" value={dateEnd} onChange={e => { setDateEnd(e.target.value); setGenerated(false); }} />
        </div>
        <div style={{alignSelf:'flex-end'}}>
          <button className="btn btn--primary" onClick={() => setGenerated(true)}>Сформувати</button>
        </div>
      </div>

      {report && (
        <div className="report-results">
          <div className="report-meta">
            {report.group} · {transactions.length} операцій усього · {report.count} за період
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Загальний дохід (надходження)</div>
              <div className="stat-value" style={{color:'var(--success)'}}>{fmt(report.income)}</div>
            </div>
            {/* На єдиному податку витрати і фін. результат не визначаємо —
                банківський рух містить особисті, зняття готівки тощо */}
            {['general','general_vat'].includes(settings.taxGroup) && (
              <>
                <div className="stat-card">
                  <div className="stat-label">Загальні витрати</div>
                  <div className="stat-value" style={{color:'var(--error)'}}>{fmt(report.expense)}</div>
                </div>
                <div className="stat-card stat-card--accent">
                  <div className="stat-label">Чистий прибуток</div>
                  <div className="stat-value">{fmt(report.net)}</div>
                </div>
              </>
            )}
            <div className="stat-card">
              <div className="stat-label">Податки і збори разом</div>
              <div className="stat-value" style={{color:'var(--warning)'}}>{fmt(report.tax)}</div>
            </div>
          </div>

          {!['general','general_vat'].includes(settings.taxGroup) && (
            <div className="report-hint" style={{marginBottom:8}}>
              На єдиному податку фінансовий результат не розраховується —
              банківський рух містить особисті витрати, зняття готівки та інші позаподаткові операції.
              Аналітика витрат ведеться в управлінському обліку.
            </div>
          )}

          {report.breakdown && (
            <div className="report-meta" style={{marginTop: -10, marginBottom: 18}}>
              {report.breakdown.singleTax != null && <>Єдиний податок: {fmt(report.breakdown.singleTax)} · </>}
              {report.breakdown.pdfo != null && <>ПДФО 18%: {fmt(report.breakdown.pdfo)} · </>}
              {report.breakdown.vz != null && <>ВЗ 1.5%: {fmt(report.breakdown.vz)} · </>}
              ЄСВ: {fmt(report.breakdown.esv)}
            </div>
          )}

          <div className="report-hint">
            Дані розраховані на основі записів Журналу операцій. Для офіційної звітності — експортуйте
            звіт нижче і завантажте у кабінет платника податків.
          </div>

          <div style={{display:'flex', gap: 10, marginTop: 12, flexWrap: 'wrap'}}>
            <button
              className="btn btn--primary"
              onClick={() => exportJSON(
                { period: { from: dateStart, to: dateEnd }, ...report },
                `zvit_${dateStart}_${dateEnd}.json`
              )}
            >
              ⇩ Експорт JSON
            </button>
            <button
              className="btn btn--ghost"
              onClick={() => exportCSV(
                report.rows,
                [
                  { key: 'date', label: 'Дата' },
                  { key: 'type', label: 'Тип' },
                  { key: 'counterparty', label: 'Контрагент' },
                  { key: 'amount', label: 'Сума' },
                  { key: 'description', label: 'Примітка' },
                ],
                `zvit_${dateStart}_${dateEnd}.csv`
              )}
            >
              ⇩ Експорт CSV
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsView;
