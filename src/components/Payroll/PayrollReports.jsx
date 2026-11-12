import React, { useMemo, useState } from 'react';
import JSZip from 'jszip';
import { useData } from '../../context/DataContext';
import { useFop } from '../../context/FopContext';
import { fmtMoney } from '../../utils/documentLogic';
import { openPrintWindow } from '../../utils/printWindow';
import { downloadXml, encode1251 } from '../../utils/xmlDps';
import {
  buildUnifiedPackage, calcDisabilityReport, buildDisabilityXml,
  buildHireNoticeXml, hireNoticeRow, fopXmlGaps, DISABILITY_MIN_HEADCOUNT,
} from '../../utils/payrollXml';
import { buildDisabilityHtml, buildHireNoticeHtml } from '../../utils/payrollDocs';
import { shiftWeekend } from '../../utils/deadlines';

// Граничний строк: 40 календарних днів після кварталу (п. 49.18.2 ПКУ),
// якщо останній день — вихідний, строк переноситься на наступний робочий день (п. 49.20 ПКУ).
const deadline40 = (year, quarter) => {
  const d = new Date(year, quarter * 3, 0);       // останній день кварталу
  d.setDate(d.getDate() + 40);
  return shiftWeekend(d).toLocaleDateString('uk-UA');
};

const saveBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const PayrollReports = () => {
  const { employees, payrollRecords, leaveRecords, hrOrders } = useData();
  const { activeFop } = useFop();
  const now = new Date();
  // за замовчуванням — останній завершений квартал
  const prevQ = Math.floor(now.getMonth() / 3) || 4;
  const [year, setYear] = useState(prevQ === 4 && now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear());
  const [quarter, setQuarter] = useState(prevQ);
  const [reportNum, setReportNum] = useState(1);
  const [ov, setOv] = useState({});
  const [hireIds, setHireIds] = useState([]);

  const gaps = fopXmlGaps(activeFop);
  const pkg = useMemo(() => buildUnifiedPackage({
    fop: activeFop, year, quarter, employees, records: payrollRecords, leaveRecords, hrOrders, reportNum,
  }), [activeFop, year, quarter, employees, payrollRecords, leaveRecords, hrOrders, reportNum]);
  const dis = useMemo(() => calcDisabilityReport({
    employees, records: payrollRecords, year, quarter, overrides: ov,
  }), [employees, payrollRecords, year, quarter, ov]);

  const hasData = pkg.months.some(m => m.recs.length);
  const confirmGaps = () => !gaps.length || window.confirm(
    `У профілі ФОП не заповнено: ${gaps.join(', ')}.\nБез цих даних кабінет файл не прийме. Сформувати все одно?`);

  const downloadPackage = async () => {
    if (!hasData) { alert('За квартал немає затверджених нарахувань'); return; }
    if (!confirmGaps()) return;
    const zip = new JSZip();
    pkg.files.forEach(f => zip.file(f.name, encode1251(f.xml)));
    saveBlob(await zip.generateAsync({ type: 'blob' }), `Податковий_розрахунок_${year}_${quarter}кв.zip`);
  };

  const hireRows = employees.filter(e => hireIds.includes(e.id)).map(e => hireNoticeRow(e, hrOrders));
  const recent = [...employees].filter(e => e.isActive).sort((a, b) => String(b.hireDate).localeCompare(String(a.hireDate)));
  const setO = (k) => (e) => setOv(p => ({ ...p, [k]: e.target.value }));
  const num = (k, label, auto) => (
    <div className="field">
      <label>{label}</label>
      <input type="number" min="0" value={ov[k] ?? ''} placeholder={String(auto)} onChange={setO(k)} />
    </div>
  );
  const disAuto = useMemo(() => calcDisabilityReport({ employees, records: payrollRecords, year, quarter }),
    [employees, payrollRecords, year, quarter]);

  return (
    <div>
      <div className="filters-bar" style={{ marginBottom: 16 }}>
        <div className="field"><label>Рік</label>
          <input type="number" value={year} onChange={e => setYear(+e.target.value)} style={{ width: 100 }} /></div>
        <div className="field"><label>Квартал</label>
          <select value={quarter} onChange={e => setQuarter(+e.target.value)} style={{ width: 100 }}>
            {[1, 2, 3, 4].map(q => <option key={q} value={q}>{q}</option>)}
          </select></div>
      </div>

      {gaps.length > 0 && (
        <p className="form-error" style={{ marginBottom: 12 }}>
          Для XML не вистачає реквізитів: {gaps.join(', ')}. Заповніть їх у профілі ФОП → «Додатково».
        </p>
      )}

      {/* ─── Податковий розрахунок ─── */}
      <div className="settings-section">
        <h3>Податковий розрахунок з ПДФО, ВЗ та ЄСВ (F0500111)</h3>
        <p className="cell-muted" style={{ fontSize: '.83rem', marginBottom: 12 }}>
          Квартальна форма для ФОП з розбивкою за місяцями. До основної форми додаються ФІЗ-Д1 і ФІЗ-4ДФ
          за кожен місяць, а ФІЗ-Д5 — якщо у кварталі когось прийняли чи звільнили.
          Граничний строк подання за {quarter} квартал {year} року — {deadline40(year, quarter)}.
        </p>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr>
              <th>Показник</th>
              {pkg.months.map(m => <th key={m.period} style={{ textAlign: 'right' }}>{m.period}</th>)}
            </tr></thead>
            <tbody>
              {[
                ['Нараховано доходу (рядок 1)', m => m.calc.r1],
                ['База ЄСВ (рядок 2)', m => m.calc.r2],
                ['у т. ч. різниця до МЗП (рядок 2.3)', m => m.calc.r23],
                ['Нараховано ЄСВ (рядок 3)', m => m.calc.r3],
                ['ПДФО', m => m.df4rows.reduce((s, x) => s + x.pdfoA, 0)],
                ['Військовий збір', m => m.df4rows.reduce((s, x) => s + x.vzA, 0)],
              ].map(([label, f]) => (
                <tr key={label}><td>{label}</td>
                  {pkg.months.map(m => <td key={m.period} style={{ textAlign: 'right' }}>{fmtMoney(f(m))}</td>)}</tr>
              ))}
              <tr><td>Працівників з нарахуваннями</td>
                {pkg.months.map(m => <td key={m.period} style={{ textAlign: 'right' }}>{m.paidCount}</td>)}</tr>
            </tbody>
          </table>
        </div>
        {pkg.warnings.map(w => <p key={w} className="form-error" style={{ marginTop: 6 }}>{w}</p>)}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 12 }}>
          <div className="field"><label>Номер розрахунку за квартал</label>
            <input type="number" min="1" value={reportNum} onChange={e => setReportNum(Math.max(1, +e.target.value || 1))} style={{ width: 120 }} /></div>
          <button className="btn btn--primary" onClick={downloadPackage}>⇩ Пакет XML ({pkg.files.length} файлів, zip)</button>
        </div>
        <p className="cell-muted" style={{ fontSize: '.8rem', marginTop: 8 }}>
          Розпакуйте архів і завантажте всі файли в кабінет разом: основна форма посилається на додатки.
          Графи «виплачено» і «перераховано» в ФІЗ-4ДФ заповнюються для нарахувань зі статусом «Виплачено».
        </p>
      </div>

      {/* ─── Внесок на підтримку працевлаштування осіб з інвалідністю ─── */}
      <div className="settings-section" style={{ marginTop: 20 }}>
        <h3>Звіт про внесок на підтримку працевлаштування осіб з інвалідністю (F0500701)</h3>
        <p className="cell-muted" style={{ fontSize: '.83rem', marginBottom: 12 }}>
          Внесок платить роботодавець, у якого за квартал у середньому {DISABILITY_MIN_HEADCOUNT} і більше штатних
          працівників і не виконано норматив (8–25 працівників — одне робоче місце, понад 25 — 4 %).
          Строк подання — {deadline40(year, quarter)}. Числа нижче пораховано автоматично; якщо треба, впишіть свої.
        </p>
        <div className="form-row-4">
          {num('headcount', 'Середньооблікова кількість штатних', disAuto.headcount)}
          {num('partTimers', 'Зовнішні сумісники (екв. повної зайнятості)', 0)}
          {num('norm', 'Норматив робочих місць', disAuto.norm)}
          {num('withDisability', 'Працівників з інвалідністю', disAuto.withDisability)}
        </div>
        <div className="form-row-4">
          {num('heavy', 'з них І група / ІІ група (зір, психічні розлади)', 0)}
          {num('wages', 'Нарахована зарплата за квартал, грн', disAuto.wages)}
          {num('avgWage', 'Середньомісячна зарплата на працівника, грн', disAuto.avgWage)}
        </div>
        <p style={{ margin: '10px 0' }}>
          {dis.headcount < DISABILITY_MIN_HEADCOUNT
            ? <>Середня кількість працівників — <b>{dis.headcount}</b>, менше {DISABILITY_MIN_HEADCOUNT}: внесок не нараховується.</>
            : dis.gap === 0
              ? <>Норматив ({dis.norm}) виконано: внесок не нараховується.</>
              : <>Не вистачає робочих місць: <b>{dis.gap}</b>. Внесок до сплати за квартал: <b>{fmtMoney(dis.contribution)} грн</b>.</>}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn--ghost" onClick={() => openPrintWindow(buildDisabilityHtml({ calc: dis, fop: activeFop }), { fop: activeFop })}>🖨 Друк звіту</button>
          <button className="btn btn--primary" onClick={() => {
            if (!confirmGaps()) return;
            const { xml, name } = buildDisabilityXml({ fop: activeFop, calc: dis });
            downloadXml(xml, name);
          }}>⇩ XML звіту</button>
        </div>
        {!dis.isPayer && (
          <p className="cell-muted" style={{ fontSize: '.8rem', marginTop: 8 }}>
            Чи мусить подавати звіт роботодавець, який не є платником внеску, джерела трактують по-різному.
            Якщо подаєте — у файлі заповнено лише заголовну частину, як вимагає форма для неплатників.
          </p>
        )}
      </div>

      {/* ─── Повідомлення про прийняття ─── */}
      <div className="settings-section" style={{ marginTop: 20 }}>
        <h3>Повідомлення про прийняття працівника на роботу (F3001005)</h3>
        <p className="cell-muted" style={{ fontSize: '.83rem', marginBottom: 12 }}>
          Подається до ДПС до початку роботи працівника. Номер і дата наказу беруться з наказу про прийняття.
        </p>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 10 }}>
          {recent.length === 0 && <span className="cell-muted">Працівників немає</span>}
          {recent.map(e => (
            <label key={e.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={hireIds.includes(e.id)}
                onChange={ev => setHireIds(p => ev.target.checked ? [...p, e.id] : p.filter(x => x !== e.id))} />
              {e.fullName} <span className="cell-muted">з {e.hireDate}</span>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn--ghost" disabled={!hireRows.length}
            onClick={() => openPrintWindow(buildHireNoticeHtml({ rows: hireRows, fop: activeFop }), { fop: activeFop })}>🖨 Друк</button>
          <button className="btn btn--primary" disabled={!hireRows.length} onClick={() => {
            if (hireRows.some(r => !r.orderNumber) && !window.confirm('Для когось із працівників немає наказу про прийняття — номер наказу буде порожній. Продовжити?')) return;
            if (!confirmGaps()) return;
            const { xml, name } = buildHireNoticeXml({ fop: activeFop, rows: hireRows });
            downloadXml(xml, name);
          }}>⇩ XML повідомлення</button>
        </div>
      </div>
    </div>
  );
};

export default PayrollReports;
