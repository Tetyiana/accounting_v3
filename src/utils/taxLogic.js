// Податкові розрахунки ФОП. Показники року — у src/constants/taxYears.js.
import {
  taxYear, epFixedMonthly, ESV_RATE,
  VZ_G3_RATE, VZ_GENERAL_RATE, PDFO_RATE,
} from '../constants/taxYears';

function round2(n) { return Math.round((+n || 0) * 100) / 100; }

// Значення ПОТОЧНОГО року — для місць, де рік не обирається.
// У розрахунках за конкретний період передавайте opts.year.
const CUR = taxYear(new Date().getFullYear());
export const ESV_MIN_BASE   = CUR.esvMinBase;
export const ESV_MAX_BASE   = CUR.esvMaxBase;
export const ESV_AMOUNT     = CUR.esvMin;
export const ESV_MAX_AMOUNT = CUR.esvMax;

// ЄСВ «за себе» від самостійно визначеної бази за один місяць:
// не менше мінімального страхового внеску і не більше максимального.
export const esvFromBase = (base, year) => {
  const p = taxYear(year);
  return round2(Math.min(Math.max(round2(base) * ESV_RATE, p.esvMin), p.esvMax));
};

// ЄСВ ФОП на загальній системі за один місяць (п. 2 ч. 1 ст. 7 Закону № 2464-VI):
// 22% чистого доходу місяця, не менше мінімального і не більше максимального
// внеску. Якщо чистого доходу в місяці немає — обов'язку сплати немає.
export const esvGeneralMonth = (netIncome, year) =>
  (+netIncome || 0) > 0 ? esvFromBase(netIncome, year) : 0;

// opts:
//   year          — рік періоду (за ним беруться МЗП і ПМ); порожньо = поточний
//   months        — кількість місяців у періоді (щомісячні платежі множаться на неї)
//   esvBase       — добровільно підвищена база ЄСВ за місяць; порожньо = мінімальна
//   esvExempt     — звільнений від сплати ЄСВ за себе (ч. 4, 6 ст. 4 Закону № 2464-VI)
//   epRatePercent — ставка ЄП місцевої ради для груп 1, 2 (% ПМ / МЗП); порожньо = максимальна
//   ep4Annual     — річна сума ЄП групи 4 (з декларації)
const norm = (opts) => ({
  year: +(opts?.year) || new Date().getFullYear(),
  months: Math.max(0, Math.round(+(opts?.months ?? 1) || 0)),
  esvBase: opts?.esvBase == null || opts?.esvBase === '' ? null : +opts.esvBase,
  esvExempt: !!opts?.esvExempt,
  epRatePercent: opts?.epRatePercent ?? null,
  ep4Annual: +(opts?.ep4Annual) || 0,
});

const esvPerMonth = (o) => {
  if (o.esvExempt) return 0;
  return o.esvBase == null ? taxYear(o.year).esvMin : esvFromBase(o.esvBase, o.year);
};

const esvNote = (o) => (o.esvExempt ? 'ЄСВ за себе не нараховується (звільнення)' : 'ЄСВ');

const fixedGroup = (taxGroup, label) => (_income, _expenses, opts) => {
  const o = norm(opts);
  const p = taxYear(o.year);
  const singleTax = round2(epFixedMonthly(taxGroup, o.year, o.epRatePercent) * o.months);
  const vz  = round2(p.vzFixed * o.months);
  const esv = round2(esvPerMonth(o) * o.months);
  return {
    tax: round2(singleTax + vz + esv),
    breakdown: { singleTax, vz, esv },
    note: `${label} + ВЗ 10% МЗП (фіксований) + ${esvNote(o)}`,
  };
};

const group3 = (rate, label) => (income, _expenses, opts) => {
  const o = norm(opts);
  const singleTax = round2(income * rate);
  const vz  = round2(income * VZ_G3_RATE);
  const esv = round2(esvPerMonth(o) * o.months);
  return {
    tax: round2(singleTax + vz + esv),
    breakdown: { singleTax, vz, esv },
    note: `${label} + ВЗ 1% від доходу + ${esvNote(o)}`,
  };
};

// Загальна система: ПДФО 18% і ВЗ 5% чистого оподатковуваного доходу;
// ЄСВ 22% чистого доходу за кожен місяць (оцінка за середнім по періоду —
// точний помісячний розрахунок див. utils/generalSystem.js).
const general = (label) => (income, expenses, opts) => {
  const o = norm(opts);
  const profit = Math.max(0, income - expenses);
  const pdfo = round2(profit * PDFO_RATE);
  const vz   = round2(profit * VZ_GENERAL_RATE);
  const esv  = o.esvExempt || o.months === 0
    ? 0
    : round2(esvGeneralMonth(profit / o.months, o.year) * o.months);
  return {
    tax: round2(pdfo + vz + esv),
    breakdown: { pdfo, vz, esv },
    note: `${label}: ПДФО 18% + ВЗ 5% (від чистого доходу) + `
      + (o.esvExempt ? 'ЄСВ за себе не нараховується (звільнення)' : 'ЄСВ 22% від чистого доходу'),
  };
};

export const TAX_STRATEGIES = {
  '1': fixedGroup('1', '1 група — фіксований ЄП (до 10% прожиткового мінімуму)'),
  '2': fixedGroup('2', '2 група — фіксований ЄП (до 20% мінімальної зарплати)'),
  // Для 3 групи income передається вже без ПДВ (пп. 1 п. 292.11 ПКУ).
  '3_5':     group3(0.05, '3 група 5% від доходу'),
  '3_3_vat': group3(0.03, '3 група 3% від доходу без ПДВ (платник ПДВ)'),
  // 4 група (ФОП — сільгосптоваровиробник): ЄП залежить від площі та
  // нормативної грошової оцінки землі, тому береться річна сума з декларації
  // і розподіляється пропорційно місяцям періоду.
  '4': (_income, _expenses, opts) => {
    const o = norm(opts);
    const p = taxYear(o.year);
    const singleTax = round2(o.ep4Annual / 12 * o.months);
    const vz  = round2(p.vzFixed * o.months);
    const esv = round2(esvPerMonth(o) * o.months);
    return {
      tax: round2(singleTax + vz + esv),
      breakdown: { singleTax, vz, esv },
      note: `4 група — ЄП із площі земель (річна сума з декларації) + ВЗ 10% МЗП (фіксований) + ${esvNote(o)}`,
    };
  },
  'general':     general('Загальна система'),
  'general_vat': general('Загальна система + ПДВ'),
};
