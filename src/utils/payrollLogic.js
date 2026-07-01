// Розрахункова логіка зарплати відповідно до законодавства України.
// Джерела: КЗпП, ПКУ ст.167-170, ЗУ "Про ЄСВ", ЗУ "Про відпустки".

import {
  PDFO_RATE, VZ_RATE, ESV_RATE,
  MIN_WAGE, ESV_MAX_BASE, AVG_CALENDAR_DAYS,
} from '../constants/payrollTypes';

// ─── Базові розрахунки ──────────────────────────────────────────────
// isFullMonth = true якщо не було відпустки за вл. рах., лікарняних тощо.
// Якщо повний місяць і нарахована < мінімалки → ЄСВ від мінімалки (ст.7 ЗУ про ЄСВ).
// Якщо неповний місяць (факт. відпрацювання) → ЄСВ від реально нарахованого.
export const calcNetFromGross = (gross, deductions = [], isFullMonth = true) => {
  const g    = +gross || 0;
  const pdfo = round2(g * PDFO_RATE);
  const vz   = round2(g * VZ_RATE);
  const netBeforeDeductions = round2(g - pdfo - vz);

  let remaining = netBeforeDeductions;
  const resolvedDeductions = deductions.map(d => {
    const amount = d.base === 'percent'
      ? round2(netBeforeDeductions * (+d.value || 0) / 100)
      : round2(+d.value || 0);
    const capped = Math.min(amount, remaining * 0.5);
    remaining = round2(remaining - capped);
    return { ...d, amount: capped };
  });

  const totalDeductions = round2(resolvedDeductions.reduce((s, d) => s + d.amount, 0));
  const netPay = round2(netBeforeDeductions - totalDeductions);

  // ЄСВ: від мінімалки лише якщо повний місяць і факт. брутто < мінімалки
  const esvBase = (isFullMonth && g > 0 && g < MIN_WAGE)
    ? MIN_WAGE
    : Math.min(Math.max(g, 0), ESV_MAX_BASE);
  const esv = round2(esvBase * ESV_RATE);

  return {
    gross: g, pdfo, vz,
    netBeforeDeductions,
    deductions: resolvedDeductions,
    totalDeductions,
    netPay,
    esv,
    esvBase,
    totalEmployerCost: round2(g + esv),
  };
};

// Нетто → Брутто (зворотній розрахунок).
// Вирішується аналітично без ітерацій за рахунок лінійності формули.
// Якщо є аліменти % — враховуємо у формулі.
export const calcGrossFromNet = (net, deductions = [], isFullMonth = true) => {
  const n = +net || 0;
  const percentDeductions = deductions
    .filter(d => d.base === 'percent')
    .reduce((s, d) => s + (+d.value || 0) / 100, 0);

  const divider = (1 - PDFO_RATE - VZ_RATE) * (1 - percentDeductions);
  if (divider <= 0) return null;
  const gross = round2(n / divider);
  return calcNetFromGross(gross, deductions, isFullMonth);
};

// ─── Відпускні ──────────────────────────────────────────────────────
// Розрахунок середньої денної зарплати для відпускних: 
// порядок, затверджений постановою КМУ №100 від 08.02.1995.
// Спрощена версія: беремо суму виплат за 12 місяців / (кількість місяців × 29.3)
export const calcLeaveDaily = (monthlyPayments = []) => {
  if (monthlyPayments.length === 0) return 0;
  const totalPaid = monthlyPayments.reduce((s, p) => s + (+p || 0), 0);
  const months    = monthlyPayments.length;
  return round2(totalPaid / (months * AVG_CALENDAR_DAYS));
};

// Відпускні = денна × к.д. відпустки
export const calcLeaveAmount = (dailyRate, days) => round2((+dailyRate || 0) * (+days || 0));

// ─── Лікарняний ─────────────────────────────────────────────────────
// Перші 5 к.д. — за рахунок роботодавця.
// ЗУ "Про загальнообов'язкове державне соціальне страхування" ст.24.
export const calcSickPay = ({ dailyRate, totalDays, payPercent }) => {
  const employerDays  = Math.min(+totalDays || 0, 5);
  const fssDays       = Math.max(0, (+totalDays || 0) - 5);
  const employerAmount = round2((+dailyRate || 0) * employerDays * (+payPercent || 100) / 100);
  return {
    employerDays,
    fssDays,
    employerAmount,
    // Суму від ФСС рахуємо але зарплата нараховується тільки від роботодавця
    totalDays: +totalDays || 0,
  };
};

// ─── Компенсація при звільненні ─────────────────────────────────────
// ст.83 КЗпП: компенсація за невикористані дні щорічної відпустки.
export const calcTerminationCompensation = ({ dailyRate, unusedDays }) => ({
  days:   +unusedDays || 0,
  amount: round2((+dailyRate || 0) * (+unusedDays || 0)),
});

// ─── Підсумок по зарплатній відомості ───────────────────────────────
export const buildPayrollSummary = (records) => {
  const init = { totalGross: 0, totalPdfo: 0, totalVz: 0, totalEsv: 0, totalNet: 0, totalDeductions: 0 };
  return records.reduce((acc, r) => ({
    totalGross:      round2(acc.totalGross      + (+r.totalGross     ||0)),
    totalPdfo:       round2(acc.totalPdfo       + (+r.pdfo           ||0)),
    totalVz:         round2(acc.totalVz         + (+r.vz             ||0)),
    totalEsv:        round2(acc.totalEsv        + (+r.esv            ||0)),
    totalNet:        round2(acc.totalNet        + (+r.netPay         ||0)),
    totalDeductions: round2(acc.totalDeductions + (+r.totalDeductions||0)),
  }), init);
};

// ─── Накопичення відпустки ───────────────────────────────────────────
// Стандарт: 24 к.д. на рік → 2 дні на місяць.
export const calcLeaveAccrualForMonth = (entitlement = 24) => round2(entitlement / 12);

// ─── Утиліти ────────────────────────────────────────────────────────
const round2 = (n) => Math.round((+n || 0) * 100) / 100;
export { round2 };

// ─── Відпустка за власний рахунок ────────────────────────────────────
// Утримання = денна тарифна ставка × кількість неоплачуваних робочих днів.
// Денна ставка: оклад / кількість робочих днів у місяці (вводить бухгалтер).
// ст.84 КЗпП: відпустка без збереження заробітної плати надається на
// прохання працівника за згодою роботодавця.
export const calcUnpaidLeaveDeduction = ({ monthlySalary, workingDaysInMonth, unpaidDays }) => {
  const salary = +monthlySalary   || 0;
  const wdim   = +workingDaysInMonth || 21;  // середнє — 21 р.д./міс.
  const ud     = +unpaidDays      || 0;
  if (ud <= 0 || salary <= 0) return { deduction: 0, dailyRate: 0 };
  const dailyRate = round2(salary / wdim);
  const deduction = round2(dailyRate * Math.min(ud, wdim)); // не більше місячного окладу
  return { deduction, dailyRate };
};

// Кількість робочих днів (пн-пт) у місяці за period 'YYYY-MM'
export const calcWorkingDaysInMonth = (period) => {
  if (!period) return 21;
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return 21;
  const daysInMonth = new Date(y, m, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(y, m - 1, d).getDay(); // 0=нд, 6=сб
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
};

// Кількість робочих днів (пн-пт) у діапазоні з N календарних днів, починаючи з startDate
export const calcWorkingDaysInRange = (startDate, calendarDays) => {
  const cd = +calendarDays || 0;
  if (!startDate || cd <= 0) return 0;
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return 0;
  let count = 0;
  for (let i = 0; i < cd; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
};
