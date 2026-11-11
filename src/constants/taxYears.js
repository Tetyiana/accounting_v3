// Показники, від яких залежать податки ФОП, — по роках.
// Усі розрахунки беруть значення за РОКОМ ЗВІТНОГО ПЕРІОДУ, а не «поточні»:
// декларація за 2025 рік у 2026-му рахується за показниками 2025-го.
//
// Джерела:
//   2025 — Закон «Про Державний бюджет України на 2025 рік» від 19.11.2024 № 4059-IX
//   2026 — Закон «Про Державний бюджет України на 2026 рік» від 03.12.2025 № 4695-IX
//   2027 — ПРОЄКТ № 16000, ухвалений у першому читанні 28.10.2026.
//          Позначений draft: true — після підписання закону звірити цифри
//          і прибрати позначку.
//
// minWage    — мінімальна зарплата на 1 січня (МЗП)
// livingWage — прожитковий мінімум для працездатних осіб на 1 січня (ПМ)

export const TAX_YEARS = {
  2025: { minWage: 8000, livingWage: 3028, law: 'Закон від 19.11.2024 № 4059-IX' },
  2026: { minWage: 8647, livingWage: 3328, law: 'Закон від 03.12.2025 № 4695-IX' },
  2027: { minWage: 9546, livingWage: 3691, law: 'проєкт Закону № 16000 (перше читання 28.10.2026)', draft: true },
};

const YEARS = Object.keys(TAX_YEARS).map(Number).sort((a, b) => a - b);
const FIRST_YEAR = YEARS[0];
const LAST_YEAR  = YEARS[YEARS.length - 1];

const round2 = (n) => Math.round((+n || 0) * 100) / 100;

export const ESV_RATE = 0.22;
export const ESV_MAX_MULTIPLIER = 20;       // максимальна база ЄСВ — 20 МЗП
export const VZ_FIXED_RATE   = 0.10;        // ВЗ груп 1, 2, 4 — 10% МЗП на місяць
export const VZ_G3_RATE      = 0.01;        // ВЗ групи 3 — 1% доходу
export const VZ_GENERAL_RATE = 0.05;        // ВЗ на загальній системі — 5% чистого доходу
export const PDFO_RATE       = 0.18;
export const EP_G1_MAX_PERCENT = 10;        // ЄП групи 1 — до 10% ПМ
export const EP_G2_MAX_PERCENT = 20;        // ЄП групи 2 — до 20% МЗП
export const EP_EXCESS_RATE  = 0.15;        // ЄП з перевищення ліміту доходу
export const LIMIT_MULTIPLIER = { '1': 167, '2': 834, '3_5': 1167, '3_3_vat': 1167 };

// Показники року. Якщо року немає в таблиці — найближчий відомий,
// з позначкою fallback (інтерфейс показує попередження).
export const taxYear = (year) => {
  const y = +year || new Date().getFullYear();
  const key = y < FIRST_YEAR ? FIRST_YEAR : y > LAST_YEAR ? LAST_YEAR : y;
  const p = TAX_YEARS[key];
  const esvMaxBase = p.minWage * ESV_MAX_MULTIPLIER;
  return {
    year: y,
    minWage: p.minWage,
    livingWage: p.livingWage,
    law: p.law,
    draft: !!p.draft,
    fallback: key !== y,
    esvMinBase: p.minWage,
    esvMaxBase,
    esvMin: round2(p.minWage * ESV_RATE),
    esvMax: round2(esvMaxBase * ESV_RATE),
    vzFixed: round2(p.minWage * VZ_FIXED_RATE),
    epG1Max: round2(p.livingWage * EP_G1_MAX_PERCENT / 100),
    epG2Max: round2(p.minWage * EP_G2_MAX_PERCENT / 100),
  };
};

// Текст попередження, якщо показники року неостаточні. '' — усе гаразд.
export const taxYearWarning = (year) => {
  const p = taxYear(year);
  if (p.fallback) return `Показників на ${p.year} рік у програмі немає — розрахунок зроблено за найближчим відомим роком. Оновіть src/constants/taxYears.js.`;
  if (p.draft) return `Показники на ${p.year} рік (МЗП ${p.minWage} грн, ПМ ${p.livingWage} грн) узято з ${p.law}. Закон ще не ухвалено остаточно — суми можуть змінитися.`;
  return '';
};

// Місячний ЄП груп 1 і 2 за ставкою місцевої ради (у % від ПМ / МЗП).
// percent порожній → максимальна ставка.
export const epFixedMonthly = (taxGroup, year, percent) => {
  const p = taxYear(year);
  const has = percent !== null && percent !== undefined && percent !== '' && !Number.isNaN(+percent);
  if (taxGroup === '1') {
    const pc = has ? Math.min(Math.max(+percent, 0), EP_G1_MAX_PERCENT) : EP_G1_MAX_PERCENT;
    return round2(p.livingWage * pc / 100);
  }
  if (taxGroup === '2') {
    const pc = has ? Math.min(Math.max(+percent, 0), EP_G2_MAX_PERCENT) : EP_G2_MAX_PERCENT;
    return round2(p.minWage * pc / 100);
  }
  return 0;
};

export const isUnifiedGroup = (g) => ['1', '2', '3_5', '3_3_vat', '4'].includes(g);
export const isGeneralGroup = (g) => g === 'general' || g === 'general_vat';
// Платник ПДВ: або група з ПДВ, або окремий прапорець у профілі
export const isVatGroup = (g, isVatPayerFlag = false) =>
  g === '3_3_vat' || g === 'general_vat' || !!isVatPayerFlag;
