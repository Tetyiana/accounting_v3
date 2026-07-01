import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useSettings } from '../context/SettingsContext';
import { TAX_GROUPS } from '../constants/taxOptions';
import { TAX_STRATEGIES, ESV_AMOUNT } from '../utils/taxLogic';
import { buildLedgerEntries, LEDGER_ACCOUNTS } from '../utils/accountingLogic';
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

    // Стан розрахунків з бюджетом: порівнюємо нараховане з фактично сплаченим
    // (за операціями в журналі, де контрагент — ДПС/Казначейство/ПФУ).
    const BUDGET_RE = /дпс|казначей|пфу|пенсійн/i;
    const paidToBudget = inRange
      .filter(t => t.type === 'expense' && BUDGET_RE.test(t.counterparty || ''))
      .reduce((s,t) => s + (+t.amount||0), 0);

    return {
      income, expense, net: income - expense,
      tax: calc.tax, breakdown: calc.breakdown, note: calc.note,
      group: group?.label, count: inRange.length, rows: inRange,
      paidToBudget, budgetBalance: calc.tax - paidToBudget,
      ledgerEntries: buildLedgerEntries(inRange),
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

          <div className="report-card" style={{
            border: '1px solid var(--border-light)', borderRadius: 12, padding: '16px 18px', marginBottom: 18,
          }}>
            <div style={{fontWeight:600, marginBottom: 10}}>Стан розрахунків з бюджетом</div>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Нараховано за період</div>
                <div className="stat-value">{fmt(report.tax)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Сплачено (за журналом)</div>
                <div className="stat-value" style={{color:'var(--success)'}}>{fmt(report.paidToBudget)}</div>
              </div>
              <div className="stat-card stat-card--accent">
                <div className="stat-label">{report.budgetBalance > 0 ? 'Заборгованість' : 'Переплата'}</div>
                <div className="stat-value" style={{color: report.budgetBalance > 0 ? 'var(--error)' : 'var(--success)'}}>
                  {fmt(Math.abs(report.budgetBalance))}
                </div>
              </div>
            </div>
            <div className="cell-muted" style={{fontSize:'.78rem', marginTop: 8}}>
              "Сплачено" визначається за операціями типу "Списання" в журналі, де контрагент містить
              ДПС, Казначейство або ПФУ. Якщо платежі заносяться під іншою назвою — сума тут буде неточною;
              перевіряйте контрагента при внесенні податкових платежів у журнал.
            </div>
          </div>

          {report.breakdown && (
            <div className="report-meta" style={{marginTop: -10, marginBottom: 18}}>
              {report.breakdown.singleTax != null && <>Єдиний податок: {fmt(report.breakdown.singleTax)} · </>}
              {report.breakdown.pdfo != null && <>ПДФО 18%: {fmt(report.breakdown.pdfo)} · </>}
              {report.breakdown.vz != null && <>Військовий збір: {fmt(report.breakdown.vz)} · </>}
              ЄСВ: {fmt(report.breakdown.esv)}
            </div>
          )}

          <div className="report-hint">
            Дані розраховані на основі записів Журналу операцій. Для офіційної звітності — експортуйте
            звіт нижче і завантажте у кабінет платника податків.
          </div>

          <div className="report-card" style={{
            border: '1px solid var(--border-light)', borderRadius: 12, padding: '16px 18px', marginBottom: 18,
          }}>
            <div style={{fontWeight:600, marginBottom: 10}}>Бухгалтерські проводки (спрощений облік)</div>
            <div className="cell-muted" style={{fontSize:'.78rem', marginBottom: 10}}>
              Касовий метод: Дт/Кт формуються по факту руху коштів (без рахунків 361/631) —
              це відповідає обліку ФОП на спрощеній системі. Рахунки: 301 Касса · 311 Банк · 641 Розрахунки за податками ·
              651 Розрахунки за ЄСВ · 661 Розрахунки з оплати праці · 701 Доход · 84 Інші операційні витрати.
            </div>
            {report.ledgerEntries.length === 0 ? (
              <p className="cell-muted">Проводок за цей період немає</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Дата</th>
                      <th>Зміст операції</th>
                      <th>Дт</th>
                      <th>Кт</th>
                      <th style={{textAlign:'right'}}>Сума, грн</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.ledgerEntries.map(e => (
                      <tr key={e.id}>
                        <td>{e.date}</td>
                        <td className="cell-muted">{e.description || e.counterparty}</td>
                        <td>{e.debit.code} <span className="cell-muted">({e.debit.label})</span></td>
                        <td>{e.credit.code} <span className="cell-muted">({e.credit.label})</span></td>
                        <td style={{textAlign:'right', fontWeight:600}}>{fmt(e.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{marginTop: 10}}>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => exportCSV(
                  report.ledgerEntries.map(e => ({
                    date: e.date, description: e.description || e.counterparty,
                    debit: `${e.debit.code} ${e.debit.label}`, credit: `${e.credit.code} ${e.credit.label}`,
                    amount: e.amount,
                  })),
                  [
                    { key: 'date', label: 'Дата' },
                    { key: 'description', label: 'Зміст операції' },
                    { key: 'debit', label: 'Дт' },
                    { key: 'credit', label: 'Кт' },
                    { key: 'amount', label: 'Сума' },
                  ],
                  `provodky_${dateStart}_${dateEnd}.csv`
                )}
              >
                ⇩ Експорт проводок CSV
              </button>
            </div>
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
