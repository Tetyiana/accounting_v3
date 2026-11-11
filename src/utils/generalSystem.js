// Загальна система оподаткування ФОП: річний розрахунок до податкової
// декларації про майновий стан і доходи (ст. 177 ПКУ).
//
//   Чистий оподатковуваний дохід = дохід − документально підтверджені витрати
//   ПДФО 18% і ВЗ 5% — від чистого доходу за рік
//   Авансові внески ПДФО і ВЗ — за підсумками І, ІІ, ІІІ кварталів,
//     до 20 квітня, 20 липня, 20 жовтня; за IV квартал аванс не сплачується
//     (пп. 177.5.1 ПКУ)
//   ЄСВ — 22% чистого доходу кожного місяця, у межах мінімального
//     і максимального внеску; за місяці без чистого доходу обов'язку немає
//     (п. 2 ч. 1 ст. 7 Закону № 2464-VI)
//   Декларація — до 1 травня наступного року; сплата — протягом 10 к.д.
//     після граничного строку подання.
//
// Це РОЗРАХУНОК показників, а не електронна форма F0100215.
import { taxYear, PDFO_RATE, VZ_GENERAL_RATE, ESV_RATE } from '../constants/taxYears';

const round2 = (n) => Math.round((+n || 0) * 100) / 100;

// Сплата власних податків (ПДФО, ВЗ, ПДВ) до бюджету — не витрати діяльності.
// ЄСВ за себе і за працівників до витрат включається (пп. 177.4.2 ПКУ),
// тому платежі на ПФУ / «ЄСВ» лишаються у витратах.
const BUDGET_RE = /дпс|казначей|податков/i;
const ESV_RE    = /єсв|єдин\S* внес|пфу|пенсійн/i;
export const isOwnTaxPayment = (t) => {
  // Рахунок обрано вручну: 64 — податки, решта — ні
  if (t.ledgerAccount) return t.ledgerAccount === '64';
  const text = `${t.counterparty || ''} ${t.description || ''}`;
  return BUDGET_RE.test(text) && !ESV_RE.test(text);
};

/**
 * @param {object[]} transactions  операції журналу (банк/каса)
 * @param {number}   year
 * @param {boolean}  isVat         платник ПДВ — суми ПДВ не входять ні в дохід, ні у витрати
 * @param {boolean}  esvExempt     звільнений від ЄСВ за себе
 */
export function calcGeneralYear({ transactions = [], year, isVat = false, esvExempt = false }) {
  const p = taxYear(year);
  const income  = Array(12).fill(0);
  const expense = Array(12).fill(0);
  const y = String(year);

  transactions.forEach((t) => {
    if (!(t.date || '').startsWith(y)) return;
    const m = +(t.date || '').slice(5, 7) - 1;
    if (m < 0 || m > 11) return;
    const amt = +t.amount || 0;
    const vat = isVat ? (+t.vatAmount || 0) : 0;
    if (t.type === 'income') income[m] += Math.max(0, amt - vat);
    else if (t.type === 'refund_out') income[m] -= amt;      // повернення покупцю зменшує дохід
    else if (t.type === 'expense' && !isOwnTaxPayment(t)) expense[m] += Math.max(0, amt - vat);
  });

  const months = income.map((inc, i) => {
    const net = round2(inc - expense[i]);
    const esv = esvExempt ? 0
      : net > 0 ? round2(Math.min(Math.max(net * ESV_RATE, p.esvMin), p.esvMax)) : 0;
    return { month: i + 1, income: round2(inc), expense: round2(expense[i]), net, esv };
  });

  const sum = (from, to, key) => round2(months.slice(from, to).reduce((s, x) => s + x[key], 0));

  // Квартали: чистий дохід кварталу → аванс (якщо результат додатний)
  const quarters = [0, 1, 2, 3].map((q) => {
    const net = sum(q * 3, q * 3 + 3, 'net');
    const base = Math.max(0, net);
    return {
      quarter: q + 1,
      income: sum(q * 3, q * 3 + 3, 'income'),
      expense: sum(q * 3, q * 3 + 3, 'expense'),
      net,
      esv: sum(q * 3, q * 3 + 3, 'esv'),
      // За IV квартал аванс не розраховується
      advancePdfo: q < 3 ? round2(base * PDFO_RATE) : 0,
      advanceVz:   q < 3 ? round2(base * VZ_GENERAL_RATE) : 0,
    };
  });

  const totalIncome  = sum(0, 12, 'income');
  const totalExpense = sum(0, 12, 'expense');
  const netIncome    = round2(totalIncome - totalExpense);
  const taxable      = Math.max(0, netIncome);
  const pdfo = round2(taxable * PDFO_RATE);
  const vz   = round2(taxable * VZ_GENERAL_RATE);
  const advancesPdfo = round2(quarters.reduce((s, q) => s + q.advancePdfo, 0));
  const advancesVz   = round2(quarters.reduce((s, q) => s + q.advanceVz, 0));

  return {
    year: +year, params: p, months, quarters,
    totalIncome, totalExpense, netIncome, taxable,
    pdfo, vz,
    esv: sum(0, 12, 'esv'),
    advancesPdfo, advancesVz,
    // До сплати (+) або переплата (−) за декларацією з урахуванням авансів
    pdfoToPay: round2(pdfo - advancesPdfo),
    vzToPay:   round2(vz - advancesVz),
  };
}
