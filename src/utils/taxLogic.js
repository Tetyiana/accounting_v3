const MIN_WAGE = 8000; // Актуальне значення станом на 2026
const ESV_RATE = 0.22;
export const ESV_AMOUNT = MIN_WAGE * ESV_RATE;

export const TAX_STRATEGIES = {
  '1': () => ({
    tax: ESV_AMOUNT,
    breakdown: { singleTax: 0, esv: ESV_AMOUNT },
    note: '1 група — фіксований єдиний податок + ЄСВ'
  }),
  '2': () => ({
    tax: ESV_AMOUNT,
    breakdown: { singleTax: 0, esv: ESV_AMOUNT },
    note: '2 група — фіксований єдиний податок + ЄСВ'
  }),
  '3_5': (income) => ({
    tax: (income * 0.05) + ESV_AMOUNT,
    breakdown: { singleTax: income * 0.05, esv: ESV_AMOUNT },
    note: '3 група 5% від доходу + ЄСВ'
  }),
  '3_3_vat': (income) => ({
    tax: (income * 0.03) + ESV_AMOUNT,
    breakdown: { singleTax: income * 0.03, esv: ESV_AMOUNT },
    note: '3 група 3% від доходу + ЄСВ (платник ПДВ)'
  }),
  'general': (income, expenses) => {
    const profit = Math.max(0, income - expenses);
    return {
      tax: (profit * 0.18) + (profit * 0.015) + ESV_AMOUNT,
      breakdown: { pdfo: profit * 0.18, vz: profit * 0.015, esv: ESV_AMOUNT },
      note: 'Загальна система: ПДФО 18% + ВЗ 1.5% + ЄСВ'
    };
  },
  'general_vat': (income, expenses) => {
    const profit = Math.max(0, income - expenses);
    return {
      tax: (profit * 0.18) + (profit * 0.015) + ESV_AMOUNT,
      breakdown: { pdfo: profit * 0.18, vz: profit * 0.015, esv: ESV_AMOUNT },
      note: 'Загальна система + ПДВ: ПДФО 18% + ВЗ 1.5% + ЄСВ'
    };
  }
};
