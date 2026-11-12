// Розрахункова логіка зарплати відповідно до законодавства України.
// Джерела: КЗпП, ПКУ ст.167-170, ЗУ "Про ЄСВ", ЗУ "Про відпустки".

import {
  PDFO_RATE, VZ_RATE, ESV_RATE, ESV_RATE_DISABILITY,
  MIN_WAGE, ESV_MAX_BASE, AVG_CALENDAR_DAYS,
} from '../constants/payrollTypes';
import { taxYear } from '../constants/taxYears';

// ─── Базові розрахунки ──────────────────────────────────────────────
// isFullMonth = true, якщо працівник перебував у трудових відносинах увесь місяць
// (не прийнятий і не звільнений посеред місяця). Тоді за основним місцем роботи
// при базі, меншій за МЗП, ЄСВ рахують від МЗП (ч. 5 ст. 8 Закону № 2464-VI) —
// у тому числі коли частину місяця працівник хворів, був у відпустці чи у
// відпустці без збереження. Якщо прийнятий/звільнений посеред місяця — від фактичної бази.
// opts.hasDisability — працівник з інвалідністю (підтверджена витягом/довідкою):
//   ставка ЄСВ 8,41% (ч. 13 ст. 8 ЗУ № 2464) і вимога мінімального страхового
//   внеску до нього НЕ застосовується — ЄСВ від фактично нарахованого.
//   Максимальна база (20 МЗП) при цьому діє на загальних підставах.
export const calcNetFromGross = (gross, deductions = [], isFullMonth = true, opts = {}) => {
  const hasDisability = !!opts.hasDisability;
  const esvRate = hasDisability ? ESV_RATE_DISABILITY : ESV_RATE;
  // МЗП і максимальна база — за роком періоду нарахування (opts.period = 'РРРР-ММ')
  const yp = opts.period ? taxYear(+String(opts.period).slice(0, 4)) : null;
  const minWage    = yp ? yp.minWage    : MIN_WAGE;
  const esvMaxBase = yp ? yp.esvMaxBase : ESV_MAX_BASE;
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

  // ЄСВ: від мінімалки лише якщо повний місяць і факт. брутто < мінімалки.
  // Для працівників з інвалідністю донарахування до мінімального внеску немає.
  const esvBase = (!hasDisability && isFullMonth && g > 0 && g < minWage)
    ? minWage
    : Math.min(Math.max(g, 0), esvMaxBase);
  const esv = round2(esvBase * esvRate);

  return {
    gross: g, pdfo, vz,
    hasDisability, esvRate,
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
export const calcGrossFromNet = (net, deductions = [], isFullMonth = true, opts = {}) => {
  const n = +net || 0;
  const percentDeductions = deductions
    .filter(d => d.base === 'percent')
    .reduce((s, d) => s + (+d.value || 0) / 100, 0);

  const divider = (1 - PDFO_RATE - VZ_RATE) * (1 - percentDeductions);
  if (divider <= 0) return null;
  const gross = round2(n / divider);
  return calcNetFromGross(gross, deductions, isFullMonth, opts);
};

// ─── Відпускні ──────────────────────────────────────────────────────
// Середньоденна зарплата для відпускних (Порядок, затв. постановою КМУ від 08.02.1995 № 100):
// заробіток за розрахунковий період / кількість календарних днів цього періоду.
// monthlyPayments — суми по місяцях; periods — ті самі місяці у форматі 'РРРР-ММ'
// (тоді береться фактична кількість днів кожного місяця). Без periods —
// середня кількість днів місяця (365 / 12).
// Святкові та неробочі дні з розрахунку не виключаються: у воєнний час
// норми про них не застосовуються (ч. 6 ст. 6 Закону № 2136-IX).
export const calcLeaveDaily = (monthlyPayments = [], periods = []) => {
  if (monthlyPayments.length === 0) return 0;
  const totalPaid = monthlyPayments.reduce((s, p) => s + (+p || 0), 0);
  const days = monthlyPayments.reduce((s, _p, i) => {
    const m = /^(\d{4})-(\d{2})$/.exec(periods[i] || '');
    return s + (m ? new Date(+m[1], +m[2], 0).getDate() : AVG_CALENDAR_DAYS);
  }, 0);
  return days > 0 ? round2(totalPaid / days) : 0;
};

// Відпускні = денна × к.д. відпустки
export const calcLeaveAmount = (dailyRate, days) => round2((+dailyRate || 0) * (+days || 0));

// ─── Лікарняний ─────────────────────────────────────────────────────
// Закон «Про загальнообов'язкове державне соціальне страхування» від 23.09.1999
// № 1105-XIV: перші 5 к.д. — коштом роботодавця, з 6-го дня — коштом ПФУ.
// Відсоток залежить від страхового стажу: до 3 років — 50 %, 3–5 — 60 %,
// 5–8 — 70 %, понад 8 років і пільгові категорії — 100 %.
export const SICK_STAZH_PERCENTS = [
  { id: 50,  label: 'стаж до 3 років — 50 %' },
  { id: 60,  label: 'стаж 3–5 років — 60 %' },
  { id: 70,  label: 'стаж 5–8 років — 70 %' },
  { id: 100, label: 'стаж понад 8 років або пільгова категорія — 100 %' },
];
// Середня кількість календарних днів місяця для меж лікарняних (Порядок № 1266)
export const SICK_MONTH_DAYS = 30.44;

// Середньоденна зарплата для лікарняних (Порядок, затв. постановою КМУ від 26.09.2001
// № 1266, зі змінами за постановою № 533, що діють для страхових випадків з 01.05.2026):
// заробіток за 12 календарних місяців перед місяцем настання страхового випадку,
// поділений на календарні дні цих місяців. Місяць виключається, лише якщо працівник
// не працював у ньому жодного робочого дня з поважних причин (тут — місяці без заробітку).
// history: [{ period: 'РРРР-ММ', gross }] — нарахування до місяця хвороби.
// lowStazh — страховий стаж за останні 12 місяців менший за 6 місяців:
//   середня обмежується розрахунком з МЗП.
export const calcSickDaily = ({ history = [], salary = 0, period, lowStazh = false }) => {
  const yp = taxYear(+String(period || '').slice(0, 4) || new Date().getFullYear());
  const months = history.filter(h => (+h.gross || 0) > 0).slice(0, 12);
  let daily;
  if (months.length) {
    const total = months.reduce((s, h) => s + (+h.gross || 0), 0);
    const days = months.reduce((s, h) => {
      const m = /^(\d{4})-(\d{2})$/.exec(h.period || '');
      return s + (m ? new Date(+m[1], +m[2], 0).getDate() : SICK_MONTH_DAYS);
    }, 0);
    daily = days > 0 ? total / days : 0;
  } else {
    // заробітку в розрахунковому періоді немає — з окладу
    daily = (+salary || 0) / SICK_MONTH_DAYS;
  }
  const maxDaily = yp.esvMaxBase / SICK_MONTH_DAYS;   // не більше максимальної бази ЄСВ
  const minDaily = yp.minWage / SICK_MONTH_DAYS;      // розрахунок з МЗП
  let limited = '';
  if (daily > maxDaily) { daily = maxDaily; limited = 'max'; }
  if (lowStazh && daily > minDaily) { daily = minDaily; limited = 'lowStazh'; }
  if (!lowStazh && daily < minDaily) { daily = minDaily; limited = 'min'; }
  return { daily: round2(daily), limited, months: months.length };
};

// totalDays — календарні дні хвороби в місяці; daysBefore — скільки днів цього ж
// страхового випадку вже оплачено в попередньому місяці (для перехідних лікарняних);
// pfuFromFirstDay — догляд за хворою дитиною тощо: коштом ПФУ з першого дня.
export const calcSickPay = ({ dailyRate, totalDays, payPercent, daysBefore = 0, pfuFromFirstDay = false }) => {
  const total = Math.max(0, +totalDays || 0);
  const employerLeft = pfuFromFirstDay ? 0 : Math.max(0, 5 - (+daysBefore || 0));
  const employerDays = Math.min(total, employerLeft);
  const fssDays      = total - employerDays;
  const perDay       = round2((+dailyRate || 0) * (+payPercent || 100) / 100);
  return {
    employerDays,
    fssDays,
    perDay,
    employerAmount: round2(perDay * employerDays),
    pfuAmount:      round2(perDay * fssDays),
    totalDays: total,
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
