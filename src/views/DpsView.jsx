import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useSettings } from '../context/SettingsContext';
import { useFop } from '../context/FopContext';
import { ESV_AMOUNT } from '../utils/taxLogic';
import { fmtMoney } from '../utils/documentLogic';
import { openPrintWindow } from '../utils/printWindow';

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
  const { transactions } = useData();
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
    const rows3 = `
<tr><td>Обсяг доходу за звітний період (наростаючим підсумком)</td><td align="right"><b>${fmtMoney(incomeCumulative)}</b></td></tr>
<tr><td>Ставка єдиного податку</td><td align="right">${(epRate * 100).toFixed(0)}%</td></tr>
<tr><td>Сума єдиного податку (наростаючим підсумком)</td><td align="right">${fmtMoney(epCumulative)}</td></tr>
<tr><td>Нараховано за попередні періоди</td><td align="right">${fmtMoney(epPrev)}</td></tr>
<tr><td><b>Єдиний податок до сплати за останній квартал</b></td><td align="right"><b>${fmtMoney(epToPay)}</b></td></tr>
<tr><td>Військовий збір ${(vzRate * 100).toFixed(0)}% (наростаючим)</td><td align="right">${fmtMoney(vzCumulative)}</td></tr>
<tr><td><b>Військовий збір до сплати за останній квартал</b></td><td align="right"><b>${fmtMoney(vzToPay)}</b></td></tr>`;

    const rows12 = `
<tr><td>Обсяг доходу за рік</td><td align="right"><b>${fmtMoney(incomeCumulative)}</b></td></tr>
<tr><td>Щомісячний авансовий внесок ЄП</td><td align="right">${fmtMoney(epFixed)}</td></tr>
<tr><td>Єдиний податок за рік (12 міс.)</td><td align="right"><b>${fmtMoney(round2(epFixed * 12))}</b></td></tr>
<tr><td>Військовий збір (фіксований, 12 міс.)</td><td align="right"><b>${fmtMoney(round2(vzFixed * 12))}</b></td></tr>`;

    const html = `<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8"><title>Декларація ЄП</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;margin:30px;color:#111;line-height:1.45}
h2{font-size:14px;text-align:center}h3{font-size:12px;margin:14px 0 4px}
table{width:100%;border-collapse:collapse;margin:8px 0}td,th{border:1px solid #333;padding:5px 8px}
.nb td{border:none;padding:2px 4px}.center{text-align:center}
@media print{body{margin:12mm}}</style></head><body>
<h2>ПОДАТКОВА ДЕКЛАРАЦІЯ<br>платника єдиного податку — фізичної особи-підприємця</h2>
<p class="center">${isG3 ? `Звітний період: ${period.label} ${selYear} р. (наростаючим підсумком)` : `Звітний період: ${selYear} рік`}</p>
<table class="nb">
<tr><td width="40%">Платник:</td><td><b>ФОП ${activeFop?.fullName || ''}</b></td></tr>
<tr><td>РНОКПП:</td><td>${activeFop?.rnokpp || ''}</td></tr>
<tr><td>Податкова адреса:</td><td>${activeFop?.legalAddress || ''}</td></tr>
<tr><td>Група єдиного податку:</td><td>${group === '1' ? 'перша' : group === '2' ? 'друга' : 'третя'}${group === '3_3_vat' ? ' (платник ПДВ)' : ''}</td></tr>
<tr><td>Основний КВЕД:</td><td>${(activeFop?.mainKved || '').replace(/,/g, '.')}</td></tr>
</table>
<h3>Розрахунок податкових зобов'язань</h3>
<table>${isG3 ? rows3 : rows12}</table>
<h3>Єдиний внесок (ЄСВ) за себе</h3>
<table>
<tr><td>Мінімальний ЄСВ на місяць (22% МЗП ${fmtMoney(MIN_WAGE)})</td><td align="right">${fmtMoney(ESV_AMOUNT)}</td></tr>
<tr><td><b>ЄСВ за ${isG3 ? 'останній квартал (3 міс.)' : 'рік (12 міс.)'}</b></td><td align="right"><b>${fmtMoney(esvPeriod)}</b></td></tr>
</table>
<p style="margin-top:8px;font-size:10.5px">Довідково: помісячний дохід — ${incomeByMonth.map((v, i) => v ? `${i + 1}міс: ${fmtMoney(v)}` : '').filter(Boolean).join('; ') || 'надходжень немає'}.</p>
<p style="margin-top:10px;font-size:10.5px">Форма сформована програмою «Облік ФОП» для контролю і заповнення декларації в Електронному кабінеті платника. Суми авансових внесків 1-2 груп та пільги (звільнення від ЄСВ, воєнні пільги) перевіряйте індивідуально.</p>
<div style="margin-top:36px;display:flex;justify-content:space-between">
<div>Дата: ${new Date().toISOString().slice(0, 10)}</div>
<div>Підпис: ___________________ ФОП ${activeFop?.fullName || ''}</div>
</div>
</body></html>`;
    openPrintWindow(html);
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
