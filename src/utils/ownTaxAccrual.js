// Нарахування податків ФОП «за себе» для рахунків 6411 / 6412 / 6413 / 65.
// Нараховується на останній день кожного завершеного кварталу — тим самим розрахунком,
// що й у звітах (utils/taxLogic.js): групи 1, 2, 4 — фіксовані суми за місяці кварталу,
// 3 група — відсоток доходу кварталу, загальна система — ПДФО і ВЗ з чистого доходу кварталу.
// Дохід — за касовим методом: надходження мінус повернення покупцям; для платника ПДВ — без ПДВ.
import { TAX_STRATEGIES } from './taxLogic';
import { isOwnTaxPayment } from './generalSystem';
import { isGeneralGroup } from '../constants/taxYears';

const r2 = (n) => Math.round((+n || 0) * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');

export const ownTaxAccruals = ({ transactions = [], tax = {}, today = new Date() }) => {
  const strategy = TAX_STRATEGIES[tax.taxGroup];
  const dates = transactions.map(t => String(t.date || '').slice(0, 10)).filter(Boolean).sort();
  if (!strategy || !dates.length) return [];
  const vat = tax.isVatPayer || tax.taxGroup === '3_3_vat' || tax.taxGroup === 'general_vat';
  const general = isGeneralGroup(tax.taxGroup);
  const out = [];
  let y = +dates[0].slice(0, 4), q = Math.floor((+dates[0].slice(5, 7) - 1) / 3) + 1;
  for (let guard = 0; guard < 80; guard++) {
    const end = new Date(y, q * 3, 0);
    if (end >= new Date(today.getFullYear(), today.getMonth(), today.getDate())) break;   // квартал ще не завершився
    const from = `${y}-${pad(q * 3 - 2)}-01`, to = `${y}-${pad(q * 3)}-${pad(end.getDate())}`;
    let income = 0, expense = 0;
    for (const t of transactions) {
      const d = String(t.date || '').slice(0, 10);
      if (d < from || d > to) continue;
      const net = (+t.amount || 0) - (vat ? (+t.vatAmount || 0) : 0);
      if (t.type === 'income') income += net;
      else if (t.type === 'refund_out') income -= net;
      else if (t.type === 'expense' && general && !isOwnTaxPayment(t)) expense += net;
    }
    const b = strategy(Math.max(0, r2(income)), r2(expense), {
      months: 3, year: y, epRatePercent: tax.epRatePercent, esvExempt: tax.esvExempt, ep4Annual: tax.ep4Annual,
    }).breakdown || {};
    const label = `${['І', 'ІІ', 'ІІІ', 'IV'][q - 1]} квартал ${y}`;
    const push = (key, code, amount, what) => {
      if (r2(amount) > 0) out.push({
        id: `own_${y}q${q}_${key}`, date: to, counterparty: '', description: `${what} за ${label}`,
        amount: r2(amount), debit: '84', credit: code, sourceType: 'ownTax', sourceId: `${y}q${q}`,
      });
    };
    push('ep', '6411', b.singleTax, 'Нараховано єдиний податок');
    push('pdfo', '6412', b.pdfo, 'Нараховано ПДФО за себе');
    push('vz', '6413', b.vz, 'Нараховано військовий збір за себе');
    push('esv', '65', b.esv, 'Нараховано ЄСВ за себе');
    if (q === 4) { q = 1; y++; } else q++;
  }
  return out;
};
