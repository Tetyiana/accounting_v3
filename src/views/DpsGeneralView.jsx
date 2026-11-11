import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useSettings } from '../context/SettingsContext';
import { useFop } from '../context/FopContext';
import { calcGeneralYear } from '../utils/generalSystem';
import { taxYear, taxYearWarning, isVatGroup } from '../constants/taxYears';
import { fmtMoney } from '../utils/documentLogic';
import { openPrintWindow } from '../utils/printWindow';

// Звітність ДПС для груп, у яких немає декларації платника ЄП за формою F0103309/F0103407:
//   • загальна система — розрахунок до декларації про майновий стан і доходи;
//   • 4 група ЄП — графік сплати ЄП, фіксований ВЗ, ЄСВ.
// Це розрахунок показників. Електронні форми для цих випадків програма не формує.

const round2 = n => Math.round((+n || 0) * 100) / 100;
const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
const Q_NAME = ['І', 'ІІ', 'ІІІ', 'IV'];

const YearSelect = ({ value, onChange }) => {
  const y = new Date().getFullYear();
  return (
    <div className="filters-bar">
      <div className="field"><label style={{ fontSize: '.78rem' }}>Рік</label>
        <select value={value} onChange={e => onChange(+e.target.value)} style={{ width: 100 }}>
          {[y - 1, y, y + 1].map(v => <option key={v}>{v}</option>)}
        </select></div>
    </div>
  );
};

// ─── Загальна система ─────────────────────────────────────────────
export const DpsGeneral = () => {
  const { transactions } = useData();
  const { settings } = useSettings();
  const { activeFop } = useFop();
  const [selYear, setSelYear] = useState(new Date().getFullYear());

  const isVat = isVatGroup(settings.taxGroup, settings.isVatPayer);
  const calc = useMemo(() => calcGeneralYear({
    transactions, year: selYear, isVat, esvExempt: !!activeFop?.esvExempt,
  }), [transactions, selYear, isVat, activeFop?.esvExempt]);
  const warning = taxYearWarning(selYear);

  const handlePrint = () => {
    const td = (v) => `<td style="text-align:right">${fmtMoney(v)}</td>`;
    const html = `
<h2 style="text-align:center;margin-bottom:4px">Розрахунок до податкової декларації про майновий стан і доходи</h2>
<p style="text-align:center;margin-top:0">за ${selYear} рік · ${activeFop?.fullName || ''} · РНОКПП ${activeFop?.rnokpp || ''}</p>
<table border="1" cellspacing="0" cellpadding="4" style="width:100%;border-collapse:collapse;font-size:12px">
<thead><tr><th>Місяць</th><th>Дохід${isVat ? ' (без ПДВ)' : ''}</th><th>Витрати</th><th>Чистий дохід</th><th>ЄСВ</th></tr></thead>
<tbody>
${calc.months.map(r => `<tr><td>${MONTHS[r.month - 1]}</td>${td(r.income)}${td(r.expense)}${td(r.net)}${td(r.esv)}</tr>`).join('')}
<tr style="font-weight:bold"><td>Разом</td>${td(calc.totalIncome)}${td(calc.totalExpense)}${td(calc.netIncome)}${td(calc.esv)}</tr>
</tbody></table>
<p>Чистий оподатковуваний дохід: <b>${fmtMoney(calc.taxable)}</b> грн</p>
<p>ПДФО 18%: <b>${fmtMoney(calc.pdfo)}</b> грн; авансові внески за І–ІІІ кв.: ${fmtMoney(calc.advancesPdfo)} грн; до сплати за декларацією: <b>${fmtMoney(calc.pdfoToPay)}</b> грн</p>
<p>Військовий збір 5%: <b>${fmtMoney(calc.vz)}</b> грн; авансові внески за І–ІІІ кв.: ${fmtMoney(calc.advancesVz)} грн; до сплати за декларацією: <b>${fmtMoney(calc.vzToPay)}</b> грн</p>
<p>ЄСВ за рік: <b>${fmtMoney(calc.esv)}</b> грн</p>
<p style="font-size:11px">Розрахунок складено за даними журналу операцій. Це не форма декларації — показники переносяться в декларацію (ідентифікатор форми F0100215, додаток Ф2) в Електронному кабінеті.</p>`;
    openPrintWindow(html, { fop: activeFop });
  };

  return (
    <div className="view-dps">
      <div className="view-toolbar">
        <h2 className="view-title">Звітність ДПС</h2>
        <button className="btn btn--primary" onClick={handlePrint}>🖨 Друк розрахунку</button>
      </div>
      <YearSelect value={selYear} onChange={setSelYear} />

      {warning && <div className="settings-msg" style={{ marginBottom: 12 }}>⚠ {warning}</div>}

      <div className="settings-section">
        <h3>Загальна система: розрахунок до декларації про майновий стан і доходи за {selYear} рік</h3>
        <div className="stats-grid" style={{ marginTop: 10 }}>
          <div className="stat-card"><div className="stat-label">Дохід{isVat ? ' (без ПДВ)' : ''}</div>
            <div className="stat-value">{fmtMoney(calc.totalIncome)}</div></div>
          <div className="stat-card"><div className="stat-label">Витрати</div>
            <div className="stat-value">{fmtMoney(calc.totalExpense)}</div></div>
          <div className="stat-card"><div className="stat-label">Чистий оподатковуваний дохід</div>
            <div className="stat-value">{fmtMoney(calc.taxable)}</div></div>
          <div className="stat-card"><div className="stat-label">ПДФО 18%</div>
            <div className="stat-value" style={{ color: 'var(--warning)' }}>{fmtMoney(calc.pdfo)}</div></div>
          <div className="stat-card"><div className="stat-label">ВЗ 5%</div>
            <div className="stat-value" style={{ color: 'var(--warning)' }}>{fmtMoney(calc.vz)}</div></div>
          <div className="stat-card"><div className="stat-label">ЄСВ за рік</div>
            <div className="stat-value">{fmtMoney(calc.esv)}</div></div>
        </div>
      </div>

      <div className="settings-section">
        <h3>Авансові внески і ЄСВ по кварталах</h3>
        <table className="data-table">
          <thead><tr>
            <th>Квартал</th><th className="r">Дохід</th><th className="r">Витрати</th>
            <th className="r">Чистий дохід</th><th className="r">Аванс ПДФО</th>
            <th className="r">Аванс ВЗ</th><th className="r">ЄСВ</th>
          </tr></thead>
          <tbody>
            {calc.quarters.map(q => (
              <tr key={q.quarter}>
                <td>{Q_NAME[q.quarter - 1]}</td>
                <td className="r">{fmtMoney(q.income)}</td>
                <td className="r">{fmtMoney(q.expense)}</td>
                <td className="r">{fmtMoney(q.net)}</td>
                <td className="r">{q.quarter < 4 ? fmtMoney(q.advancePdfo) : '—'}</td>
                <td className="r">{q.quarter < 4 ? fmtMoney(q.advanceVz) : '—'}</td>
                <td className="r">{fmtMoney(q.esv)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="cell-muted" style={{ fontSize: '.82rem', marginTop: 10 }}>
          До сплати за річною декларацією з урахуванням авансів: ПДФО — <b>{fmtMoney(calc.pdfoToPay)}</b> грн,
          ВЗ — <b>{fmtMoney(calc.vzToPay)}</b> грн (від&apos;ємна сума — переплата).
        </p>
        <p className="cell-muted" style={{ fontSize: '.82rem' }}>
          Дохід і витрати беруться з розділу «Банк/Каса». До витрат не включаються платежі
          власних ПДФО, ВЗ і ПДВ до бюджету; ЄСВ включається. Перевірте, що у витратах лише
          документально підтверджені суми, пов&apos;язані з діяльністю (п. 177.4 ПКУ) —
          програма цього не розрізняє. Строки: аванси — до 20 квітня, 20 липня, 20 жовтня;
          декларація — до 1 травня наступного року; сплата — протягом 10 к.д. після
          граничного строку подання. ЄСВ{activeFop?.esvExempt ? ' не нараховується (у профілі позначено звільнення)' : ' — 22% чистого доходу місяця, у межах мінімального і максимального внеску; за місяці без чистого доходу не нараховується'}.
        </p>
      </div>
    </div>
  );
};

// ─── 4 група єдиного податку ──────────────────────────────────────
export const DpsGroup4 = () => {
  const { activeFop } = useFop();
  const [selYear, setSelYear] = useState(new Date().getFullYear());
  const p = taxYear(selYear);
  const epAnnual = +activeFop?.ep4Annual || 0;
  const shares = [0.10, 0.10, 0.50, 0.30];
  const esvMonth = activeFop?.esvExempt ? 0 : p.esvMin;
  const warning = taxYearWarning(selYear);

  return (
    <div className="view-dps">
      <div className="view-toolbar"><h2 className="view-title">Звітність ДПС</h2></div>
      <YearSelect value={selYear} onChange={setSelYear} />
      {warning && <div className="settings-msg" style={{ marginBottom: 12 }}>⚠ {warning}</div>}

      <div className="settings-section">
        <h3>4 група єдиного податку: платежі за {selYear} рік</h3>
        {epAnnual <= 0 && (
          <div className="settings-msg" style={{ marginBottom: 8 }}>
            ⚠ Річну суму ЄП не вказано. Впишіть її з декларації: Профіль ФОП → Оподаткування.
          </div>
        )}
        <table className="data-table">
          <thead><tr>
            <th>Квартал</th><th className="r">Частка</th><th className="r">ЄП</th>
            <th className="r">ВЗ (3 міс.)</th><th className="r">ЄСВ (3 міс.)</th>
          </tr></thead>
          <tbody>
            {shares.map((s, i) => (
              <tr key={i}>
                <td>{Q_NAME[i]}</td>
                <td className="r">{s * 100}%</td>
                <td className="r">{fmtMoney(round2(epAnnual * s))}</td>
                <td className="r">{fmtMoney(round2(p.vzFixed * 3))}</td>
                <td className="r">{fmtMoney(round2(esvMonth * 3))}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 700 }}>
              <td>Рік</td><td className="r">100%</td>
              <td className="r">{fmtMoney(epAnnual)}</td>
              <td className="r">{fmtMoney(round2(p.vzFixed * 12))}</td>
              <td className="r">{fmtMoney(round2(esvMonth * 12))}</td>
            </tr>
          </tbody>
        </table>
        <p className="cell-muted" style={{ fontSize: '.82rem', marginTop: 10 }}>
          ЄП 4 групи залежить від площі та нормативної грошової оцінки земель, тому програма
          його не обчислює, а розподіляє річну суму з декларації: 10% / 10% / 50% / 30% по кварталах,
          сплата — протягом 30 к.д. після кварталу. Декларація подається до 20 лютого поточного року.
          ВЗ — {fmtMoney(p.vzFixed)} грн на місяць (10% МЗП), не пізніше 20 числа.
          Декларацію 4 групи програма не формує.
        </p>
      </div>
    </div>
  );
};
