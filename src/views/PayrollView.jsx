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
  calcSickPay, calcTerminationCompensation,
  calcUnpaidLeaveDeduction, calcWorkingDaysInMonth, calcWorkingDaysInRange,
  buildPayrollSummary, calcLeaveAccrualForMonth, round2,
} from '../utils/payrollLogic';
import { generatePayrollXml, downloadXml } from '../utils/payrollXml';
import { fmtMoney } from '../utils/documentLogic';

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
          <input type="date" name="terminationDate" value={form.terminationDate || ''} onChange={set} />
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
      <div className="form-actions">
        <button className="btn btn--primary" onClick={handleSave}>Зберегти</button>
        <button className="btn btn--ghost" onClick={onCancel}>Скасувати</button>
      </div>
    </div>
  );
};

// ─── Калькулятор нарахування ─────────────────────────────────────────
const PayrollCalc = ({ employee, period, existingRecord, onSave, onCancel }) => {
  const monthlyPayments = [];
  const dailyRate = calcLeaveDaily(
    monthlyPayments.length ? monthlyPayments : [+employee.salary || 0]
  );

  const [mode, setMode] = useState('gross');
  // Баг 6: якщо salary збережено як рядок або число — нормалізуємо
  const [grossInput, setGrossInput] = useState(
    existingRecord
      ? String(+existingRecord.grossSalary || 0)
      : String(+employee.salary || 0)
  );
  const [netInput, setNetInput] = useState('');
  const [deductions, setDeductions] = useState(existingRecord?.deductions || []);
  const [sickDays, setSickDays] = useState(String(existingRecord?.sickDays || 0));
  const [sickPercent, setSickPercent] = useState(String(existingRecord?.sickPayPercent || 100));
  const [leaveDays, setLeaveDays] = useState(String(existingRecord?.leaveDays || 0));
  const [compensationDays, setCompensationDays] = useState(String(existingRecord?.compensationDays || 0));
  const [unpaidCalendarDays, setUnpaidCalendarDays] = useState(String(existingRecord?.unpaidCalendarDays || existingRecord?.unpaidDays || 0));
  const [unpaidStartDate, setUnpaidStartDate] = useState(existingRecord?.unpaidStartDate || `${period}-01`);
  const workingDaysInMonth = calcWorkingDaysInMonth(period);
  const unpaidDays = calcWorkingDaysInRange(unpaidStartDate, +unpaidCalendarDays);
  const [otherAccruals, setOtherAccruals] = useState(String(existingRecord?.otherAccruals || 0));
  const [notes, setNotes] = useState(existingRecord?.notes || '');

  // Чи відпрацьований повний місяць (для визначення бази ЄСВ)
  const isFullMonth = +unpaidDays === 0 && +sickDays === 0 && +leaveDays === 0 && +compensationDays === 0;

  // Похідні значення — рахуємо при кожному рендері від актуальних станів
  const sickInfo   = calcSickPay({ dailyRate, totalDays: +sickDays, payPercent: +sickPercent });
  const leaveAmt   = calcLeaveAmount(dailyRate, +leaveDays);
  const compAmt    = calcTerminationCompensation({ dailyRate, unusedDays: +compensationDays }).amount;
  const unpaidInfo = calcUnpaidLeaveDeduction({
    monthlySalary:      +grossInput || 0,
    workingDaysInMonth: +workingDaysInMonth,
    unpaidDays:         +unpaidDays,
  });

  const salaryAfterUnpaid = round2((+grossInput || 0) - unpaidInfo.deduction);
  const totalGross = round2(salaryAfterUnpaid + sickInfo.employerAmount + leaveAmt + compAmt + (+otherAccruals || 0));

  const calc = useMemo(() => {
    if (mode === 'gross') return calcNetFromGross(totalGross, deductions, isFullMonth);
    const base = calcGrossFromNet(+netInput || 0, deductions, false); // неповний місяць при нетто-режимі
    return base || calcNetFromGross(0, deductions, isFullMonth);
  }, [mode, totalGross, netInput, deductions, isFullMonth]);

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
      const fullMonth = ud === 0 && sd === 0 && ld === 0 && cd === 0;

      const sick2   = calcSickPay({ dailyRate, totalDays: sd, payPercent: sp });
      const leave2  = calcLeaveAmount(dailyRate, ld);
      const comp2   = calcTerminationCompensation({ dailyRate, unusedDays: cd }).amount;
      const unpaid2 = calcUnpaidLeaveDeduction({ monthlySalary: gInput, workingDaysInMonth: wdim, unpaidDays: ud });

      const salaryNet2 = round2(gInput - unpaid2.deduction);
      const totalGross2 = round2(salaryNet2 + sick2.employerAmount + leave2 + comp2 + other);

      const finalCalc = mode === 'gross'
        ? calcNetFromGross(totalGross2, deductions, fullMonth)
        : (calcGrossFromNet(+netInput || 0, deductions, false) || calcNetFromGross(0, deductions, fullMonth));

      if (!finalCalc) { alert('Помилка розрахунку'); return; }

      onSave({
        employeeId:           employee.id,
        period,
        grossSalary:          gInput,
        sickDays:             sd,
        sickPayPercent:       sp,
        sickPayAmount:        sick2.employerAmount,
        leaveDays:            ld,
        leavePayAmount:       leave2,
        compensationDays:     cd,
        compensationAmount:   comp2,
        unpaidDays:           ud,
        unpaidCalendarDays:   +unpaidCalendarDays || 0,
        unpaidStartDate:      unpaidStartDate,
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
        {+sickDays > 0 && (
          <div className="field">
            <label>% оплати лікарняного</label>
            <input type="number" value={sickPercent} onChange={e => setSickPercent(e.target.value)} min="0" max="100" />
          </div>
        )}
        <div className="field">
          <label>Днів відпустки (щорічна)</label>
          <input type="number" value={leaveDays} onChange={e => setLeaveDays(e.target.value)} min="0" />
        </div>
        <div className="field">
          <label>Дні компенсації (звільнення)</label>
          <input type="number" value={compensationDays} onChange={e => setCompensationDays(e.target.value)} min="0" />
        </div>
        <div className="field">
          <label>Відпустка за вл. рах., дата початку</label>
          <input type="date" value={unpaidStartDate} onChange={e => setUnpaidStartDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Відпустка за вл. рах. (к.д.)</label>
          <input type="number" value={unpaidCalendarDays} onChange={e => setUnpaidCalendarDays(e.target.value)} min="0" />
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
            {unpaidInfo.deduction > 0 && (
              <div className="payroll-result-row">
                <span>ВВР ({+unpaidCalendarDays} к.д. → {+unpaidDays} роб.д. × {fmtMoney(unpaidInfo.dailyRate)} грн)</span>
                <b style={{color:'var(--error)'}}>− {fmtMoney(unpaidInfo.deduction)}</b>
              </div>
            )}
            {unpaidInfo.deduction > 0 && (
              <div className="payroll-result-row"><span>Оклад за відпрацьований час</span><b>{fmtMoney(salaryAfterUnpaid)}</b></div>
            )}
            {sickInfo.employerAmount > 0 && <div className="payroll-result-row"><span>Лікарняний ({sickInfo.employerDays} д., роботодавець)</span><b>{fmtMoney(sickInfo.employerAmount)}</b></div>}
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
            <div className="payroll-result-row"><span>ЄСВ {(ESV_RATE*100).toFixed(0)}% {!isFullMonth ? '(неповний місяць)' : calc.esvBase > totalGross ? `(від мін. зарп. ${fmtMoney(calc.esvBase)})` : ''}</span><b>{fmtMoney(calc.esv)}</b></div>
            <div className="payroll-result-row payroll-result-row--total"><span>Всього витрат роботодавця</span><b>{fmtMoney(calc.totalEmployerCost)}</b></div>
          </div>
        </div>
      </div>

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
  ${record.unpaidDeductionAmount>0?`<tr><td>Відпустка за вл. рах. (${record.unpaidCalendarDays||record.unpaidDays} к.д. / ${record.unpaidDays} р.д.)</td><td align="right" style="color:#c0392b">− ${fmtMoney(record.unpaidDeductionAmount)} грн</td></tr>`:''}
  ${record.sickPayAmount>0?`<tr><td>Лікарняний (${record.sickDays} дн., ${record.sickPayPercent}%)</td><td align="right">${fmtMoney(record.sickPayAmount)} грн</td></tr>`:''}
  ${record.leavePayAmount>0?`<tr><td>Відпускні (${record.leaveDays} к.д.)</td><td align="right">${fmtMoney(record.leavePayAmount)} грн</td></tr>`:''}
  ${record.compensationAmount>0?`<tr><td>Компенсація відпустки (${record.compensationDays} д.)</td><td align="right">${fmtMoney(record.compensationAmount)} грн</td></tr>`:''}
  ${record.otherAccruals>0?`<tr><td>Інші нарахування</td><td align="right">${fmtMoney(record.otherAccruals)} грн</td></tr>`:''}
  <tr class="total"><td>Всього нараховано</td><td align="right">${fmtMoney(record.totalGross)} грн</td></tr>
  <tr><th colspan="2">УТРИМАННЯ</th></tr>
  <tr><td>ПДФО 18%</td><td align="right">${fmtMoney(record.pdfo)} грн</td></tr>
  <tr><td>ВЗ 5%</td><td align="right">${fmtMoney(record.vz)} грн</td></tr>
  ${ded ? `<tr><td>Аліменти / виконавчі</td><td align="right">${fmtMoney(record.totalDeductions - record.pdfo - record.vz)} грн</td></tr>` : ''}
  <tr class="net"><td>ДО ВИПЛАТИ</td><td align="right">${fmtMoney(record.netPay)} грн</td></tr>
  <tr><th colspan="2">РОБОТОДАВЕЦЬ (додатково)</th></tr>
  <tr><td>ЄСВ 22%</td><td align="right">${fmtMoney(record.esv)} грн</td></tr>
</table>
${employee?.iban?`<p style="margin-top:8px">IBAN: ${employee.iban}</p>`:''}
<p style="margin-top:12px;font-size:10px;color:#666">Дата: ${new Date().toLocaleDateString('uk-UA')}</p>
</body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.print();
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
  const [xmlDocVer, setXmlDocVer] = useState(() => activeFop?.xmlDocVer || '01');

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

  const handleApprove = (record) => {
    const d = window.prompt(`Дата виплати (РРРР-ММ-ДД):`, new Date().toISOString().slice(0,10));
    if (!d) return;
    approveAndPayPayroll(record.id, d);
  };

  // ─── XML звітність ────────────────────────────────────────────
  const handleExportXml = (appendix) => {
    const records = monthRecords.filter(r => r.status === 'approved' || r.status === 'paid');
    if (!records.length) { alert('Немає затверджених нарахувань за цей місяць'); return; }
    const xml = generatePayrollXml({ records, employees, fop: activeFop, period, docVer: xmlDocVer });
    if (!xml) { alert('Помилка генерації XML'); return; }
    downloadXml(xml, `Єдина_звітність_${period}_${appendix}.xml`);
  };

  // ─── Відпустки ────────────────────────────────────────────────
  const LeaveForm = ({ emp }) => {
    const [lf, setLf] = useState({ type: 'annual', employeeId: emp.id, startDate: '', endDate: '', days: '', notes: '' });
    const set = e => setLf(p => ({ ...p, [e.target.name]: e.target.value }));
    const { accrued: leaveAccrued, used: leaveUsedAmt, balance } = calcLeaveBalance(emp);

    const save = () => {
      if (!lf.startDate || !lf.days) { alert('Вкажіть дату початку і кількість днів'); return; }
      addLeaveRecord({ ...lf, days: +lf.days });
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
        <button className={`tab-pill${tab==='leave'?' tab-pill--active':''}`} onClick={() => setTab('leave')}>Відпустки</button>
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
      {tab === 'payroll' && (
        <div>
          <div style={{display:'flex', gap:10, alignItems:'flex-end', marginBottom:14, flexWrap:'wrap'}}>
            <div className="field">
              <label>Місяць</label>
              <input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{width:160}} />
            </div>
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
                          <td><span className={`badge badge--${r.status==='paid'?'success':r.status==='approved'?'warning':'muted'}`}>{statusInfo?.label}</span></td>
                          <td>
                            <div style={{display:'flex', gap:4}}>
                              {r.status === 'draft' && (
                                <button className="btn btn--ghost btn--sm"
                                  onClick={() => updatePayrollRecord(r.id, { status: 'approved' })}>Затвердити</button>
                              )}
                              {r.status === 'approved' && (
                                <button className="btn btn--primary btn--sm" onClick={() => handleApprove(r)}>Виплатити</button>
                              )}
                              <button className="btn btn--ghost btn--sm" onClick={() => printPayslip(r, emp, activeFop)}>🖨</button>
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
                      <td style={{textAlign:'right'}}>{fmtMoney(summary.totalDeductions - summary.totalPdfo - summary.totalVz)}</td>
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

      {/* ─── ЗВІТНІСТЬ ──────────────────────────────────────────── */}
      {tab === 'reports' && (
        <div>
          <div className="filters-bar" style={{marginBottom:16}}>
            <div className="field">
              <label>Місяць звітності</label>
              <input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{width:160}} />
            </div>
          </div>

          <div className="settings-section">
            <h3>Єдина звітність з ПДФО, ВЗ та ЄСВ</h3>
            <p className="cell-muted" style={{fontSize:'.83rem', marginBottom:12}}>
              XML-файли для завантаження в Електронний кабінет платника (cabinet.tax.gov.ua).
              Версія схеми (C_DOC_VER) налаштовується у профілі ФОП → вкладка «Додатково».
              Для підпису потрібен КЕП — підписується в кабінеті після завантаження.
            </p>
            <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
              <button className="btn btn--primary" onClick={() => handleExportXml('Д1_4ДФ')}>
                ⇩ XML (Додатки 1 і 4ДФ) за {period}
              </button>
            </div>
            {monthRecords.length > 0 && (
              <div style={{marginTop:12}}>
                <div className="invoice-detail-title">До включення в звіт ({period}):</div>
                {monthRecords.map(r => {
                  const emp = employees.find(e => e.id === r.employeeId);
                  return (
                    <div key={r.id} style={{display:'flex', gap:8, alignItems:'center', marginTop:4}}>
                      <span className={`badge badge--${r.status==='paid'?'success':r.status==='approved'?'warning':'muted'}`}>
                        {PAYROLL_STATUSES.find(s=>s.id===r.status)?.label}
                      </span>
                      <span>{emp?.fullName}</span>
                      <span className="cell-muted">{fmtMoney(r.totalGross)} грн</span>
                    </div>
                  );
                })}
                {monthRecords.some(r => r.status === 'draft') && (
                  <p className="form-error" style={{marginTop:8}}>Деякі нарахування ще в статусі "Чернетка" і не будуть включені в XML. Затвердіть їх.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PayrollView;
