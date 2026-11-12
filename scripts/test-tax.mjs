// Перевірка податкових розрахунків і термінів на опублікованих показниках 2025–2026 рр.
// Запуск: npm run test:tax
import assert from 'node:assert/strict';
import { TAX_STRATEGIES, esvFromBase } from '../src/utils/taxLogic.js';
import { taxYear, epFixedMonthly, taxYearWarning } from '../src/constants/taxYears.js';
import { incomeLimitFor, checkIncomeLimit } from '../src/utils/incomeLimits.js';
import { buildDeadlines } from '../src/utils/deadlines.js';
import { calcGeneralYear, isOwnTaxPayment } from '../src/utils/generalSystem.js';
import { calcNetFromGross, calcLeaveDaily, calcSickDaily, calcSickPay } from '../src/utils/payrollLogic.js';
import { indexationCoef, calcIndexation } from '../src/utils/indexation.js';
import { buildEmployeeTimesheet, avgHeadcountMonth } from '../src/utils/timesheet.js';
import { buildUnifiedPackage, calcDisabilityReport } from '../src/utils/payrollXml.js';
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
// ── Зарплата: індексація, лікарняні, табель, звітність ──
{
  // Опубліковані коефіцієнти 2026 р.: база січень — 4,2 % з червня, 7,6 % з листопада;
  // база лютий — 3,1 % і 6,5 %; березень — 4,8 %, квітень — 3,3 % з листопада
  assert.equal(indexationCoef('2026-01', '2026-05').coefPercent, 0);
  assert.equal(indexationCoef('2026-01', '2026-06').coefPercent, 4.2);
  assert.equal(indexationCoef('2026-01', '2026-10').coefPercent, 4.2);
  assert.equal(indexationCoef('2026-01', '2026-11').coefPercent, 7.6);
  assert.equal(indexationCoef('2026-02', '2026-10').coefPercent, 3.1);
  assert.equal(indexationCoef('2026-02', '2026-11').coefPercent, 6.5);
  assert.equal(indexationCoef('2026-03', '2026-11').coefPercent, 4.8);
  assert.equal(indexationCoef('2026-04', '2026-11').coefPercent, 3.3);
  assert.equal(indexationCoef('2026-05', '2026-11').coefPercent, 0);
  assert.equal(indexationCoef('2024-06', '2026-11').coefPercent, 7.6);   // стара база → січень 2026
  assert.equal(indexationCoef('', '2026-11').base, '2026-01');
  assert.equal(calcIndexation({ baseMonth: '2026-01', period: '2026-11', income: 20000 }).amount, 252.93);
  assert.equal(calcIndexation({ baseMonth: '2026-01', period: '2026-09', income: 20000 }).amount, 139.78);
  assert.equal(calcIndexation({ baseMonth: '2026-03', period: '2026-11', income: 20000 }).amount, 159.74);
  assert.equal(calcIndexation({ baseMonth: '2026-01', period: '2026-11', income: 20000, workShare: 0.5 }).amount, 126.46);
  assert.ok(indexationCoef('2026-01', '2027-03').missing.length > 0);

  // Лікарняні: 240 000 за 12 міс. (365 днів) = 657,53; стаж 4 роки — 60 % = 394,52
  const hist = ['2025-08','2025-09','2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07']
    .map(p => ({ period: p, gross: 20000 }));
  const sd = calcSickDaily({ history: hist, period: '2026-08' });
  assert.equal(sd.daily, 657.53);
  const sp = calcSickPay({ dailyRate: sd.daily, totalDays: 10, payPercent: 60 });
  assert.equal(sp.perDay, 394.52); assert.equal(sp.employerDays, 5); assert.equal(sp.fssDays, 5);
  assert.equal(sp.employerAmount, 1972.6); assert.equal(sp.pfuAmount, 1972.6);
  assert.equal(calcSickPay({ dailyRate: 100, totalDays: 4, payPercent: 100, daysBefore: 3 }).employerDays, 2);
  // обмеження з МЗП при стажі до 6 міс.: 8647 / 30,44 = 284,07
  assert.equal(calcSickDaily({ history: hist, period: '2026-08', lowStazh: true }).daily, 284.07);
  assert.equal(calcSickDaily({ history: [], salary: 30440, period: '2026-08' }).daily, 1000);
  assert.equal(calcSickDaily({ history: [{ period: '2026-07', gross: 3100 }], period: '2026-08' }).daily, 284.07); // не менше МЗП

  // Табель: вересень 2026 — 22 робочі дні; відпустка 14–27.09 (14 к.д., 10 робочих)
  const emp = { id: 'e1', fullName: 'А Б В', hireDate: '2025-01-10' };
  const t = buildEmployeeTimesheet(emp, '2026-09', [{ employeeId: 'e1', type: 'annual', startDate: '2026-09-14', days: 14 }]);
  assert.equal(t.normDays, 22); assert.equal(t.annual, 14); assert.equal(t.workDays, 12); assert.equal(t.hours, 96);
  assert.ok(t.fullMonthEmployed);
  const t2 = buildEmployeeTimesheet({ id: 'e2', hireDate: '2026-09-16' }, '2026-09', []);
  assert.equal(t2.workDays, 11); assert.ok(!t2.fullMonthEmployed);
  assert.equal(avgHeadcountMonth([emp, { id: 'e2', hireDate: '2026-09-16' }], '2026-09'), 1.5);

  // ЄСВ: у трудових відносинах увесь місяць, нараховано менше МЗП → від МЗП
  assert.equal(calcNetFromGross(5000, [], true, { period: '2026-09' }).esv, 1902.34);
  assert.equal(calcNetFromGross(5000, [], false, { period: '2026-09' }).esv, 1100);

  // Податковий розрахунок: різниця до МЗП окремим рядком, 8,41 % для особи з інвалідністю
  const fop = { fullName: 'ФОП', rnokpp: '1234567890' };
  const emps = [emp, { id: 'e3', fullName: 'Г Д Е', hireDate: '2025-01-01', hasDisability: true, gender: 'Ч' }];
  const pkg = buildUnifiedPackage({
    fop, year: 2026, quarter: 3, employees: emps,
    records: [
      { employeeId: 'e1', period: '2026-09', status: 'paid', totalGross: 7000, pdfo: 1260, vz: 350, sickPayAmount: 1500, sickPfuAmount: 900, sickDays: 8 },
      { employeeId: 'e3', period: '2026-09', status: 'approved', totalGross: 6000, pdfo: 1080, vz: 300 },
      { employeeId: 'e1', period: '2026-08', status: 'draft', totalGross: 20000 },
    ],
  });
  const m9 = pkg.months[2].calc;
  assert.equal(m9.r1, 13000); assert.equal(m9.r13, 1500); assert.equal(m9.r14, 900);
  assert.equal(m9.r21, 7000); assert.equal(m9.r22, 6000); assert.equal(m9.r23, 1647);
  assert.equal(m9.r31, 1540); assert.equal(m9.r32, 504.6); assert.equal(m9.r33, 362.34);
  assert.equal(m9.r3, 2406.94); assert.equal(m9.r321, 1320);
  assert.equal(pkg.months[1].recs.length, 0);                 // чернетка у звіт не потрапляє
  assert.equal(pkg.files.length, 3);                          // основна + ФІЗ-Д1 + ФІЗ-4ДФ за вересень
  assert.ok(pkg.files[0].xml.includes('<R01033G5>362.34</R01033G5>'));
  assert.ok(pkg.warnings.some(w => w.includes('стать')));

  // Внесок: 12 працівників, норматив 1, немає працівників з інвалідністю,
  // середня зарплата 10 000 → 40 % × 10 000 × 3 × 1 × 50 % = 6 000
  const many = Array.from({ length: 12 }, (_, i) => ({ id: 'm' + i, hireDate: '2025-01-01' }));
  const recs = many.flatMap(e => ['2026-07', '2026-08', '2026-09'].map(p => ({ employeeId: e.id, period: p, status: 'paid', totalGross: 10000 })));
  const dr = calcDisabilityReport({ employees: many, records: recs, year: 2026, quarter: 3 });
  assert.equal(dr.headcount, 12); assert.equal(dr.norm, 1); assert.equal(dr.gap, 1);
  assert.equal(dr.avgWage, 10000); assert.equal(dr.contribution, 6000); assert.ok(dr.isPayer);
  assert.equal(calcDisabilityReport({ employees: many.slice(0, 5), records: recs, year: 2026, quarter: 3 }).contribution, 0);
  assert.equal(calcDisabilityReport({ employees: many, records: recs, year: 2026, quarter: 3, overrides: { withDisability: 1 } }).contribution, 0);
}
console.log('ALL OK');
