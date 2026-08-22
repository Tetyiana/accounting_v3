import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useSettings } from '../context/SettingsContext';
import { useFop } from '../context/FopContext';
import { ESV_AMOUNT } from '../utils/taxLogic';
import { buildDeclaration } from '../utils/dpsDeclaration';
import { buildDeclarationHtml } from '../utils/dpsDeclarationPrint';
import { checkIncomeLimit } from '../utils/incomeLimits';
import { fmtMoney } from '../utils/documentLogic';
import { openPrintWindow } from '../utils/printWindow';
import { buildEpG3Xml, buildEpG12Xml, buildUnifiedReportXml, downloadXml } from '../utils/xmlDps';

// Звітність ДПС: декларація платника єдиного податку.
// 1-2 групи — річна; 3 група — квартальна наростаючим підсумком.
// Дохід — касовий метод: усі надходження журналу за період.

const round2 = n => Math.round((+n || 0) * 100) / 100;
const QUARTERS = [
  { id: 1, label: 'І квартал',   months: [1, 3] },
  { id: 2, label: 'Півріччя',    months: [1, 6] },
  { id: 3, label: 'Три квартали', months: [1, 9] },
  { id: 4, label: 'Рік',          months: [1, 12] },
];

const DpsView = () => {
  const {
    transactions, employees, payrollRecords,
    declarations, saveDeclaration, getPrevDeclaration,
  } = useData();
  const { settings } = useSettings();
  const { activeFop } = useFop();
  const year = new Date().getFullYear();
  const [selYear, setSelYear] = useState(year);
  const [selQ, setSelQ] = useState(Math.ceil((new Date().getMonth() + 1) / 3));

  const group = settings.taxGroup;
  const isG3 = group === '3_5' || group === '3_3_vat';
  const epRate = group === '3_5' ? 0.05 : group === '3_3_vat' ? 0.03 : 0;
  const vzRate = 0.01;
  const MIN_WAGE = 8647, LIVING_WAGE = 3328;
  const epFixed = group === '1' ? round2(LIVING_WAGE * 0.10) : round2(MIN_WAGE * 0.20);
  const vzFixed = round2(MIN_WAGE * 0.10);

  // Дохід за місяцями обраного року (касовий метод).
  // До доходу платника ЄП суми ПДВ не включаються (пп. 1 п. 292.11 ПКУ),
  // тому для платника ПДВ віднімаємо ПДВ, зафіксований в операції.
  const incomeByMonth = useMemo(() => {
    const arr = Array(12).fill(0);
    transactions.filter(t => t.type === 'income' && (t.date || '').startsWith(String(selYear)))
      .forEach(t => {
        const m = +(t.date || '').slice(5, 7);
        if (m < 1 || m > 12) return;
        const vat = group === '3_3_vat' ? (+t.vatAmount || 0) : 0;
        arr[m - 1] += Math.max(0, (+t.amount || 0) - vat);
      });
    return arr.map(round2);
  }, [transactions, selYear, group]);

  // Річний дохід наростаючим — для контролю граничного обсягу (п. 291.4 ПКУ)
  const incomeYear = useMemo(
    () => round2(incomeByMonth.reduce((s, v) => s + v, 0)), [incomeByMonth]);
  const limitInfo = useMemo(
    () => checkIncomeLimit(incomeYear, group, selYear), [incomeYear, group, selYear]);

  // Період, за який складається декларація: гр. 3 — квартал, гр. 1 і 2 — рік
  const declPeriodId = isG3 ? selQ : 4;

  // Показники попередньої декларації того самого року → рядки 13 і 24.
  // Якщо запису немає (програму почали вести з середини року) — 0,
  // і користувач може вписати суму руками.
  const prevDecl = getPrevDeclaration(selYear, declPeriodId);
  const [manualPrev, setManualPrev] = useState({ row12: '', row23: '' });
  const prevRow12 = prevDecl ? +prevDecl.row12 || 0 : (+manualPrev.row12 || 0);
  const prevRow23 = prevDecl ? +prevDecl.row23 || 0 : (+manualPrev.row23 || 0);

  const period = QUARTERS.find(q => q.id === selQ) || QUARTERS[0];
  const incomeCumulative = round2(incomeByMonth.slice(0, period.months[1]).reduce((s, v) => s + v, 0));
  const incomePrevPeriod = selQ > 1 ? round2(incomeByMonth.slice(0, (selQ - 1) * 3).reduce((s, v) => s + v, 0)) : 0;
  const incomeThisQuarter = round2(incomeCumulative - incomePrevPeriod);

  // 3 група: зобов'язання наростаючим; до сплати — різниця з попереднім періодом
  const epCumulative  = round2(incomeCumulative * epRate);
  const vzCumulative  = round2(incomeCumulative * vzRate);
  const epPrev        = round2(incomePrevPeriod * epRate);
  const vzPrev        = round2(incomePrevPeriod * vzRate);
  const epToPay       = round2(epCumulative - epPrev);
  const vzToPay       = round2(vzCumulative - vzPrev);
  const monthsInPeriod = period.months[1];
  const esvPeriod     = round2(ESV_AMOUNT * (isG3 ? 3 : 12)); // за останній квартал / за рік

  const declTitle = isG3
    ? `Податкова декларація платника єдиного податку — ФОП (III група) за ${period.label.toLowerCase()} ${selYear} р.`
    : `Податкова декларація платника єдиного податку — ФОП (${group === '1' ? 'I' : 'II'} група) за ${selYear} рік`;

  // Друк офіційної форми декларації (наказ Мінфіну від 19.06.2015 № 578
  // у редакції наказу від 31.01.2025 № 57, ідентифікатор форми F0103309).
  // Розрахунок рядків 01-29 — у src/utils/dpsDeclaration.js, верстка — у
  // src/utils/dpsDeclarationPrint.js. Довільної нумерації тут більше немає.
  const handlePrint = () => {
    const employeesCount = (employees || []).filter(e => e.isActive !== false).length;

    // Перевищення граничного обсягу відносимо на місяць, у якому воно виникло
    const excessByMonth = (() => {
      const arr = Array(12).fill(0);
      const limit = limitInfo.limit;
      if (limit == null) return arr;
      let acc = 0;
      incomeByMonth.forEach((v, i) => {
        const before = acc;
        acc = round2(acc + v);
        // Перевищенням вважаємо ту частину доходу місяця, що вийшла за ліміт
        if (acc > limit) arr[i] = round2(acc - Math.max(limit, before));
      });
      return arr;
    })();

    // Місяці перебування на спрощеній системі: від реєстрації ФОП до поточного
    const regMonth = activeFop?.registrationDate
      ? (+activeFop.registrationDate.slice(0, 4) === selYear ? +activeFop.registrationDate.slice(5, 7) : 1)
      : 1;
    const lastMonth = selYear === new Date().getFullYear() ? new Date().getMonth() + 1 : 12;
    const monthsOnSimplified = Array.from({ length: 12 },
      (_, i) => i + 1 >= regMonth && i + 1 <= lastMonth);

    const decl = buildDeclaration({
      incomeByMonth, excessByMonth,
      taxGroup: group,
      periodId: declPeriodId,
      minWage: MIN_WAGE,
      monthsOnSimplified,
      esvBaseByMonth: Array(12).fill(MIN_WAGE),
      prevRow12,
      prevRow23,
    });

    // Фіксуємо показники: наступний період візьме звідси рядки 13 і 24
    saveDeclaration({
      year: selYear,
      periodId: declPeriodId,
      taxGroup: group,
      formId: decl.meta.declFormId,
      row12: decl.rows['12'],
      row14: decl.rows['14'],
      row21: decl.rows['21'],
      row22: decl.rows['22'],
      row23: decl.rows['23'],
      row25: decl.rows['25'],
      income: decl.rows['08'],
      rowsJson: decl.rows,
      source: 'auto',
    });

    const html = buildDeclarationHtml(decl, activeFop || {}, {
      year: selYear,
      employeesCount,
      kveds: [activeFop?.mainKved, activeFop?.additionalKveds].filter(Boolean).join(', '),
    });
    openPrintWindow(html, { fop: activeFop });
  };

  const handleUnifiedXml = () => {
    if (!employees?.length || !payrollRecords?.length) {
      alert('Немає нарахувань зарплати за обраний період');
      return;
    }
    const { xml, name } = buildUnifiedReportXml({
      fop: activeFop, year: selYear, quarter: selQ,
      employees, records: payrollRecords,
    });
    downloadXml(xml, name);
  };

  const handleXml = () => {
    if (isG3) {
      const { xml, name } = buildEpG3Xml({
        fop: activeFop, year: selYear, quarter: selQ,
        incomeCumulative, epCumulative, vzCumulative, epPrev, vzPrev,
        esvMonths: '111'.slice(0, monthsInPeriod > 3 ? 3 : monthsInPeriod),
      });
      downloadXml(xml, name);
    } else {
      const { xml, name } = buildEpG12Xml({
        fop: activeFop, year: selYear,
        incomeYear: incomeCumulative,
        epYear: round2(epFixed * 12), vzYear: round2(vzFixed * 12),
      });
      downloadXml(xml, name);
    }
  };

  if (!['1', '2', '3_5', '3_3_vat'].includes(group)) {
    return <div className="view-placeholder"><h3>Звітність ДПС</h3>
      <p>Для загальної системи декларація про майновий стан і доходи — в розробці.</p></div>;
  }

  return (
    <div className="view-dps">
      <div className="view-toolbar">
        <h2 className="view-title">Звітність ДПС</h2>
        <button className="btn btn--primary" onClick={handlePrint}>🖨 Сформувати декларацію</button>
        <button className="btn btn--ghost" onClick={handleXml} style={{ marginLeft: 8 }}>⬇ XML для кабінету</button>
        {employees?.length > 0 && (
          <button className="btn btn--ghost" onClick={handleUnifiedXml} style={{ marginLeft: 8 }}>⬇ Об&apos;єднана звітність (4ДФ + Д1)</button>
        )}
      </div>

      <div className="filters-bar">
        <div className="field"><label style={{ fontSize: '.78rem' }}>Рік</label>
          <select value={selYear} onChange={e => setSelYear(+e.target.value)} style={{ width: 100 }}>
            {[year - 1, year, year + 1].map(y => <option key={y}>{y}</option>)}
          </select></div>
        {isG3 && (
          <div className="field"><label style={{ fontSize: '.78rem' }}>Період (наростаючим)</label>
            <select value={selQ} onChange={e => setSelQ(+e.target.value)} style={{ width: 160 }}>
              {QUARTERS.map(q => <option key={q.id} value={q.id}>{q.label}</option>)}
            </select></div>
        )}
      </div>

      {limitInfo.limit != null && limitInfo.level !== 'ok' && (
        <div className={`settings-msg${limitInfo.level === 'exceeded' ? ' settings-msg--error' : ''}`}
             style={{ marginBottom: 12 }}>
          {limitInfo.level === 'exceeded' ? '⛔' : '⚠'} {limitInfo.message}
          {limitInfo.excess > 0 && (
            <> ЄП з перевищення (15%): <b>{fmtMoney(limitInfo.excessTax)}</b> грн.</>
          )}
        </div>
      )}

      {declPeriodId > 1 && (
        <div className="settings-section">
          <h3>Показники попереднього періоду</h3>
          <p className="cell-muted" style={{ fontSize: '.82rem', marginTop: 0 }}>
            Декларація заповнюється наростаючим підсумком з початку року.
            Рядок 13 дорівнює рядку 12 попередньої декларації, рядок 24 — рядку 23.
          </p>

          {prevDecl ? (
            <div className="settings-msg">
              Взято з декларації за {QUARTERS.find(q => q.id === declPeriodId - 1)?.label || 'попередній період'} {selYear} р.
              {prevDecl.source === 'manual' && ' (введено вручну)'}
              <div style={{ marginTop: 4 }}>
                Рядок 12 — <b>{fmtMoney(prevDecl.row12)}</b> грн
                {isG3 && <> · рядок 23 — <b>{fmtMoney(prevDecl.row23)}</b> грн</>}
              </div>
            </div>
          ) : (
            <>
              <div className="settings-msg" style={{ marginBottom: 8 }}>
                ⚠ Декларації за попередній період у програмі немає. Якщо вона подавалася —
                впишіть суми з неї, інакше рядок 14 буде завищений на все, що вже сплачено.
              </div>
              <div className="form-row-3">
                <div className="field">
                  <label>Рядок 12 попередньої декларації (ЄП нараховано всього)</label>
                  <input type="number" step="0.01" min="0" value={manualPrev.row12}
                    onChange={e => setManualPrev(p => ({ ...p, row12: e.target.value }))}
                    placeholder="0.00" />
                </div>
                {isG3 && (
                  <div className="field">
                    <label>Рядок 23 попередньої декларації (ВЗ нараховано)</label>
                    <input type="number" step="0.01" min="0" value={manualPrev.row23}
                      onChange={e => setManualPrev(p => ({ ...p, row23: e.target.value }))}
                      placeholder="0.00" />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {declarations.filter(d => +d.year === +selYear).length > 0 && (
        <div className="settings-section">
          <h3>Зафіксовані декларації за {selYear} рік</h3>
          <table className="data-table">
            <thead><tr>
              <th>Період</th><th className="r">Дохід (р. 08)</th>
              <th className="r">ЄП нараховано (р. 12)</th>
              <th className="r">ЄП до сплати (р. 14)</th>
              <th className="r">ВЗ (р. 23)</th>
            </tr></thead>
            <tbody>
              {declarations
                .filter(d => +d.year === +selYear)
                .sort((a, b) => a.periodId - b.periodId)
                .map(d => (
                  <tr key={d.id}>
                    <td>{QUARTERS.find(q => q.id === d.periodId)?.label || d.periodId}
                        {d.source === 'manual' && <span className="cell-muted"> (вручну)</span>}</td>
                    <td className="r">{fmtMoney(d.income)}</td>
                    <td className="r">{fmtMoney(d.row12)}</td>
                    <td className="r">{fmtMoney(d.row14)}</td>
                    <td className="r">{fmtMoney(d.row23)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="cell-muted" style={{ fontSize: '.78rem' }}>
            Запис створюється або оновлюється щоразу, коли ви друкуєте декларацію
            за відповідний період.
          </p>
        </div>
      )}

      <div className="settings-section">
        <h3>{declTitle}</h3>
        {limitInfo.limit != null && (
          <p className="cell-muted" style={{ fontSize: '.82rem', marginTop: 4 }}>
            Граничний обсяг доходу на {selYear} р.: <b>{fmtMoney(limitInfo.limit)}</b> грн
            ({limitInfo.multiplier} × МЗП {fmtMoney(limitInfo.minWage)}).
            Дохід за рік: <b>{fmtMoney(limitInfo.used)}</b> грн ({limitInfo.percent}%).
            Залишок: <b>{fmtMoney(limitInfo.left)}</b> грн.
          </p>
        )}
        <div className="stats-grid" style={{ marginTop: 10 }}>
          <div className="stat-card"><div className="stat-label">Дохід {isG3 ? 'наростаючим' : 'за рік'}</div>
            <div className="stat-value">{fmtMoney(incomeCumulative)}</div></div>
          {isG3 ? (<>
            <div className="stat-card"><div className="stat-label">ЄП {(epRate * 100).toFixed(0)}% до сплати (кв.)</div>
              <div className="stat-value" style={{ color: 'var(--warning)' }}>{fmtMoney(epToPay)}</div></div>
            <div className="stat-card"><div className="stat-label">ВЗ 1% до сплати (кв.)</div>
              <div className="stat-value" style={{ color: 'var(--warning)' }}>{fmtMoney(vzToPay)}</div></div>
            <div className="stat-card"><div className="stat-label">ЄСВ за квартал</div>
              <div className="stat-value">{fmtMoney(round2(ESV_AMOUNT * 3))}</div></div>
          </>) : (<>
            <div className="stat-card"><div className="stat-label">ЄП/міс (аванс)</div>
              <div className="stat-value">{fmtMoney(epFixed)}</div></div>
            <div className="stat-card"><div className="stat-label">ВЗ/міс (фіксований)</div>
              <div className="stat-value">{fmtMoney(vzFixed)}</div></div>
            <div className="stat-card"><div className="stat-label">ЄСВ/міс</div>
              <div className="stat-value">{fmtMoney(ESV_AMOUNT)}</div></div>
          </>)}
        </div>
        <p className="cell-muted" style={{ fontSize: '.82rem', marginTop: 10 }}>
          Дохід рахується касовим методом з журналу операцій (усі «Надходження»).
          Кнопка «Сформувати декларацію» дає друковану форму для перенесення
          в Електронний кабінет платника. Строки подання: 3 група — 40 к.д. після
          кварталу; 1-2 групи — до 1 березня наступного року.
        </p>
      </div>
    </div>
  );
};

export default DpsView;
