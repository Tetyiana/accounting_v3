// Податкові розрахунки ФОП. Показники станом на 2026 рік
// (Закон України «Про Державний бюджет України на 2026 рік» від 03.12.2025 № 4695-IX).
const MIN_WAGE    = 8647;   // Мінімальна зарплата станом на 01.01.2026
const LIVING_WAGE = 3328;   // Прожитковий мінімум для працездатних осіб станом на 01.01.2026
const ESV_RATE    = 0.22;

function round2(n) { return Math.round((+n || 0) * 100) / 100; }

// База ЄСВ: мінімум — МЗП, максимум — 20 МЗП (ст. 32 Закону № 4695-IX)
export const ESV_MIN_BASE = MIN_WAGE;
export const ESV_MAX_BASE = MIN_WAGE * 20;                      // 172 940 грн
export const ESV_AMOUNT     = round2(ESV_MIN_BASE * ESV_RATE);  // 1 902,34 грн/міс
export const ESV_MAX_AMOUNT = round2(ESV_MAX_BASE * ESV_RATE);  // 38 046,80 грн/міс

// ЄСВ «за себе» від самостійно визначеної бази за один місяць:
// не менше мінімального страхового внеску і не більше максимального.
export const esvFromBase = (base) =>
  round2(Math.min(Math.max(round2(base) * ESV_RATE, ESV_AMOUNT), ESV_MAX_AMOUNT));

const VZ_FIXED  = round2(MIN_WAGE * 0.10);    // 864,70 грн/міс — фіксований ВЗ для груп 1, 2, 4
const EP_GROUP1 = round2(LIVING_WAGE * 0.10); // 332,80 грн/міс — максимальний ЄП групи 1
const EP_GROUP2 = round2(MIN_WAGE * 0.20);    // 1 729,40 грн/міс — максимальний ЄП групи 2

// ВЗ на загальній системі — 5% чистого оподатковуваного доходу
// (пп. 1.4 п. 16-1 підрозд. 10 розд. ХХ ПКУ, з доходів починаючи з 2025 р.).
const VZ_GENERAL_RATE = 0.05;

// opts:
//   months  — кількість місяців у періоді (щомісячні платежі множаться на неї)
//   esvBase — добровільно підвищена база ЄСВ за місяць (груп 1–3); порожньо = мінімальна
const norm = (opts) => ({
  months: Math.max(1, Math.round(+(opts?.months) || 1)),
  esvBase: opts?.esvBase == null ? null : +opts.esvBase,
});

const esvPerMonth = (o) => (o.esvBase == null ? ESV_AMOUNT : esvFromBase(o.esvBase));

export const TAX_STRATEGIES = {
  '1': (_income, _expenses, opts) => {
    const o = norm(opts);
    const singleTax = round2(EP_GROUP1 * o.months);
    const vz  = round2(VZ_FIXED * o.months);
    const esv = round2(esvPerMonth(o) * o.months);
    return {
      tax: round2(singleTax + vz + esv),
      breakdown: { singleTax, vz, esv },
      note: '1 група — фіксований ЄП (до 10% прожиткового мінімуму) + ВЗ 10% МЗП (фіксований) + ЄСВ'
    };
  },
  '2': (_income, _expenses, opts) => {
    const o = norm(opts);
    const singleTax = round2(EP_GROUP2 * o.months);
    const vz  = round2(VZ_FIXED * o.months);
    const esv = round2(esvPerMonth(o) * o.months);
    return {
      tax: round2(singleTax + vz + esv),
      breakdown: { singleTax, vz, esv },
      note: '2 група — фіксований ЄП (до 20% мінімальної зарплати) + ВЗ 10% МЗП (фіксований) + ЄСВ'
    };
  },
  // Для 3 групи income передається вже без ПДВ (пп. 1 п. 292.11 ПКУ).
  '3_5': (income, _expenses, opts) => {
    const o = norm(opts);
    const singleTax = round2(income * 0.05);
    const vz  = round2(income * 0.01);
    const esv = round2(esvPerMonth(o) * o.months);
    return {
      tax: round2(singleTax + vz + esv),
      breakdown: { singleTax, vz, esv },
      note: '3 група 5% від доходу + ВЗ 1% від доходу + ЄСВ'
    };
  },
  '3_3_vat': (income, _expenses, opts) => {
    const o = norm(opts);
    const singleTax = round2(income * 0.03);
    const vz  = round2(income * 0.01);
    const esv = round2(esvPerMonth(o) * o.months);
    return {
      tax: round2(singleTax + vz + esv),
      breakdown: { singleTax, vz, esv },
      note: '3 група 3% від доходу без ПДВ (платник ПДВ) + ВЗ 1% від доходу + ЄСВ'
    };
  },
  // Загальна система: ЄСВ 22% чистого доходу за кожен місяць,
  // не менше мінімального і не більше максимального страхового внеску.
  'general': (income, expenses, opts) => {
    const o = norm(opts);
    const profit = Math.max(0, income - expenses);
    const pdfo = round2(profit * 0.18);
    const vz   = round2(profit * VZ_GENERAL_RATE);
    const esv  = round2(esvFromBase(profit / o.months) * o.months);
    return {
      tax: round2(pdfo + vz + esv),
      breakdown: { pdfo, vz, esv },
      note: 'Загальна система: ПДФО 18% + ВЗ 5% (від чистого доходу) + ЄСВ 22% від чистого доходу'
    };
  },
  'general_vat': (income, expenses, opts) => {
    const o = norm(opts);
    const profit = Math.max(0, income - expenses);
    const pdfo = round2(profit * 0.18);
    const vz   = round2(profit * VZ_GENERAL_RATE);
    const esv  = round2(esvFromBase(profit / o.months) * o.months);
    return {
      tax: round2(pdfo + vz + esv),
      breakdown: { pdfo, vz, esv },
      note: 'Загальна система + ПДВ: ПДФО 18% + ВЗ 5% (від чистого доходу) + ЄСВ 22% від чистого доходу'
    };
  }
};
