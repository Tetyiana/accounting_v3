import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useSettings } from '../context/SettingsContext';
import { useFop } from '../context/FopContext';
import { ESV_AMOUNT } from '../utils/taxLogic';
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
  const { transactions, employees, payrollRecords } = useData();
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

  // Дохід за місяцями обраного року (касовий метод)
  const incomeByMonth = useMemo(() => {
    const arr = Array(12).fill(0);
    transactions.filter(t => t.type === 'income' && (t.date || '').startsWith(String(selYear)))
      .forEach(t => { const m = +(t.date || '').slice(5, 7); if (m >= 1 && m <= 12) arr[m - 1] += (+t.amount || 0); });
    return arr.map(round2);
  }, [transactions, selYear]);

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

  const handlePrint = () => {
    // Офіційна форма декларації (наказ Мінфіну від 19.06.2015 №578
    // у редакції наказу від 09.12.2020 №752 з подальшими змінами).
    // Структура: розділи І–VI; заповнюємо II, IV — інші лишаємо порожніми як формою.
    const groupLabel = group === '1' ? 'І' : group === '2' ? 'ІІ' : group === '3_3_vat' ? 'ІІІ (платник ПДВ, 3%)' : 'ІІІ (5%)';
    const employeesCount = (employees || []).filter(e => e.isActive !== false).length;

    const secIV_g3 = `
<tr><td>07</td><td>Сума доходу за податковий (звітний) період, оподаткована за ставкою ${(epRate*100).toFixed(0)}%</td><td align="right">${fmtMoney(incomeCumulative)}</td></tr>
<tr><td>08</td><td>Сума доходу, оподаткована за подвійною ставкою (у разі перевищення)</td><td align="right">0,00</td></tr>
<tr><td>09</td><td>Сума єдиного податку за податковий (звітний) період (р.07 × ставка + р.08 × ставка×2)</td><td align="right"><b>${fmtMoney(epCumulative)}</b></td></tr>
<tr><td>10</td><td>Сума єдиного податку за попередній звітний період (наростаючим)</td><td align="right">${fmtMoney(epPrev)}</td></tr>
<tr><td>11</td><td><b>Сума єдиного податку, яка підлягає сплаті за останній квартал</b> (р.09 − р.10)</td><td align="right"><b>${fmtMoney(epToPay)}</b></td></tr>
<tr><td>12</td><td>Сума військового збору (р.07 × 1%) наростаючим</td><td align="right">${fmtMoney(vzCumulative)}</td></tr>
<tr><td>13</td><td>Сума ВЗ, нарахована за попередній звітний період</td><td align="right">${fmtMoney(vzPrev)}</td></tr>
<tr><td>14</td><td><b>Сума ВЗ, яка підлягає сплаті за останній квартал</b> (р.12 − р.13)</td><td align="right"><b>${fmtMoney(vzToPay)}</b></td></tr>`;

    const secIV_g12 = `
<tr><td>01</td><td>Обсяг доходу за звітний рік</td><td align="right"><b>${fmtMoney(incomeCumulative)}</b></td></tr>
<tr><td>02</td><td>Сума доходу, оподаткована за подвійною ставкою (у разі перевищення)</td><td align="right">0,00</td></tr>
<tr><td>03</td><td>Щомісячний авансовий внесок ЄП</td><td align="right">${fmtMoney(epFixed)}</td></tr>
<tr><td>04</td><td><b>Сума ЄП за рік (12 місяців)</b></td><td align="right"><b>${fmtMoney(round2(epFixed * 12))}</b></td></tr>
<tr><td>05</td><td>Щомісячний авансовий внесок ВЗ (1% × МЗП)</td><td align="right">${fmtMoney(vzFixed)}</td></tr>
<tr><td>06</td><td><b>Сума ВЗ за рік (12 місяців)</b></td><td align="right"><b>${fmtMoney(round2(vzFixed * 12))}</b></td></tr>`;

    const html = `<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8"><title>Декларація ЄП</title>
<style>body{font-family:Arial,sans-serif;font-size:11.5px;margin:20mm;color:#111;line-height:1.4}
h2{font-size:14px;text-align:center;margin:0 0 4px}
h3{font-size:11.5px;margin:14px 0 6px;background:#e8e8e8;padding:4px 6px;border:1px solid #333}
table{width:100%;border-collapse:collapse;margin:4px 0}
td,th{border:1px solid #333;padding:4px 6px;vertical-align:top}
th{background:#f0f0f0;font-weight:600;text-align:center}
.nb td{border:none;padding:2px 4px}
.center{text-align:center}
.bx{display:inline-block;width:14px;height:14px;border:1px solid #333;text-align:center;line-height:14px;margin-right:4px;font-weight:600}
@media print{body{margin:12mm}}</style></head><body>

<div class="nb" style="display:flex;justify-content:space-between;margin-bottom:4px">
  <div>Форма затверджена наказом Мінфіну від 19.06.2015 №578<br>(у редакції наказу від 09.12.2020 №752)</div>
  <div style="text-align:right">Код за ЄДРПОУ ДПС ${activeFop?.dpsCode || '____'}</div>
</div>

<h2>ПОДАТКОВА ДЕКЛАРАЦІЯ<br>платника єдиного податку — фізичної особи-підприємця</h2>

<table class="nb" style="margin-top:4px">
<tr><td width="55%">1. Тип декларації:</td>
    <td><span class="bx">×</span> звітна &nbsp; <span class="bx"></span> звітна нова &nbsp; <span class="bx"></span> уточнююча</td></tr>
<tr><td>2. Звітний (податковий) період:</td>
    <td>${isG3 ? `${period.label} ${selYear} р.` : `${selYear} р.`}${isG3 ? ' (наростаючим підсумком)' : ''}</td></tr>
<tr><td>3. Уточнюваний період:</td><td>—</td></tr>
</table>

<h3>Розділ І. Загальні відомості</h3>
<table>
<tr><td width="35%">Платник податку</td><td><b>ФОП ${activeFop?.fullName || ''}</b></td></tr>
<tr><td>Реєстраційний номер облікової картки платника податків (РНОКПП)</td><td>${activeFop?.rnokpp || ''}</td></tr>
<tr><td>Податкова адреса</td><td>${activeFop?.legalAddress || ''}</td></tr>
<tr><td>Контролюючий орган (ДПІ)</td><td>${activeFop?.dpsName || activeFop?.legalAddress || ''}</td></tr>
<tr><td>Основний КВЕД</td><td>${(activeFop?.mainKved || '').replace(/,/g, '.')}</td></tr>
<tr><td>Група єдиного податку</td><td><b>${groupLabel}</b></td></tr>
</table>

<h3>Розділ ІІ. Показники господарської діяльності</h3>
<table>
<tr><td>Обсяг доходу за звітний період${isG3 ? ' (наростаючим)' : ''}</td><td align="right"><b>${fmtMoney(incomeCumulative)} грн</b></td></tr>
${isG3 ? `<tr><td>у т.ч. за останній квартал</td><td align="right">${fmtMoney(incomeCumulative - incomePrevPeriod)} грн</td></tr>` : ''}
</table>

<h3>Розділ ІІІ. Відомості про наявність (відсутність) найманих працівників</h3>
<p style="margin:6px 0">Середньооблікова кількість найманих працівників за звітний період: <b>${employeesCount}</b></p>

<h3>Розділ IV. Розрахунок податкових зобов'язань</h3>
<table>
<thead><tr><th width="45">Код рядка</th><th>Назва показника</th><th width="130">Сума, грн</th></tr></thead>
<tbody>${isG3 ? secIV_g3 : secIV_g12}</tbody>
</table>

<h3>Розділ V. Визначення сум ЄП, що збільшують / зменшують зобов'язання за самостійно виявлені помилки</h3>
<p style="margin:6px 0;font-style:italic;color:#666">Не заповнюється (виправлення помилок відсутні).</p>

<h3>Розділ VI. Штрафи і пеня</h3>
<p style="margin:6px 0;font-style:italic;color:#666">Не заповнюється.</p>

<h3>Єдиний внесок на загальнообов'язкове державне соцстрахування (ЄСВ) за себе</h3>
<table>
<tr><td>Мінімальний ЄСВ на місяць (22% × МЗП ${fmtMoney(MIN_WAGE)})</td><td align="right">${fmtMoney(ESV_AMOUNT)} грн</td></tr>
<tr><td><b>ЄСВ за ${isG3 ? 'останній квартал (3 міс.)' : 'рік (12 міс.)'}</b></td><td align="right"><b>${fmtMoney(esvPeriod)} грн</b></td></tr>
</table>
<p style="font-size:10px;color:#666;margin:6px 0">Довідково: помісячний дохід — ${incomeByMonth.map((v, i) => v ? `${i + 1}міс ${fmtMoney(v)}` : '').filter(Boolean).join('; ') || 'надходжень немає'}.</p>

<div style="margin-top:24px;display:flex;justify-content:space-between">
  <div>Дата подання: ${new Date().toLocaleDateString('uk-UA')}</div>
  <div style="text-align:right">ФОП ${activeFop?.fullName || ''}<br><div id="fax-slot"></div>_______________________<br><small>(підпис)</small></div>
</div>
</body></html>`;
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

      <div className="settings-section">
        <h3>{declTitle}</h3>
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
