const MIN_WAGE = 8647;    // Мінімальна зарплата станом на 01.01.2026
const LIVING_WAGE = 3328; // Прожитковий мінімум для працездатних осіб станом на 01.01.2026
const ESV_RATE = 0.22;
export const ESV_AMOUNT = round2(MIN_WAGE * ESV_RATE); // 1902.34 грн/міс

const VZ_FIXED = round2(MIN_WAGE * 0.10); // 864.70 грн/міс — фіксований ВЗ для груп 1, 2, 4
const EP_GROUP1 = round2(LIVING_WAGE * 0.10); // 332.80 грн/міс — максимальний ЄП групи 1
const EP_GROUP2 = round2(MIN_WAGE * 0.20);    // 1729.40 грн/міс — максимальний ЄП групи 2

function round2(n) { return Math.round((+n||0) * 100) / 100; }

export const TAX_STRATEGIES = {
  '1': () => ({
    tax: EP_GROUP1 + VZ_FIXED + ESV_AMOUNT,
    breakdown: { singleTax: EP_GROUP1, vz: VZ_FIXED, esv: ESV_AMOUNT },
    note: '1 група — фіксований ЄП (до 10% прожиткового мінімуму) + ВЗ 10% МЗП (фіксований) + ЄСВ'
  }),
  '2': () => ({
    tax: EP_GROUP2 + VZ_FIXED + ESV_AMOUNT,
    breakdown: { singleTax: EP_GROUP2, vz: VZ_FIXED, esv: ESV_AMOUNT },
    note: '2 група — фіксований ЄП (до 20% мінімальної зарплати) + ВЗ 10% МЗП (фіксований) + ЄСВ'
  }),
  '3_5': (income) => ({
    tax: round2(income * 0.05) + round2(income * 0.01) + ESV_AMOUNT,
    breakdown: { singleTax: round2(income * 0.05), vz: round2(income * 0.01), esv: ESV_AMOUNT },
    note: '3 група 5% від доходу + ВЗ 1% від доходу + ЄСВ'
  }),
  '3_3_vat': (income) => ({
    tax: round2(income * 0.03) + round2(income * 0.01) + ESV_AMOUNT,
    breakdown: { singleTax: round2(income * 0.03), vz: round2(income * 0.01), esv: ESV_AMOUNT },
    note: '3 група 3% від доходу (платник ПДВ) + ВЗ 1% від доходу + ЄСВ'
  }),
  'general': (income, expenses) => {
    const profit = Math.max(0, income - expenses);
    return {
      tax: round2(profit * 0.18) + round2(profit * 0.015) + ESV_AMOUNT,
      breakdown: { pdfo: round2(profit * 0.18), vz: round2(profit * 0.015), esv: ESV_AMOUNT },
      note: 'Загальна система: ПДФО 18% + ВЗ 1.5% (від прибутку) + ЄСВ'
    };
  },
  'general_vat': (income, expenses) => {
    const profit = Math.max(0, income - expenses);
    return {
      tax: round2(profit * 0.18) + round2(profit * 0.015) + ESV_AMOUNT,
      breakdown: { pdfo: round2(profit * 0.18), vz: round2(profit * 0.015), esv: ESV_AMOUNT },
      note: 'Загальна система + ПДВ: ПДФО 18% + ВЗ 1.5% (від прибутку) + ЄСВ'
    };
  }
};
