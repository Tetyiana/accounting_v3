// Індексація заробітної плати.
// Правила: Порядок № 1078 (постанова КМУ від 17.07.2003).
//  - ІСЦ множать наростаючим підсумком з місяця, наступного за базовим;
//  - право на індексацію виникає, коли добуток перевищив 103 %;
//  - індексують з 1 числа місяця, наступного за місяцем публікації індексу,
//    тобто ІСЦ за місяць М впливає на зарплату місяця М + 2;
//  - після перевищення порога відлік починається заново, коефіцієнти перемножуються;
//  - індексується частина зарплати в межах прожиткового мінімуму для працездатних.
import { CPI, INDEX_THRESHOLD, INDEX_RESET_MONTHS } from '../constants/cpi';
import { taxYear } from '../constants/taxYears';

const r2 = (n) => Math.round((+n || 0) * 100) / 100;
export const addMonths = (period, n) => {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// Базовий місяць з урахуванням обнулення: якщо базовий раніший за місяць обнулення,
// який уже настав на дату нарахування, — базовим стає місяць обнулення.
export const effectiveBaseMonth = (baseMonth, period) => {
  let base = baseMonth || '';
  for (const reset of INDEX_RESET_MONTHS) {
    if (reset <= period && (!base || base < reset)) base = reset;
  }
  return base;
};

// Коефіцієнт індексації для нарахування за period ('РРРР-ММ').
// Повертає { coefPercent, base, missing } — missing: місяці, за які ще немає ІСЦ.
export const indexationCoef = (baseMonth, period, cpi = CPI) => {
  const base = effectiveBaseMonth(baseMonth, period);
  const out = { coefPercent: 0, base, missing: [] };
  if (!base || !period || base >= period) return out;
  const last = addMonths(period, -2);          // останній ІСЦ, що впливає на period
  let product = 1;                             // добуток коефіцієнтів після перевищень порога
  let acc = 1;                                 // наростаючий підсумок від останнього перевищення
  for (let m = addMonths(base, 1); m <= last; m = addMonths(m, 1)) {
    if (cpi[m] === undefined) { out.missing.push(m); break; }
    acc *= cpi[m] / 100;
    const accPercent = Math.round(acc * 1000) / 10;   // до 0,1 %
    if (accPercent > INDEX_THRESHOLD) { product *= accPercent / 100; acc = 1; }
  }
  out.coefPercent = Math.round((product * 100 - 100) * 10) / 10;
  return out;
};

// Сума індексації за місяць.
// income — нарахована зарплата за місяць (без індексації); workShare — частка
// відпрацьованого часу (0..1), для неповного місяця сума пропорційна.
export const calcIndexation = ({ baseMonth, period, income, workShare = 1, cpi = CPI }) => {
  const c = indexationCoef(baseMonth, period, cpi);
  const living = taxYear(+String(period).slice(0, 4)).livingWage;
  const share = Math.max(0, Math.min(1, +workShare || 0));
  const indexedPart = Math.min(Math.max(+income || 0, 0), r2(living * share));
  return { ...c, livingWage: living, indexedPart, amount: r2(indexedPart * c.coefPercent / 100) };
};
