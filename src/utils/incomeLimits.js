// Граничний обсяг доходу платника єдиного податку (п. 291.4 ПКУ).
// Ліміти визначені в розмірах МЗП, встановленої на 1 січня звітного року,
// і протягом року не змінюються.
//   1 група — 167 МЗП, 2 група — 834 МЗП, 3 група — 1167 МЗП.
// МЗП на 01.01.2026 — 8647 грн (Закон від 03.12.2025 № 4695-IX).
//
// Наслідки перевищення (п. 293.4, пп. 298.2.3 ПКУ):
//   – до суми перевищення застосовується ставка 15%;
//   – платник зобов'язаний перейти на іншу групу або на загальну систему
//     з першого числа місяця, наступного за кварталом перевищення.

const MIN_WAGE_BY_YEAR = {
  2025: 8000,
  2026: 8647,
};
const LATEST_YEAR = 2026;

const MULTIPLIER = { '1': 167, '2': 834, '3_5': 1167, '3_3_vat': 1167 };

export const EXCESS_RATE = 0.15;

export const minWageFor = (year) => MIN_WAGE_BY_YEAR[+year] || MIN_WAGE_BY_YEAR[LATEST_YEAR];

// Ліміт для групи на рік. null — група без ліміту доходу (загальна система).
export const incomeLimitFor = (taxGroup, year) => {
  const mult = MULTIPLIER[taxGroup];
  if (!mult) return null;
  return Math.round(mult * minWageFor(year) * 100) / 100;
};

// Перевірка річного доходу наростаючим підсумком.
// level: 'ok' | 'warning' (≥ 80%) | 'critical' (≥ 95%) | 'exceeded'
export const checkIncomeLimit = (income, taxGroup, year) => {
  const limit = incomeLimitFor(taxGroup, year);
  if (limit == null) return { limit: null, level: 'none' };

  const used    = Math.max(0, +income || 0);
  const percent = limit > 0 ? Math.round((used / limit) * 1000) / 10 : 0;
  const excess  = Math.max(0, Math.round((used - limit) * 100) / 100);
  const left    = Math.max(0, Math.round((limit - used) * 100) / 100);

  const level = excess > 0 ? 'exceeded'
    : percent >= 95 ? 'critical'
    : percent >= 80 ? 'warning'
    : 'ok';

  return {
    limit, used, percent, excess, left, level,
    // ЄП за ставкою 15% на суму перевищення
    excessTax: Math.round(excess * EXCESS_RATE * 100) / 100,
    multiplier: MULTIPLIER[taxGroup],
    minWage: minWageFor(year),
    message:
      level === 'exceeded'
        ? `Перевищено граничний обсяг доходу на ${excess.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} грн. `
          + 'До суми перевищення — ставка 15% (п. 293.4 ПКУ). Потрібен перехід на іншу групу '
          + 'або на загальну систему з 1 числа місяця, наступного за кварталом перевищення.'
      : level === 'critical'
        ? `Використано ${percent}% річного ліміту. Залишок — ${left.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} грн.`
      : level === 'warning'
        ? `Використано ${percent}% річного ліміту. Залишок — ${left.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} грн.`
      : '',
  };
};
