// Перевірка податкових розрахунків і термінів на опублікованих показниках 2025–2026 рр.
// Запуск: npm run test:tax
import assert from 'node:assert/strict';
import { TAX_STRATEGIES, esvFromBase } from '../src/utils/taxLogic.js';
import { taxYear, epFixedMonthly, taxYearWarning } from '../src/constants/taxYears.js';
import { incomeLimitFor, checkIncomeLimit } from '../src/utils/incomeLimits.js';
import { buildDeadlines } from '../src/utils/deadlines.js';
import { calcGeneralYear, isOwnTaxPayment } from '../src/utils/generalSystem.js';
import { calcNetFromGross, calcLeaveDaily } from '../src/utils/payrollLogic.js';
import { buildLedgerEntries, suggestCorrAccount, cashBalances } from '../src/utils/accountingLogic.js';
import { buildSettlements, partyKey, effectivePayments } from '../src/utils/settlements.js';
import { buildWarehouseMovements, calcWarehouse } from '../src/utils/warehouseLogic.js';
import { computeAutoDebts, buildKdvEntries } from '../src/utils/documentLogic.js';

const y26 = taxYear(2026);
assert.equal(y26.esvMin, 1902.34); assert.equal(y26.vzFixed, 864.70);
assert.equal(y26.epG1Max, 332.80); assert.equal(y26.epG2Max, 1729.40);
assert.equal(y26.esvMax, 38046.80);
assert.equal(taxYear(2025).epG1Max, 302.80); assert.equal(taxYear(2025).esvMin, 1760);
assert.equal(incomeLimitFor('1', 2026), 1444049); assert.equal(incomeLimitFor('2', 2026), 7211598);
assert.equal(incomeLimitFor('3_5', 2026), 10091049); assert.equal(incomeLimitFor('4', 2026), null);
assert.equal(incomeLimitFor('general', 2026), null);
assert.ok(taxYearWarning(2027)); assert.equal(taxYearWarning(2026), '');

// група 1, 12 міс 2026: 37 198,08; група 2: 53 957,28 (звірка з опублікованими таблицями)
assert.equal(TAX_STRATEGIES['1'](0, 0, { months: 12, year: 2026 }).tax, 37198.08);
assert.equal(TAX_STRATEGIES['2'](0, 0, { months: 12, year: 2026 }).tax, 53957.28);
// 2025: 34 353,60 і 49 920
assert.equal(TAX_STRATEGIES['1'](0, 0, { months: 12, year: 2025 }).tax, 34353.6);
assert.equal(TAX_STRATEGIES['2'](0, 0, { months: 12, year: 2025 }).tax, 49920);
// ставка місцевої ради 10% МЗП для групи 2
assert.equal(epFixedMonthly('2', 2026, 10), 864.70);
assert.equal(epFixedMonthly('2', 2026, ''), 1729.40);
assert.equal(epFixedMonthly('2', 2026, 50), 1729.40);
// звільнення від ЄСВ
assert.equal(TAX_STRATEGIES['2'](0, 0, { months: 12, year: 2026, esvExempt: true }).breakdown.esv, 0);
// група 3
let r = TAX_STRATEGIES['3_5'](100000, 0, { months: 3, year: 2026 });
assert.deepEqual(r.breakdown, { singleTax: 5000, vz: 1000, esv: 5707.02 });
r = TAX_STRATEGIES['3_3_vat'](100000, 0, { months: 3, year: 2026 });
assert.equal(r.breakdown.singleTax, 3000);
// група 4: ВЗ+ЄСВ за рік 33 204,48
r = TAX_STRATEGIES['4'](0, 0, { months: 12, year: 2026, ep4Annual: 1200 });
assert.equal(r.breakdown.vz + r.breakdown.esv, 33204.48); assert.equal(r.breakdown.singleTax, 1200);
// загальна
r = TAX_STRATEGIES['general'](300000, 100000, { months: 12, year: 2026 });
assert.equal(r.breakdown.pdfo, 36000); assert.equal(r.breakdown.vz, 10000);
assert.equal(r.breakdown.esv, 44000.04);
r = TAX_STRATEGIES['general'](100, 500, { months: 12, year: 2026 });
assert.equal(r.tax, 0);
assert.equal(esvFromBase(1000000, 2026), 38046.80);

// загальна система, помісячно
const tx = [
  { date: '2026-01-10', type: 'income', amount: 120000, vatAmount: 20000 },
  { date: '2026-01-15', type: 'expense', amount: 60000, vatAmount: 10000, counterparty: 'ТОВ Постач' },
  { date: '2026-02-05', type: 'expense', amount: 5000, counterparty: 'ГУ ДПС', description: 'ПДФО аванс' },
  { date: '2026-02-06', type: 'expense', amount: 1902.34, counterparty: 'ГУ ДПС', description: 'ЄСВ за себе' },
  { date: '2026-05-05', type: 'income', amount: 3000 },
  { date: '2026-11-05', type: 'income', amount: 1000000 },
  { date: '2025-11-05', type: 'income', amount: 777 },
];
assert.equal(isOwnTaxPayment(tx[2]), true); assert.equal(isOwnTaxPayment(tx[3]), false);
let g = calcGeneralYear({ transactions: tx, year: 2026, isVat: true });
assert.equal(g.months[0].net, 50000); assert.equal(g.months[0].esv, 11000);
assert.equal(g.months[1].net, -1902.34); assert.equal(g.months[1].esv, 0);
assert.equal(g.months[4].esv, 1902.34);           // 3000*22% < мін → мінімальний
assert.equal(g.months[10].esv, 38046.80);         // максимум
assert.equal(g.quarters[0].advancePdfo, Math.round(48097.66 * 0.18 * 100) / 100);
assert.equal(g.quarters[3].advancePdfo, 0);
assert.equal(g.totalIncome, 1103000);
g = calcGeneralYear({ transactions: tx, year: 2026, isVat: false, esvExempt: true });
assert.equal(g.esv, 0); assert.equal(g.months[0].net, 60000);

// зарплата: МЗП за роком періоду
assert.equal(calcNetFromGross(5000, [], true, { period: '2025-12' }).esvBase, 8000);
assert.equal(calcNetFromGross(5000, [], true, { period: '2026-03' }).esvBase, 8647);

// дедлайни
const dl = (o, d) => buildDeadlines({ ...o, today: new Date(d) });
const has = (list, date, part) => assert.ok(list.some(x => x.date === date && x.title.includes(part)), `${date} ${part}\n` + list.map(x => x.date + ' ' + x.title).join('\n'));
let L = dl({ taxGroup: '3_5' }, '2026-01-20T12:00:00');
has(L, '2026-02-09', 'Подання декларації ЄП за 2025 рік');      // 40 к.д.
has(L, '2026-02-19', 'Сплата ЄП і ВЗ');
has(L, '2026-01-19', 'ЄСВ за себе за IV кв. 2025');
L = dl({ taxGroup: '3_5' }, '2026-04-10T12:00:00');
has(L, '2026-04-20', 'ЄСВ за себе за І кв. 2026');               // 19.04 — неділя
has(L, '2026-05-11', 'Подання декларації ЄП за І кв. 2026');     // 10.05 — неділя
L = dl({ taxGroup: '2' }, '2026-02-10T12:00:00');
has(L, '2026-03-02', 'річної декларації ЄП за 2025');            // 01.03 — неділя
has(L, '2026-02-20', 'Сплата ЄП і ВЗ');
L = dl({ taxGroup: 'general_vat' }, '2026-04-10T12:00:00');
has(L, '2026-04-19', 'Аванс ПДФО і ВЗ за І кв. 2026');
has(L, '2026-04-30', 'декларації про майновий стан і доходи за 2025');
has(L, '2026-04-20', 'декларації з ПДВ за 03.2026');
has(L, '2026-04-30', 'Сплата ПДВ за 03.2026');
L = dl({ taxGroup: 'general', isVatPayer: true }, '2026-02-25T12:00:00');
has(L, '2026-03-20', 'декларації з ПДВ за 02.2026');
has(L, '2026-03-30', 'Сплата ПДВ за 02.2026');
L = dl({ taxGroup: '4' }, '2026-02-01T12:00:00');
has(L, '2026-02-20', 'декларації ЄП 4 групи');
has(L, '2026-01-30', 'Сплата ЄП 4 групи за IV кв. 2025 (30%');
L = dl({ taxGroup: '3_5', esvExempt: true }, '2026-04-10T12:00:00');
assert.ok(!L.some(x => x.title.includes('ЄСВ за себе')));
assert.equal(checkIncomeLimit(10100000, '3_5', 2026).level, 'exceeded');
// ── Розрахунки з покупцями і постачальниками (рах. 36, 63) ──
{
  assert.equal(partyKey('ТОВ "Ромашка"'), partyKey('ромашка  тов'));
  const invoices = [
    { id: 'I1', direction: 'outgoing', number: '1', date: '2026-01-05', clientName: 'ТОВ "Ромашка"', total: 1000, status: 'sent' },
    { id: 'I2', direction: 'outgoing', number: '2', date: '2026-03-01', clientName: 'ФОП Лілія', total: 1000, status: 'sent' },
  ];
  const acts = [
    { id: 'A1', invoiceId: 'I1', direction: 'outgoing', type: 'act', number: '1', date: '2026-01-10', total: 1000, clientName: '' },
    { id: 'A2', invoiceId: null, direction: 'outgoing', type: 'act', number: '2', date: '2026-02-01', total: 500, clientName: 'Ромашка ТОВ' },
    { id: 'A3', invoiceId: null, direction: 'incoming', type: 'act', number: '77', date: '2026-02-03', total: 400, clientName: 'ТОВ Постач' },
    { id: 'A4', invoiceId: null, direction: 'outgoing', type: 'act', number: '3', date: '2026-02-10', total: 1200, vatAmount: 200, clientName: 'ПП Мак' },
  ];
  const payments = [
    { id: 'P1', invoiceId: 'I1', direction: 'outgoing', date: '2026-01-15', amount: 1000 },
    { id: 'P2', invoiceId: 'I2', direction: 'outgoing', date: '2026-03-02', amount: 700 },
  ];
  const transactions = [
    { id: 'T1', date: '2026-01-15', type: 'income', amount: 1000, counterparty: 'ТОВ "Ромашка"', invoicePaymentId: 'P1' },
    { id: 'T2', date: '2026-02-05', type: 'income', amount: 200, counterparty: 'ромашка' },
    { id: 'T3', date: '2026-02-06', type: 'income', amount: 50, counterparty: 'Іванов', paymentMethod: 'cash' },
    { id: 'T4', date: '2026-03-02', type: 'income', amount: 700, counterparty: 'ФОП Лілія', invoicePaymentId: 'P2' },
    { id: 'T5', date: '2026-02-04', type: 'expense', amount: 400, counterparty: 'Постач ТОВ' },
    { id: 'T6', date: '2026-02-07', type: 'expense', amount: 90, counterparty: 'Оренда' },
  ];
  const docs = { acts, invoices, payments };
  const E = buildLedgerEntries(transactions, docs);
  const dc = (id) => { const e = E.find(x => x.id === id); return `${e.debit.code}-${e.credit.code}-${e.amount}`; };
  assert.equal(dc('act_A1_n'), '36-70-1000');
  assert.equal(dc('T1'), '31-36-1000');
  assert.equal(dc('T2'), '31-36-200');       // без прив'язки, за назвою контрагента
  assert.equal(dc('T3'), '30-70-50');        // покупець без документів — одразу дохід
  assert.equal(dc('T4'), '31-36-700');       // аванс за рахунком без акта
  assert.equal(dc('act_A3_n'), '84-63-400');
  assert.equal(dc('T5'), '63-31-400');
  assert.equal(dc('T6'), '84-31-90');
  assert.equal(dc('act_A4_n'), '36-70-1000'); assert.equal(dc('act_A4_v'), '36-64-200');
  const bal = (code) => Math.round(E.reduce((s, e) => s + (e.debit.code === code ? e.amount : 0) - (e.credit.code === code ? e.amount : 0), 0) * 100) / 100;
  assert.equal(bal('36'), 1000 + 500 + 1200 - 1000 - 200 - 700);   // 800
  assert.equal(bal('63'), 0);
  const S = buildSettlements({ ...docs, transactions });
  const rom = S.find(p => p.name.includes('Ромашка'));
  assert.equal(rom.balance, 300); assert.equal(rom.docs[0].remaining, 0); assert.equal(rom.docs[1].remaining, 300);
  const D = computeAutoDebts({ ...docs, transactions });
  const d = (part) => D.find(x => x.note.includes(part));
  assert.equal(D.length, 4, JSON.stringify(D.map(x => x.note)));
  assert.equal(d('Акт №2').amount, 300); assert.equal(d('Акт №2').type, 'debtor');
  assert.equal(d('Акт №3').amount, 1200);
  assert.equal(d('Аванс одержано').amount, 700); assert.equal(d('Аванс одержано').type, 'creditor');
  assert.equal(d('Рах. №2').amount, 300);
  assert.ok(!d('Акт №1') && !d('Акт №77'));
}
// ── Кореспондуючий рахунок операцій банку ──
{
  const acc = (t) => suggestCorrAccount({ type: 'expense', amount: 1, ...t }, {});
  assert.equal(acc({ counterparty: 'ГУК у Київ.обл/Боярська тг/18050400', description: 'єдиний податок за 3 кв' }), '64');
  assert.equal(acc({ counterparty: 'ГУ ДПС у Київській області', description: 'ЄСВ за себе 3 кв 2026' }), '65');
  assert.equal(acc({ counterparty: 'Казначейство України', description: 'військовий збір' }), '64');
  assert.equal(acc({ counterparty: 'ТОВ Постач', description: 'оплата за товар, у т.ч. ПДВ 200,00' }), '84');
  assert.equal(acc({ counterparty: 'Петренко І.', description: 'Зарплата за жовтень' }), '66');
  assert.equal(acc({ counterparty: 'Банк', description: 'сплата ЄСВ' }), '65');
  // обраний вручну рахунок сильніший за автоматичний
  const E = buildLedgerEntries([
    { id: 'X1', date: '2026-10-19', type: 'expense', amount: 500, counterparty: 'Невідомий отримувач', ledgerAccount: '64' },
    { id: 'X2', date: '2026-10-20', type: 'income', amount: 300, counterparty: 'Новий покупець', ledgerAccount: '36' },
    { id: 'X3', date: '2026-10-21', type: 'income', amount: 100, counterparty: 'Банк', ledgerAccount: '74' },
  ]);
  const dc = (id) => { const e = E.find(x => x.id === id); return `${e.debit.code}-${e.credit.code}`; };
  assert.equal(dc('X1'), '64-31'); assert.equal(dc('X2'), '31-36'); assert.equal(dc('X3'), '31-74');
  assert.equal(isOwnTaxPayment({ counterparty: 'Невідомий', ledgerAccount: '64' }), true);
  assert.equal(isOwnTaxPayment({ counterparty: 'ГУ ДПС', ledgerAccount: '84' }), false);
}
// ── Оплати рахунків з неприв'язаних надходжень ──
{
  const invoices = [
    { id: 'I1', direction: 'outgoing', number: '1', date: '2026-08-20', clientName: 'ТОВ «ГРІНТЕХ ХАРВЕСТ»', total: 220000, status: 'sent' },
    { id: 'I2', direction: 'outgoing', number: '2', date: '2026-09-15', clientName: 'ТОВ «ГРІНТЕХ ХАРВЕСТ»', total: 190000, status: 'sent' },
  ];
  const transactions = [
    { id: 'T1', date: '2026-09-01', type: 'income', amount: 220000, counterparty: 'ГРІНТЕХ ХАРВЕСТ ТОВ' },
    { id: 'T2', date: '2026-10-01', type: 'income', amount: 100000, counterparty: 'ТОВ "Грінтех Харвест"' },
  ];
  const eff = effectivePayments({ invoices, payments: [], transactions, acts: [] });
  const paid = (id) => eff.filter(p => p.invoiceId === id).reduce((s, p) => s + p.amount, 0);
  assert.equal(paid('I1'), 220000); assert.equal(paid('I2'), 100000);
}
// ── Загальна система: типова форма (наказ № 261) ──
{
  const tx = [
    { id: 'a', date: '2026-03-01', type: 'income', amount: 1200, vatAmount: 200, counterparty: 'Покупець' },
    { id: 'b', date: '2026-03-02', type: 'expense', amount: 300, counterparty: 'Оренда' },
    { id: 'c', date: '2026-03-03', type: 'expense', amount: 500, counterparty: 'ГУК у Київ.обл', description: 'ПДФО аванс' },
    { id: 'd', date: '2026-03-04', type: 'expense', amount: 1902.34, counterparty: 'ГУ ДПС', description: 'ЄСВ за себе' },
    { id: 'e', date: '2026-03-05', type: 'expense', amount: 8647, counterparty: 'Петренко', description: 'Зарплата' },
    { id: 'f', date: '2026-03-06', type: 'refund_out', amount: 100, counterparty: 'Покупець' },
    { id: 'g', date: '2026-03-07', type: 'non_income', amount: 999, counterparty: 'Власні кошти' },
  ];
  const K = buildKdvEntries({ transactions: tx, taxGroup: 'general_vat' });
  const sum = (k) => Math.round(K.reduce((s, e) => s + (+e[k] || 0), 0) * 100) / 100;
  assert.equal(sum('income'), 1000); assert.equal(sum('refund'), 100); assert.equal(sum('incomeAdj'), 900);
  assert.equal(sum('expOther'), 300); assert.equal(sum('expTaxes'), 1902.34); assert.equal(sum('expPayroll'), 8647);
  assert.equal(sum('netIncome'), Math.round((900 - 300 - 1902.34 - 8647) * 100) / 100);
  assert.equal(K.length, 5);
}
// ── Склад: середньозважена собівартість ──
{
  const list = buildWarehouseMovements({
    movements: [
      { id: 'm1', date: '2026-01-05', itemName: 'Крем', sku: 'K1', operation: 'in', kind: 'opening', qty: 10, price: 100 },
      { id: 'm2', date: '2026-02-01', itemName: 'Крем', sku: 'K1', operation: 'in', kind: 'purchase', qty: 10, price: 200 },
      { id: 'm3', date: '2026-03-01', itemName: 'крем', sku: 'k1', operation: 'out', kind: 'writeoff', qty: 5 },
    ],
    acts: [
      { id: 'A1', type: 'delivery_note', direction: 'outgoing', date: '2026-03-10', number: '7', clientName: 'Покупець',
        items: [{ name: 'Тонік', qty: 2, unit: 'шт', price: 500 }, { name: 'Доставка', qty: 1, unit: 'послуга', price: 80 }] },
      { id: 'A2', type: 'delivery_note', direction: 'incoming', date: '2026-03-05', number: '55', clientName: 'Постач',
        items: [{ name: 'Тонік', qty: 6, unit: 'шт', price: 250 }] },
      { id: 'A3', type: 'act', direction: 'outgoing', date: '2026-03-11', items: [{ name: 'Тонік', qty: 1, unit: 'шт', price: 1 }] },
    ],
  });
  const W = calcWarehouse(list, { dateStart: '2026-02-01', dateEnd: '2026-12-31' });
  const cream = W.items.find(i => i.itemName === 'Крем');
  assert.equal(cream.openQty, 10); assert.equal(cream.openValue, 1000);
  assert.equal(cream.qty, 15); assert.equal(cream.avgCost, 150); assert.equal(cream.value, 2250); assert.equal(cream.outValue, 750);
  const tonic = W.items.find(i => i.itemName === 'Тонік');
  assert.equal(tonic.qty, 4); assert.equal(tonic.value, 1000); assert.equal(tonic.saleAmount, 1000);
  assert.equal(W.items.length, 2);                     // послуга і акт на склад не потрапили
  assert.ok(W.rows.find(r => r.id === 'auto_A1_0').auto);
}
// ── Каса і відпускні ──
{
  const b = cashBalances([
    { type: 'income', amount: 100, paymentMethod: 'cash' }, { type: 'non_income', amount: 50, paymentMethod: 'cash' },
    { type: 'expense', amount: 30, paymentMethod: 'cash' }, { type: 'refund_in', amount: 10, paymentMethod: 'bank' },
  ]);
  assert.deepEqual(b, { bank: 10, cash: 120 });
  assert.equal(calcLeaveDaily([31000, 28000], ['2026-01', '2026-02']), 1000);   // 59000 / (31 + 28)
}
console.log('ALL OK');
