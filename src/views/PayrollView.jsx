import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useFop } from '../context/FopContext';
import {
  EMPTY_EMPLOYEE, EMPTY_PAYROLL, PAYROLL_STATUSES,
  LEAVE_TYPES, DEDUCTION_TYPES, DEDUCTION_BASES,
  PDFO_RATE, VZ_RATE, ESV_RATE, MIN_WAGE,
  ANNUAL_LEAVE_DAYS,
} from '../constants/payrollTypes';
import {
  calcNetFromGross, calcGrossFromNet,
  calcLeaveDaily, calcLeaveAmount,
  calcSickPay, calcSickDaily, SICK_STAZH_PERCENTS, calcTerminationCompensation,
  calcUnpaidLeaveDeduction, calcWorkingDaysInMonth, calcWorkingDaysInRange,
  buildPayrollSummary, calcLeaveAccrualForMonth, round2,
} from '../utils/payrollLogic';
import { calcIndexation } from '../utils/indexation';
import { buildEmployeeTimesheet } from '../utils/timesheet';
import { buildPayrollSheetHtml, buildSickCalcHtml } from '../utils/payrollDocs';
import { fmtMoney } from '../utils/documentLogic';
import { openPrintWindow } from '../utils/printWindow';
import HrOrders from '../components/Payroll/HrOrders';
import Timesheet from '../components/Payroll/Timesheet';
import PayrollReports from '../components/Payroll/PayrollReports';

// ─── Форма картки працівника ─────────────────────────────────────────
const EmployeeForm = ({ initial, onSave, onCancel }) => {
  const [form, setForm] = useState(initial || { ...EMPTY_EMPLOYEE });
  const [err, setErr] = useState('');
  const set = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));
  const setCheck = e => setForm(p => ({ ...p, [e.target.name]: e.target.checked }));

  const handleSave = () => {
    if (!form.fullName.trim()) { setErr('ПІБ обов\'язкове'); return; }
    if (!form.rnokpp.trim() || form.rnokpp.replace(/\D/g,'').length !== 10) { setErr('РНОКПП — 10 цифр'); return; }
    if (!form.hireDate) { setErr('Вкажіть дату прийому'); return; }
    if (form.hasDisability && !form.disabilityDocDate) {
      setErr('Для ставки ЄСВ 8,41% вкажіть дату витягу/довідки про інвалідність'); return;
    }
    setErr('');
    onSave(form);
  };

  return (
    <div className="inline-form">
      <div className="inline-form-header">
        <span>{initial?.id ? 'Редагування картки' : 'Новий працівник'}</span>
        <button className="btn-close" onClick={onCancel}>✕</button>
      </div>
      {err && <div className="form-error">{err}</div>}
      <div className="form-row-3">
        <div className="field">
          <label>ПІБ <span className="req">*</span></label>
          <input name="fullName" value={form.fullName} onChange={set} placeholder="Прізвище Ім'я По-батькові" />
        </div>
        <div className="field">
          <label>РНОКПП <span className="req">*</span></label>
          <input name="rnokpp" value={form.rnokpp} onChange={set} maxLength={10} placeholder="1234567890" />
        </div>
        <div className="field">
          <label>Посада</label>
          <input name="position" value={form.position} onChange={set} placeholder="Менеджер з продажу" />
        </div>
      </div>
      <div className="form-row-4">
        <div className="field">
          <label>Оклад (грн/міс)</label>
          <input type="number" name="salary" value={form.salary} onChange={set} min="0" placeholder={MIN_WAGE} />
        </div>
        <div className="field">
          <label>IBAN для виплати</label>
          <input name="iban" value={form.iban} onChange={set} placeholder="UA..." maxLength={34} />
        </div>
        <div className="field">
          <label>Дата прийому <span className="req">*</span></label>
          <input type="date" name="hireDate" value={form.hireDate} onChange={set} />
        </div>
        <div className="field">
          <label>Дата звільнення</label>
          <input type="date" name="fireDate" value={form.fireDate || ''} onChange={set} />
        </div>
      </div>
      <div className="form-row-3">
        <div className="field">
          <label>Днів відпустки/рік</label>
          <input type="number" name="leaveEntitlement" value={form.leaveEntitlement} onChange={set} min="24" />
        </div>
        <div className="field">
          <label>Накопичено відпустки (к.д.)</label>
          <input type="number" name="leaveAccrued" value={form.leaveAccrued || 0} onChange={set} min="0" step="0.5" />
        </div>
        <div className="field">
          <label>Використано відпустки (к.д.)</label>
          <input type="number" name="leaveUsed" value={form.leaveUsed || 0} onChange={set} min="0" step="0.5" />
        </div>
      </div>
      <div className="form-row-4">
        <div className="field">
          <label>Стать (для ФІЗ-Д1)</label>
          <select name="gender" value={form.gender || ''} onChange={set}>
            <option value="">— не вказано —</option>
            <option value="Ж">жіноча</option>
            <option value="Ч">чоловіча</option>
          </select>
        </div>
        <div className="field">
          <label>Лікарняні за страховим стажем</label>
          <select name="sickPercent" value={+form.sickPercent || 100} onChange={set}>
            {SICK_STAZH_PERCENTS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Базовий місяць індексації</label>
          <input type="month" name="indexBaseMonth" value={form.indexBaseMonth || ''} onChange={set} />
        </div>
        <div className="field">
          <span className="cell-muted" style={{ fontSize: '.78rem' }}>
            Базовий — місяць останнього підвищення окладу за посадою. Порожньо = січень 2026
            (обнулення за Законом про Держбюджет-2026).
          </span>
        </div>
      </div>
      <div className="form-row-3">
        <div className="field">
          <label>Код професії за Класифікатором (ФІЗ-Д5)</label>
          <input name="kpCode" value={form.kpCode || ''} onChange={set} placeholder="8322" />
        </div>
        <div className="field">
          <label>Професійна назва роботи за Класифікатором</label>
          <input name="kpName" value={form.kpName || ''} onChange={set} placeholder="Водій автотранспортних засобів" />
        </div>
      </div>
      <div className="form-row-3">
        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" name="hasDisability" checked={!!form.hasDisability} onChange={setCheck} />
            Особа з інвалідністю (ЄСВ 8,41%)
          </label>
        </div>
        {form.hasDisability && (
          <div className="field">
            <label>Дата витягу / довідки <span className="req">*</span></label>
            <input type="date" name="disabilityDocDate" value={form.disabilityDocDate || ''} onChange={set} />
          </div>
        )}
        {form.hasDisability && (
          <div className="field">
            <span className="cell-muted" style={{ fontSize: '.78rem' }}>
              Пільгова ставка застосовується з дати отримання підтвердного документа.
              Донарахування ЄСВ до мінімального внеску не робиться.
            </span>
          </div>
        )}
      </div>
      <div className="form-actions">
        <button className="btn btn--primary" onClick={handleSave}>Зберегти</button>
        <button className="btn btn--ghost" onClick={onCancel}>Скасувати</button>
      </div>
    </div>
  );
};

// ─── Калькулятор нарахування ─────────────────────────────────────────
const PayrollCalc = ({ employee, period, existingRecord, onSave, onCancel }) => {
  // Середньоденна зарплата: фактичні нарахування за 12 місяців перед періодом
  // (Порядок № 100). Якщо історії нарахувань ще немає — від окладу.
  const { payrollRecords: allPayroll, leaveRecords } = useData();
  // Табель місяця: відпустки, лікарняні, дати прийняття/звільнення
  const ts = buildEmployeeTimesheet(employee, period, leaveRecords || []);
  const history = (allPayroll || [])
    .filter(r => r.employeeId === employee.id && r.status !== 'draft' && r.period < period)
    .sort((a, b) => b.period.localeCompare(a.period))
    .slice(0, 12);
  const dailyRate = history.length
    ? calcLeaveDaily(history.map(r => +r.totalGross || 0), history.map(r => r.period))
    : calcLeaveDaily([+employee.salary || 0], [period]);

  const [mode, setMode] = useState('gross');
  // Баг 6: якщо salary збережено як рядок або число — нормалізуємо
  const [grossInput, setGrossInput] = useState(
    existingRecord
      ? String(+existingRecord.grossSalary || 0)
      : String(+employee.salary || 0)
  );
  const [netInput, setNetInput] = useState('');
  const [deductions, setDeductions] = useState(existingRecord?.deductions || []);
  const [sickDays, setSickDays] = useState(String(existingRecord ? (existingRecord.sickDays || 0) : ts.sick));
  const [sickPercent, setSickPercent] = useState(String(existingRecord?.sickPayPercent || employee.sickPercent || 100));
  const [sickDaysBefore, setSickDaysBefore] = useState(String(existingRecord?.sickDaysBefore || 0));
  const [sickLowStazh, setSickLowStazh] = useState(!!existingRecord?.sickLowStazh);
  const [sickPfu, setSickPfu] = useState(existingRecord ? existingRecord.sickPfuIncluded !== false : true);
  const [leaveDays, setLeaveDays] = useState(String(existingRecord ? (existingRecord.leaveDays || 0) : ts.annual));
  // Робочі дні, за які нараховується оклад (без відпустки, лікарняних і днів поза трудовими
  // відносинами). Дні відпустки без збереження віднімаються окремо нижче.
  // У раніше збережених нарахуваннях цього поля не було — там оклад брався повністю.
  const [baseDays, setBaseDays] = useState(String(
    existingRecord ? (existingRecord.baseDays ?? calcWorkingDaysInMonth(period)) : (ts.workDays + ts.unpaidWork)
  ));
  const [indexOverride, setIndexOverride] = useState(
    existingRecord && existingRecord.indexationManual ? String(existingRecord.indexationAmount || 0) : ''
  );
  const [compensationDays, setCompensationDays] = useState(String(existingRecord?.compensationDays || 0));
  // Оголошення станів ВВР мають іти ДО unpaidCalendarDays: const не піднімається,
  // читання unpaidStartDate вище за його useState кидало ReferenceError (TDZ)
  // і рушило весь калькулятор нарахування.
  const [unpaidStartDate, setUnpaidStartDate] = useState(existingRecord?.unpaidStartDate || ts.unpaidFrom || `${period}-01`);
  const [unpaidEndDate, setUnpaidEndDate] = useState(existingRecord ? (existingRecord.unpaidEndDate || '') : ts.unpaidTo);
  // к.д. = включно з...до; порожні дати → 0
  const unpaidCalendarDays = (unpaidStartDate && unpaidEndDate && unpaidEndDate >= unpaidStartDate)
    ? Math.round((new Date(unpaidEndDate) - new Date(unpaidStartDate)) / 86400000) + 1
    : 0;
  const workingDaysInMonth = calcWorkingDaysInMonth(period);
  const unpaidDays = calcWorkingDaysInRange(unpaidStartDate, +unpaidCalendarDays);
  const [otherAccruals, setOtherAccruals] = useState(String(existingRecord?.otherAccruals || 0));
  const [notes, setNotes] = useState(existingRecord?.notes || '');

  // У трудових відносинах увесь місяць → при базі, меншій за МЗП, ЄСВ від МЗП
  // (також коли були лікарняні, відпустка чи відпустка без збереження).
  const isFullMonth = ts.fullMonthEmployed;

  // Середньоденна для лікарняних рахується окремо від відпускної (Порядок № 1266)
  const sickDailyInfo = calcSickDaily({
    history: history.map(r => ({ period: r.period, gross: +r.totalGross || 0 })),
    salary: +employee.salary || 0, period, lowStazh: sickLowStazh,
  });
  const sickDaily = sickDailyInfo.daily;

  // Похідні значення — рахуємо при кожному рендері від актуальних станів
  const sickCalc   = calcSickPay({ dailyRate: sickDaily, totalDays: +sickDays, payPercent: +sickPercent, daysBefore: +sickDaysBefore });
  const sickInfo   = { ...sickCalc, pfuAmount: sickPfu ? sickCalc.pfuAmount : 0 };
  const leaveAmt   = calcLeaveAmount(dailyRate, +leaveDays);
  const compAmt    = calcTerminationCompensation({ dailyRate, unusedDays: +compensationDays }).amount;
  const unpaidInfo = calcUnpaidLeaveDeduction({
    monthlySalary:      +grossInput || 0,
    workingDaysInMonth: +workingDaysInMonth,
    unpaidDays:         +unpaidDays,
  });

  // Оклад за відпрацьований час: пропорційно робочим дням, мінус відпустка без збереження
  const normDays = +workingDaysInMonth || 21;
  const paidDays = Math.max(0, Math.min(+baseDays || 0, normDays));
  const salaryForDays = round2((+grossInput || 0) * paidDays / normDays);
  const salaryAfterUnpaid = Math.max(0, round2(salaryForDays - unpaidInfo.deduction));
  // Індексація: у межах прожиткового мінімуму, пропорційно відпрацьованому часу
  const indexInfo = calcIndexation({
    baseMonth: employee.indexBaseMonth, period, income: salaryAfterUnpaid,
    workShare: Math.max(0, paidDays - (+unpaidDays || 0)) / normDays,
  });
  const indexAmt = indexOverride !== '' ? round2(+indexOverride || 0) : indexInfo.amount;
  const totalGross = round2(salaryAfterUnpaid + indexAmt + sickInfo.employerAmount + sickInfo.pfuAmount
    + leaveAmt + compAmt + (+otherAccruals || 0));

  const calc = useMemo(() => {
    const esvOpts = { hasDisability: !!employee.hasDisability, period };
    if (mode === 'gross') return calcNetFromGross(totalGross, deductions, isFullMonth, esvOpts);
    const base = calcGrossFromNet(+netInput || 0, deductions, false, esvOpts); // неповний місяць при нетто-режимі
    return base || calcNetFromGross(0, deductions, isFullMonth, esvOpts);
  }, [mode, totalGross, netInput, deductions, isFullMonth, employee.hasDisability, period]);

  const addDeduction = () => setDeductions(p => [
    ...p, { id: Date.now().toString(), type: 'executive', label: 'Виконавчий лист', base: 'percent', value: '', amount: 0 }
  ]);
  const setDed = (id, field, val) => setDeductions(p => p.map(d => d.id === id ? { ...d, [field]: val } : d));
  const removeDed = (id) => setDeductions(p => p.filter(d => d.id !== id));

  // Баг 8: handleSave перераховує все інлайн — ніяких stale closure
  const handleSave = () => {
    try {
      const gInput = +grossInput || 0;
      const wdim   = +workingDaysInMonth || 21;
      const ud     = +unpaidDays || 0;
      const sd     = +sickDays || 0;
      const ld     = +leaveDays || 0;
      const cd     = +compensationDays || 0;
      const other  = +otherAccruals || 0;
      const sp     = +sickPercent || 100;
      const fullMonth = ts.fullMonthEmployed;

      const sickC2  = calcSickPay({ dailyRate: sickDaily, totalDays: sd, payPercent: sp, daysBefore: +sickDaysBefore });
      const sick2   = { ...sickC2, pfuAmount: sickPfu ? sickC2.pfuAmount : 0 };
      const leave2  = calcLeaveAmount(dailyRate, ld);
      const comp2   = calcTerminationCompensation({ dailyRate, unusedDays: cd }).amount;
      const unpaid2 = calcUnpaidLeaveDeduction({ monthlySalary: gInput, workingDaysInMonth: wdim, unpaidDays: ud });

      const paid2 = Math.max(0, Math.min(+baseDays || 0, wdim));
      const salaryNet2 = Math.max(0, round2(round2(gInput * paid2 / wdim) - unpaid2.deduction));
      const index2 = indexOverride !== '' ? round2(+indexOverride || 0) : calcIndexation({
        baseMonth: employee.indexBaseMonth, period, income: salaryNet2,
        workShare: Math.max(0, paid2 - ud) / wdim,
      }).amount;
      const totalGross2 = round2(salaryNet2 + index2 + sick2.employerAmount + sick2.pfuAmount + leave2 + comp2 + other);

      const esvOpts2 = { hasDisability: !!employee.hasDisability, period };
      const finalCalc = mode === 'gross'
        ? calcNetFromGross(totalGross2, deductions, fullMonth, esvOpts2)
        : (calcGrossFromNet(+netInput || 0, deductions, false, esvOpts2) || calcNetFromGross(0, deductions, fullMonth, esvOpts2));

      if (!finalCalc) { alert('Помилка розрахунку'); return; }

      onSave({
        employeeId:           employee.id,
        period,
        grossSalary:          gInput,
        sickDays:             sd,
        sickPayPercent:       sp,
        sickPayAmount:        sick2.employerAmount,
        sickPfuAmount:        sick2.pfuAmount,
        sickPfuIncluded:      sickPfu,
        sickDaysBefore:       +sickDaysBefore || 0,
        sickLowStazh:         sickLowStazh,
        sickDailyRate:        sd > 0 ? sickDaily : 0,
        baseDays:             paid2,
        indexationAmount:     index2,
        indexationManual:     indexOverride !== '',
        indexationCoef:       indexInfo.coefPercent,
        leaveDays:            ld,
        leavePayAmount:       leave2,
        compensationDays:     cd,
        compensationAmount:   comp2,
        unpaidDays:           ud,
        unpaidCalendarDays:   +unpaidCalendarDays || 0,
        unpaidStartDate:      unpaidStartDate,
        unpaidEndDate:        unpaidEndDate,
        workingDaysInMonth:   wdim,
        unpaidDeductionAmount:unpaid2.deduction,
        otherAccruals:        other,
        totalGross:           totalGross2,
        pdfo:                 finalCalc.pdfo,
        vz:                   finalCalc.vz,
        deductions:           finalCalc.deductions,
        totalDeductions:      finalCalc.totalDeductions,
        netPay:               finalCalc.netPay,
        esv:                  finalCalc.esv,
        esvBase:              finalCalc.esvBase,
        esvRate:              finalCalc.esvRate,
        hasDisability:        !!employee.hasDisability,
        status:               'draft',
        notes,
      });
    } catch(e) {
      console.error('Помилка збереження нарахування:', e);
      alert('Помилка: ' + (e.message || String(e)));
    }
  };

  return (
    <div className="payroll-calc">
      <div className="inline-form-header">
        <span>Нарахування: {employee.fullName} / {period}</span>
        <button className="btn-close" onClick={onCancel}>✕</button>
      </div>

      {/* Режим розрахунку */}
      <div className="tabs-bar" style={{ marginBottom: 14 }}>
        <button className={`tab-pill${mode==='gross'?' tab-pill--active':''}`} onClick={() => setMode('gross')}>Брутто → Нетто</button>
        <button className={`tab-pill${mode==='net'?' tab-pill--active':''}`} onClick={() => setMode('net')}>Нетто → Брутто (хоче на руки)</button>
      </div>

      <div className="form-row-4" style={{ marginBottom: 12 }}>
        {mode === 'gross' ? (
          <div className="field">
            <label>Оклад за місяць, грн</label>
            <input type="number" value={grossInput} onChange={e => setGrossInput(e.target.value)} min="0" step="0.01" />
          </div>
        ) : (
          <div className="field">
            <label>Хоче отримати на руки, грн</label>
            <input type="number" value={netInput} onChange={e => setNetInput(e.target.value)} min="0" step="0.01" />
          </div>
        )}
        <div className="field">
          <label>Лікарняних днів</label>
          <input type="number" value={sickDays} onChange={e => setSickDays(e.target.value)} min="0" />
        </div>
        {+sickDays > 0 && (<>
          <div className="field">
            <label>Оплата за страховим стажем</label>
            <select value={+sickPercent} onChange={e => setSickPercent(e.target.value)}>
              {SICK_STAZH_PERCENTS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>З них оплачено в попередньому місяці, днів</label>
            <input type="number" value={sickDaysBefore} onChange={e => setSickDaysBefore(e.target.value)} min="0" />
          </div>
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={sickLowStazh} onChange={e => setSickLowStazh(e.target.checked)} />
              Стаж за останні 12 міс. менше 6 міс. (обмеження з МЗП)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={sickPfu} onChange={e => setSickPfu(e.target.checked)} />
              Нарахувати частину коштом ПФУ (з 6-го дня)
            </label>
          </div>
        </>)}
        <div className="field">
          <label>Робочих днів до оплати окладом (з {normDays})</label>
          <input type="number" value={baseDays} onChange={e => setBaseDays(e.target.value)} min="0" max={normDays} />
        </div>
        <div className="field">
          <label>Індексація, грн {indexInfo.coefPercent > 0 ? `(${indexInfo.coefPercent} %)` : ''}</label>
          <input type="number" value={indexOverride} onChange={e => setIndexOverride(e.target.value)}
            min="0" step="0.01" placeholder={String(indexInfo.amount)} />
        </div>
        <div className="field">
          <label>Днів відпустки (щорічна)</label>
          <input type="number" value={leaveDays} onChange={e => setLeaveDays(e.target.value)} min="0" />
        </div>
        <div className="field">
          <label>Дні компенсації (звільнення)</label>
          <input type="number" value={compensationDays} onChange={e => setCompensationDays(e.target.value)} min="0" />
        </div>
        <div className="field">
          <label>Відпустка за вл. рах.: з</label>
          <input type="date" value={unpaidStartDate} onChange={e => setUnpaidStartDate(e.target.value)} />
        </div>
        <div className="field">
          <label>по (включно)</label>
          <input type="date" value={unpaidEndDate} onChange={e => setUnpaidEndDate(e.target.value)} min={unpaidStartDate} />
        </div>
        {+unpaidCalendarDays > 0 && (
          <div className="field">
            <label>Робочих днів (рахує програма)</label>
            <input type="number" value={unpaidDays} disabled />
          </div>
        )}
        <div className="field">
          <label>Інші нарахування, грн</label>
          <input type="number" value={otherAccruals} onChange={e => setOtherAccruals(e.target.value)} min="0" step="0.01" />
        </div>
      </div>

      {/* Утримання */}
      {deductions.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div className="invoice-detail-title">Утримання (аліменти / виконавчі листи)</div>
          {deductions.map(d => (
            <div key={d.id} className="form-row-4" style={{ marginBottom: 6 }}>
              <div className="field">
                <label>Тип</label>
                <select value={d.type} onChange={e => setDed(d.id,'type',e.target.value)}>
                  {DEDUCTION_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>База</label>
                <select value={d.base} onChange={e => setDed(d.id,'base',e.target.value)}>
                  {DEDUCTION_BASES.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>{d.base==='percent' ? 'Відсоток (% від нетто)' : 'Сума, грн'}</label>
                <input type="number" value={d.value} onChange={e => setDed(d.id,'value',e.target.value)} min="0" step={d.base==='percent'?'0.01':'0.01'} />
              </div>
              <div className="field" style={{ display:'flex', alignItems:'flex-end' }}>
                <button className="btn-icon btn-icon--del" onClick={() => removeDed(d.id)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <button className="btn btn--ghost btn--sm" style={{ marginBottom: 16 }} onClick={addDeduction}>
        + Додати аліменти / виконавчий лист
      </button>

      {/* Результат */}
      <div className="payroll-result">
        <div className="payroll-result-title">Розрахунок</div>
        <div className="payroll-result-grid">
          <div className="payroll-result-section">
            <div className="payroll-result-label">НАРАХОВАНО</div>
            <div className="payroll-result-row"><span>Оклад (повний)</span><b>{fmtMoney(grossInput)}</b></div>
            {paidDays < normDays && (
              <div className="payroll-result-row"><span>Оклад за {paidDays} з {normDays} роб. днів</span><b>{fmtMoney(salaryForDays)}</b></div>
            )}
            {unpaidInfo.deduction > 0 && (
              <div className="payroll-result-row">
                <span>ВВР ({+unpaidCalendarDays} к.д. → {+unpaidDays} роб.д. × {fmtMoney(unpaidInfo.dailyRate)} грн)</span>
                <b style={{color:'var(--error)'}}>− {fmtMoney(unpaidInfo.deduction)}</b>
              </div>
            )}
            {unpaidInfo.deduction > 0 && (
              <div className="payroll-result-row"><span>Оклад за відпрацьований час</span><b>{fmtMoney(salaryAfterUnpaid)}</b></div>
            )}
            {indexAmt > 0 && (
              <div className="payroll-result-row">
                <span>Індексація ({indexOverride !== '' ? 'вручну' : `${indexInfo.coefPercent} % від ${fmtMoney(indexInfo.indexedPart)}, база ${indexInfo.base}`})</span>
                <b>{fmtMoney(indexAmt)}</b>
              </div>
            )}
            {sickInfo.employerAmount > 0 && <div className="payroll-result-row"><span>Лікарняний ({sickInfo.employerDays} д. × {fmtMoney(sickInfo.perDay)}, роботодавець)</span><b>{fmtMoney(sickInfo.employerAmount)}</b></div>}
            {sickInfo.pfuAmount > 0 && <div className="payroll-result-row"><span>Лікарняний ({sickInfo.fssDays} д., коштом ПФУ)</span><b>{fmtMoney(sickInfo.pfuAmount)}</b></div>}
            {leaveAmt > 0 && <div className="payroll-result-row"><span>Відпускні ({leaveDays} к.д.)</span><b>{fmtMoney(leaveAmt)}</b></div>}
            {compAmt > 0 && <div className="payroll-result-row"><span>Компенсація відпустки ({compensationDays} д.)</span><b>{fmtMoney(compAmt)}</b></div>}
            {(+otherAccruals) > 0 && <div className="payroll-result-row"><span>Інші нарахування</span><b>{fmtMoney(otherAccruals)}</b></div>}
            <div className="payroll-result-row payroll-result-row--total"><span>Всього нараховано (брутто)</span><b>{fmtMoney(calc.gross || totalGross)}</b></div>
          </div>
          <div className="payroll-result-section">
            <div className="payroll-result-label">УТРИМАННЯ З ПРАЦІВНИКА</div>
            <div className="payroll-result-row"><span>ПДФО {(PDFO_RATE*100).toFixed(0)}%</span><b style={{color:'var(--error)'}}>{fmtMoney(calc.pdfo)}</b></div>
            <div className="payroll-result-row"><span>ВЗ {(VZ_RATE*100).toFixed(0)}%</span><b style={{color:'var(--error)'}}>{fmtMoney(calc.vz)}</b></div>
            {calc.deductions?.map((d, i) => (
              <div key={i} className="payroll-result-row">
                <span>{DEDUCTION_TYPES.find(t=>t.id===d.type)?.label || d.type} ({d.base==='percent'?d.value+'%':fmtMoney(d.value)+' грн'})</span>
                <b style={{color:'var(--error)'}}>{fmtMoney(d.amount)}</b>
              </div>
            ))}
            <div className="payroll-result-row payroll-result-row--total">
              <span style={{color:'var(--success)', fontWeight:700}}>ДО ВИПЛАТИ</span>
              <b style={{color:'var(--success)', fontSize:'1.15rem'}}>{fmtMoney(calc.netPay)}</b>
            </div>
          </div>
          <div className="payroll-result-section">
            <div className="payroll-result-label">НАРАХУВАННЯ РОБОТОДАВЦЯ (окремо від ФОП)</div>
            <div className="payroll-result-row"><span>ЄСВ {((calc.esvRate || ESV_RATE)*100).toFixed(2).replace(/\.?0+$/, '')}% {!isFullMonth ? '(прийнятий/звільнений посеред місяця)' : calc.esvBase > totalGross ? `(від мін. зарп. ${fmtMoney(calc.esvBase)})` : ''}</span><b>{fmtMoney(calc.esv)}</b></div>
            <div className="payroll-result-row payroll-result-row--total"><span>Всього витрат роботодавця</span><b>{fmtMoney(calc.totalEmployerCost)}</b></div>
          </div>
        </div>
      </div>

      {indexInfo.missing.length > 0 && (
        <p className="form-error" style={{ marginTop: 8 }}>
          Індексацію пораховано без індексу споживчих цін за {indexInfo.missing.join(', ')}: Держстат його ще не
          оприлюднив або його не внесено в програму. Перевірте суму.
        </p>
      )}
      {+sickDays > 0 && (
        <p className="cell-muted" style={{ fontSize: '.8rem', marginTop: 8 }}>
          Середньоденна для лікарняних: {fmtMoney(sickDaily)} грн
          {sickDailyInfo.limited === 'max' && ' (обмежено максимальною базою ЄСВ)'}
          {sickDailyInfo.limited === 'min' && ' (не менше розрахованої з МЗП)'}
          {sickDailyInfo.limited === 'lowStazh' && ' (обмежено розрахунком з МЗП через стаж)'}
          {sickDailyInfo.months === 0 && ' — заробітку в розрахунковому періоді немає, взято оклад / 30,44'}.
        </p>
      )}
      <div className="field" style={{ maxWidth: 400, marginTop: 12 }}>
        <label>Примітка</label>
        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Примітка до нарахування" />
      </div>

      <div className="form-actions" style={{ marginTop: 12 }}>
        <button className="btn btn--primary" onClick={handleSave}>Зберегти нарахування</button>
        <button className="btn btn--ghost" onClick={onCancel}>Скасувати</button>
      </div>
    </div>
  );
};

// ─── Розрахунковий листок (текст для друку) ──────────────────────────
const printPayslip = (record, employee, fop) => {
  const ded = (record.deductions || []).map(d =>
    `${DEDUCTION_TYPES.find(t=>t.id===d.type)?.label||d.type}: ${fmtMoney(d.amount)} грн`
  ).join('\n');

  const html = `<!DOCTYPE html><html lang="uk"><head>
<meta charset="UTF-8"><title>Розрахунковий листок</title>
<style>
  body{font-family:Arial,sans-serif;font-size:12px;margin:20px}
  h2{font-size:14px;margin-bottom:4px}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  td,th{border:1px solid #ccc;padding:4px 8px}
  .total{font-weight:bold;background:#f0f0f0}
  .net{font-weight:bold;color:#1a6b50;background:#e8f5f0}
</style></head><body>
<h2>Розрахунковий листок</h2>
<p>ФОП ${fop?.fullName || ''} · РНОКПП ${fop?.rnokpp || ''}</p>
<p>Працівник: <b>${employee?.fullName}</b> · ${employee?.position || ''}</p>
<p>Період: <b>${record.period}</b></p>
<table>
  <tr><th colspan="2">НАРАХУВАННЯ</th></tr>
  <tr><td>Оклад</td><td align="right">${fmtMoney(record.grossSalary)} грн</td></tr>
  ${record.baseDays != null && record.baseDays < record.workingDaysInMonth?`<tr><td>Оклад за ${record.baseDays} з ${record.workingDaysInMonth} роб. днів</td><td align="right">${fmtMoney(Math.round(record.grossSalary * record.baseDays / record.workingDaysInMonth * 100) / 100)} грн</td></tr>`:''}
  ${record.unpaidDeductionAmount>0?`<tr><td>Відпустка за вл. рах. (${record.unpaidCalendarDays||record.unpaidDays} к.д. / ${record.unpaidDays} р.д.)</td><td align="right" style="color:#c0392b">− ${fmtMoney(record.unpaidDeductionAmount)} грн</td></tr>`:''}
  ${record.indexationAmount>0?`<tr><td>Індексація${record.indexationCoef ? ` (${record.indexationCoef} %)` : ''}</td><td align="right">${fmtMoney(record.indexationAmount)} грн</td></tr>`:''}
  ${record.sickPayAmount>0?`<tr><td>Лікарняний коштом роботодавця (${record.sickPayPercent}%)</td><td align="right">${fmtMoney(record.sickPayAmount)} грн</td></tr>`:''}
  ${record.sickPfuAmount>0?`<tr><td>Лікарняний коштом ПФУ (усього ${record.sickDays} дн.)</td><td align="right">${fmtMoney(record.sickPfuAmount)} грн</td></tr>`:''}
  ${record.leavePayAmount>0?`<tr><td>Відпускні (${record.leaveDays} к.д.)</td><td align="right">${fmtMoney(record.leavePayAmount)} грн</td></tr>`:''}
  ${record.compensationAmount>0?`<tr><td>Компенсація відпустки (${record.compensationDays} д.)</td><td align="right">${fmtMoney(record.compensationAmount)} грн</td></tr>`:''}
  ${record.otherAccruals>0?`<tr><td>Інші нарахування</td><td align="right">${fmtMoney(record.otherAccruals)} грн</td></tr>`:''}
  <tr class="total"><td>Всього нараховано</td><td align="right">${fmtMoney(record.totalGross)} грн</td></tr>
  <tr><th colspan="2">УТРИМАННЯ</th></tr>
  <tr><td>ПДФО 18%</td><td align="right">${fmtMoney(record.pdfo)} грн</td></tr>
  <tr><td>ВЗ 5%</td><td align="right">${fmtMoney(record.vz)} грн</td></tr>
  ${ded ? `<tr><td>Аліменти / виконавчі</td><td align="right">${fmtMoney(record.totalDeductions)} грн</td></tr>` : ''}
  <tr class="net"><td>ДО ВИПЛАТИ</td><td align="right">${fmtMoney(record.netPay)} грн</td></tr>
  <tr><th colspan="2">РОБОТОДАВЕЦЬ (додатково)</th></tr>
  <tr><td>ЄСВ ${record.hasDisability ? '8,41' : '22'}%</td><td align="right">${fmtMoney(record.esv)} грн</td></tr>
</table>
${employee?.iban?`<p style="margin-top:8px">IBAN: ${employee.iban}</p>`:''}
<p style="margin-top:12px;font-size:10px;color:#666">Дата: ${new Date().toLocaleDateString('uk-UA')}</p>
</body></html>`;

  openPrintWindow(html);
};

// ─── Головний компонент ─────────────────────────────────────────────
const PayrollView = () => {
  const {
    employees, addEmployee, updateEmployee, deleteEmployee,
    payrollRecords, addPayrollRecord, updatePayrollRecord,
    deletePayrollRecord, approveAndPayPayroll,
    leaveRecords, addLeaveRecord, deleteLeaveRecord,
  } = useData();
  const { activeFop } = useFop();

  const [tab, setTab]       = useState('employees'); // employees | payroll | leave | reports
  const [editEmp, setEditEmp]   = useState(null);    // null | 'new' | employee object
  const [calcEmp, setCalcEmp]   = useState(null);    // employee for payroll calc
  const [period, setPeriod]     = useState(() => new Date().toISOString().slice(0,7));
  const [addLeave, setAddLeave] = useState(null);    // employee for leave form

  // Авто-розрахунок накопиченої відпустки за стажем від дати прийому (ст.9 ЗУ «Про відпустки»)
  const calcLeaveBalance = (emp) => {
    if (!emp.hireDate) return { accrued: 0, used: +emp.leaveUsed||0, balance: -(+emp.leaveUsed||0) };
    const hire = new Date(emp.hireDate);
    const now  = new Date();
    const months = Math.max(0,
      (now.getFullYear() - hire.getFullYear()) * 12 +
      (now.getMonth()   - hire.getMonth())
    );
    const entitlement = +emp.leaveEntitlement || 24;
    const accrued = round2(months * (entitlement / 12));
    const used    = +emp.leaveUsed || 0;
    return { accrued, used, balance: round2(accrued - used) };
  };

  const activeEmployees = useMemo(() => employees.filter(e => e.isActive), [employees]);

  // ─── Відомість за місяць ───────────────────────────────────────
  const monthRecords = useMemo(() =>
    payrollRecords.filter(r => r.period === period),
    [payrollRecords, period]
  );
  const summary = useMemo(() => buildPayrollSummary(monthRecords), [monthRecords]);

  const handleSaveEmployee = (data) => {
    if (data.id) updateEmployee(data.id, data);
    else addEmployee(data);
    setEditEmp(null);
  };

  const handleSavePayroll = (data) => {
    const existing = payrollRecords.find(r => r.employeeId === data.employeeId && r.period === data.period);
    if (existing) updatePayrollRecord(existing.id, data);
    else addPayrollRecord(data);
    setCalcEmp(null);
  };

  const handlePayPart = (record, part) => {
    const defAmount = part === 'advance'
      ? Math.round((+record.netPay || 0) * 0.5 * 100) / 100
      : Math.round(((+record.netPay || 0) - (+record.advanceAmount || 0)) * 100) / 100;
    const d = window.prompt('Дата виплати (РРРР-ММ-ДД):', new Date().toISOString().slice(0,10));
    if (!d) return;
    const a = window.prompt(part === 'advance' ? 'Сума авансу, грн:' : 'Сума до виплати, грн:', String(defAmount));
    if (a === null) return;
    approveAndPayPayroll(record.id, d, part, +a || defAmount);
  };

  // ─── Відпустки ────────────────────────────────────────────────
  const LeaveForm = ({ emp }) => {
    const [lf, setLf] = useState({ type: 'annual', employeeId: emp.id, startDate: '', endDate: '', days: '', notes: '' });
    const set = e => setLf(p => ({ ...p, [e.target.name]: e.target.value }));
    const { accrued: leaveAccrued, used: leaveUsedAmt, balance } = calcLeaveBalance(emp);

    const save = () => {
      // Якщо днів не вказано, рахуємо їх за датами (включно)
      const byDates = (lf.startDate && lf.endDate && lf.endDate >= lf.startDate)
        ? Math.round((new Date(lf.endDate) - new Date(lf.startDate)) / 86400000) + 1 : 0;
      const days = +lf.days || byDates;
      if (!lf.startDate || !days) { alert('Вкажіть дату початку і кількість днів або дату кінця'); return; }
      addLeaveRecord({ ...lf, days });
      setAddLeave(null);
    };

    return (
      <div className="inline-form">
        <div className="inline-form-header">
          <span>Відпустка: {emp.fullName}</span>
          <button className="btn-close" onClick={() => setAddLeave(null)}>✕</button>
        </div>
        <p className="cell-muted" style={{ marginBottom: 10, fontSize: '.83rem' }}>
          Залишок щорічної відпустки: <b>{balance} дн. відпустки</b>
          {lf.type === 'unpaid' && <span style={{color:'var(--warning)'}}> · Відпустка за власний рахунок не зменшує залишок</span>}
        </p>
        <div className="form-row-4">
          <div className="field">
            <label>Тип</label>
            <select name="type" value={lf.type} onChange={set}>
              {LEAVE_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Початок</label>
            <input type="date" name="startDate" value={lf.startDate} onChange={set} />
          </div>
          <div className="field">
            <label>Кінець</label>
            <input type="date" name="endDate" value={lf.endDate} onChange={set} />
          </div>
          <div className="field">
            <label>Кількість к.д.</label>
            <input type="number" name="days" value={lf.days} onChange={set} min="1" />
          </div>
        </div>
        <div className="form-actions">
          <button className="btn btn--primary" onClick={save}>Зберегти</button>
          <button className="btn btn--ghost" onClick={() => setAddLeave(null)}>Скасувати</button>
        </div>
      </div>
    );
  };

  return (
    <div className="view-payroll">
      <div className="view-toolbar">
        <h2 className="view-title">Зарплата</h2>
      </div>

      <div className="tabs-bar" style={{ marginBottom: 16 }}>
        <button className={`tab-pill${tab==='employees'?' tab-pill--active':''}`} onClick={() => setTab('employees')}>Працівники ({activeEmployees.length})</button>
        <button className={`tab-pill${tab==='payroll'?' tab-pill--active':''}`} onClick={() => setTab('payroll')}>Нарахування</button>
        <button className={`tab-pill${tab==='leave'?' tab-pill--active':''}`} onClick={() => setTab('leave')}>Відпустки і лікарняні</button>
        <button className={`tab-pill${tab==='timesheet'?' tab-pill--active':''}`} onClick={() => setTab('timesheet')}>Табель</button>
        <button className={`tab-pill${tab==='reports'?' tab-pill--active':''}`} onClick={() => setTab('reports')}>Звітність</button>
      </div>

      {/* ─── ПРАЦІВНИКИ ─────────────────────────────────────────── */}
      {tab === 'employees' && (
        <div>
          <div style={{ display:'flex', gap:8, marginBottom:14 }}>
            <button className="btn btn--primary" onClick={() => setEditEmp('new')}>+ Новий працівник</button>
          </div>
          {(editEmp === 'new') && (
            <EmployeeForm onSave={handleSaveEmployee} onCancel={() => setEditEmp(null)} />
          )}
          {editEmp && editEmp !== 'new' && (
            <EmployeeForm initial={editEmp} onSave={handleSaveEmployee} onCancel={() => setEditEmp(null)} />
          )}
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ПІБ</th>
                  <th>Посада</th>
                  <th style={{textAlign:'right'}}>Оклад, грн</th>
                  <th>Прийнято</th>
                  <th style={{textAlign:'right'}}>Відпустка (залишок)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {activeEmployees.length === 0 ? (
                  <tr><td colSpan={6} className="table-empty">Працівників немає</td></tr>
                ) : activeEmployees.map(emp => {
                  const { accrued: leaveAccrued, used: leaveUsedAmt, balance } = calcLeaveBalance(emp);
                  return (
                    <tr key={emp.id}>
                      <td><b>{emp.fullName}</b><br/><span className="cell-muted" style={{fontSize:'.78rem'}}>{emp.rnokpp}</span></td>
                      <td>{emp.position || '—'}</td>
                      <td style={{textAlign:'right', fontWeight:600}}>{(+emp.salary||0).toLocaleString('uk-UA', {minimumFractionDigits:2})} грн</td>
                      <td>{emp.hireDate}</td>
                      <td style={{textAlign:'right'}}>
                        <span style={{color: balance < 0 ? 'var(--error)' : undefined}}>
                          {balance} дн.
                          <br/><span className="cell-muted" style={{fontSize:'.75rem'}}>накоп. {leaveAccrued}</span>
                        </span>
                      </td>
                      <td>
                        <div style={{display:'flex', gap:4}}>
                          <button className="btn btn--ghost btn--sm" onClick={() => setEditEmp(emp)}>ред.</button>
                          <button className="btn btn--ghost btn--sm" onClick={() => { setCalcEmp(emp); setTab('payroll'); }}>₴</button>
                          <button className="btn btn--ghost btn--sm" onClick={() => { setAddLeave(emp); setTab('leave'); }}>🌴</button>
                          <button className="btn-icon btn-icon--del" onClick={() => window.confirm('Видалити?') && deleteEmployee(emp.id)}>✕</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── НАРАХУВАННЯ ────────────────────────────────────────── */}
      {tab === 'employees' && <HrOrders employees={employees} />}

      {tab === 'payroll' && (
        <div>
          <div style={{display:'flex', gap:10, alignItems:'flex-end', marginBottom:14, flexWrap:'wrap'}}>
            <div className="field">
              <label>Місяць</label>
              <input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{width:160}} />
            </div>
            {monthRecords.length > 0 && (
              <button className="btn btn--ghost"
                onClick={() => openPrintWindow(buildPayrollSheetHtml({ records: monthRecords, employees, period, fop: activeFop }), { fop: activeFop })}>
                🖨 Відомість
              </button>
            )}
            {activeEmployees.map(emp => {
              const has = monthRecords.find(r => r.employeeId === emp.id);
              return (
                <button key={emp.id} className={`btn ${has?'btn--ghost':'btn--primary'}`}
                  onClick={() => setCalcEmp(emp)}>
                  {has ? `ред. ${emp.fullName.split(' ')[0]}` : `+ ${emp.fullName.split(' ')[0]}`}                </button>
              );
            })}
          </div>

          {calcEmp && (
            <PayrollCalc
              employee={calcEmp}
              period={period}
              existingRecord={monthRecords.find(r => r.employeeId === calcEmp.id)}
              onSave={handleSavePayroll}
              onCancel={() => setCalcEmp(null)}
            />
          )}

          {monthRecords.length > 0 && (
            <>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Працівник</th>
                      <th style={{textAlign:'right'}}>Брутто</th>
                      <th style={{textAlign:'right'}}>ПДФО</th>
                      <th style={{textAlign:'right'}}>ВЗ</th>
                      <th style={{textAlign:'right'}}>Утримання</th>
                      <th style={{textAlign:'right'}}>До виплати</th>
                      <th style={{textAlign:'right'}}>ЄСВ</th>
                      <th>Статус</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthRecords.map(r => {
                      const emp = employees.find(e => e.id === r.employeeId);
                      const statusInfo = PAYROLL_STATUSES.find(s => s.id === r.status);
                      return (
                        <tr key={r.id}>
                          <td>{emp?.fullName || '—'}</td>
                          <td style={{textAlign:'right'}}>{fmtMoney(r.totalGross)}</td>
                          <td style={{textAlign:'right'}}>{fmtMoney(r.pdfo)}</td>
                          <td style={{textAlign:'right'}}>{fmtMoney(r.vz)}</td>
                          <td style={{textAlign:'right'}}>{fmtMoney(r.totalDeductions)}</td>
                          <td style={{textAlign:'right', fontWeight:700, color:'var(--success)'}}>{fmtMoney(r.netPay)}</td>
                          <td style={{textAlign:'right'}}>{fmtMoney(r.esv)}</td>
                          <td><span className={`badge badge--${r.status==='paid'?'success':r.status==='advance_paid'?'warning':r.status==='approved'?'warning':'muted'}`}>{statusInfo?.label}</span></td>
                          <td>
                            <div style={{display:'flex', gap:4}}>
                              {r.status === 'draft' && (
                                <button className="btn btn--ghost btn--sm"
                                  onClick={() => updatePayrollRecord(r.id, { status: 'approved' })}>Затвердити</button>
                              )}
                              {r.status === 'approved' && (
                                <button className="btn btn--ghost btn--sm" onClick={() => handlePayPart(r, 'advance')}>Аванс</button>
                              )}
                              {(r.status === 'approved' || r.status === 'advance_paid') && (
                                <button className="btn btn--primary btn--sm" onClick={() => handlePayPart(r, 'final')}>Виплатити</button>
                              )}
                              <button className="btn btn--ghost btn--sm" onClick={() => printPayslip(r, emp, activeFop)}>🖨</button>
                              {+r.sickDays > 0 && (
                                <button className="btn btn--ghost btn--sm" title="Розрахунок лікарняних"
                                  onClick={() => openPrintWindow(buildSickCalcHtml({ record: r, employee: emp, fop: activeFop }), { fop: activeFop })}>ТН</button>
                              )}
                              <button className="btn-icon btn-icon--del" onClick={() => window.confirm('Видалити нарахування?') && deletePayrollRecord(r.id)}>✕</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{fontWeight:700}}>Разом за {period}</td>
                      <td style={{textAlign:'right', fontWeight:700}}>{fmtMoney(summary.totalGross)}</td>
                      <td style={{textAlign:'right'}}>{fmtMoney(summary.totalPdfo)}</td>
                      <td style={{textAlign:'right'}}>{fmtMoney(summary.totalVz)}</td>
                      <td style={{textAlign:'right'}}>{fmtMoney(summary.totalDeductions)}</td>
                      <td style={{textAlign:'right', fontWeight:700, color:'var(--success)'}}>{fmtMoney(summary.totalNet)}</td>
                      <td style={{textAlign:'right'}}>{fmtMoney(summary.totalEsv)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── ВІДПУСТКИ ──────────────────────────────────────────── */}
      {tab === 'leave' && (
        <div>
          <div style={{display:'flex', gap:8, marginBottom:14, flexWrap:'wrap'}}>
            {activeEmployees.map(emp => (
              <button key={emp.id} className="btn btn--ghost" onClick={() => setAddLeave(emp)}>
                🌴 {emp.fullName.split(' ')[0]}
              </button>
            ))}
          </div>
          {addLeave && <LeaveForm emp={addLeave} />}
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Працівник</th>
                  <th>Тип</th>
                  <th>Початок</th>
                  <th>Кінець</th>
                  <th style={{textAlign:'right'}}>К.д.</th>
                  <th style={{textAlign:'right'}}>Залишок (до/після)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {leaveRecords.length === 0 ? (
                  <tr><td colSpan={7} className="table-empty">Відпусток не зареєстровано</td></tr>
                ) : [...leaveRecords].sort((a,b)=>b.startDate.localeCompare(a.startDate)).map(lr => {
                  const emp = employees.find(e => e.id === lr.employeeId);
                  const { accrued: empAccrued, balance: empBalance } = emp ? calcLeaveBalance(emp) : { accrued: 0, balance: 0 };
                  return (
                    <tr key={lr.id}>
                      <td>{emp?.fullName || '—'}</td>
                      <td>{LEAVE_TYPES.find(t=>t.id===lr.type)?.label || lr.type}</td>
                      <td>{lr.startDate}</td>
                      <td>{lr.endDate || '—'}</td>
                      <td style={{textAlign:'right', fontWeight:600}}>{lr.days}</td>
                      <td style={{textAlign:'right'}}>
                        <span style={{color: empBalance < 0 ? 'var(--error)' : 'var(--success)'}}>
                          {empBalance} дн.
                        </span>
                      </td>
                      <td><button className="btn-icon btn-icon--del" onClick={() => deleteLeaveRecord(lr.id)}>✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Зведення по балансу відпустки */}
          {activeEmployees.length > 0 && (
            <div className="stats-grid" style={{marginTop:16}}>
              {activeEmployees.map(emp => {
                const { accrued: leaveAccrued, used: leaveUsedAmt, balance } = calcLeaveBalance(emp);
                return (
                  <div key={emp.id} className="stat-card">
                    <div className="stat-label">{emp.fullName.split(' ').slice(0,2).join(' ')}</div>
                    <div className="stat-value" style={{color: balance < 0 ? 'var(--error)' : 'var(--success)'}}>
                      {balance} дн. відпустки
                    </div>
                    <div className="cell-muted" style={{fontSize:'.78rem'}}>
                      Накоп.: {leaveAccrued} · Використ.: {leaveUsedAmt}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── ТАБЕЛЬ ─────────────────────────────────────────────── */}
      {tab === 'timesheet' && <Timesheet period={period} setPeriod={setPeriod} />}

      {/* ─── ЗВІТНІСТЬ ──────────────────────────────────────────── */}
      {tab === 'reports' && <PayrollReports />}
    </div>
  );
};

export default PayrollView;
