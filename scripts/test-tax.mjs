// Перевірка податкових розрахунків і термінів на опублікованих показниках 2025–2026 рр.
// Запуск: npm run test:tax
import assert from 'node:assert/strict';
import { TAX_STRATEGIES, esvFromBase } from '../src/utils/taxLogic.js';
import { taxYear, epFixedMonthly, taxYearWarning } from '../src/constants/taxYears.js';
import { incomeLimitFor, checkIncomeLimit } from '../src/utils/incomeLimits.js';
import { buildDeadlines } from '../src/utils/deadlines.js';
import { calcGeneralYear, isOwnTaxPayment } from '../src/utils/generalSystem.js';
import { calcNetFromGross, calcLeaveDaily, calcSickDaily, calcSickPay } from '../src/utils/payrollLogic.js';
import { indexationCoef, calcIndexation, onSalaryRaise } from '../src/utils/indexation.js';
import { buildEmployeeTimesheet, avgHeadcountMonth } from '../src/utils/timesheet.js';
import { buildLedgerEntries as BLE, corrAccountOf as CAO, taxSubaccount, accountMatches } from '../src/utils/accountingLogic.js';
import { isOwnTaxPayment as IOTP } from '../src/utils/generalSystem.js';
import * as V from '../src/utils/vatLogic.js';
import { calcExciseD5 } from '../src/utils/exciseXml.js';
import { ownTaxAccruals } from '../src/utils/ownTaxAccrual.js';
import { buildUnifiedPackage, calcDisabilityReport } from '../src/utils/payrollXml.js';
import { buildDeclaration } from '../src/utils/dpsDeclaration.js';
import { buildEpDeclPackage, parseKveds } from '../src/utils/epDeclXml.js';
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
  assert.equal(dc('act_A4_n'), '36-70-1000'); assert.equal(dc('act_A4_v'), '36-6414-200');
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
  assert.equal(acc({ counterparty: 'ГУК у Київ.обл/Боярська тг/18050400', description: 'єдиний податок за 3 кв' }), '6411');
  assert.equal(acc({ counterparty: 'ГУ ДПС у Київській області', description: 'ЄСВ за себе 3 кв 2026' }), '65');
  assert.equal(acc({ counterparty: 'Казначейство України', description: 'військовий збір' }), '6413');
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
  assert.equal(dc('X1'), '6419-31'); assert.equal(dc('X2'), '31-36'); assert.equal(dc('X3'), '31-74');
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
  // Грудень 2026 (після ІСЦ за жовтень 101,8): опубліковані суми для баз травень–серпень
  assert.equal(calcIndexation({ baseMonth: '2026-02', period: '2026-11', income: 9000 }).amount, 216.32);
  assert.equal(calcIndexation({ baseMonth: '2026-04', period: '2026-11', income: 9000 }).amount, 109.82);
  assert.equal(calcIndexation({ baseMonth: '2026-05', period: '2026-12', income: 9000 }).amount, 139.78);
  assert.equal(calcIndexation({ baseMonth: '2026-06', period: '2026-12', income: 9000 }).amount, 146.43);
  assert.equal(calcIndexation({ baseMonth: '2026-07', period: '2026-12', income: 9000 }).amount, 133.12);
  assert.equal(calcIndexation({ baseMonth: '2026-08', period: '2026-12', income: 9000 }).amount, 129.79);
  assert.equal(calcIndexation({ baseMonth: '2026-08', period: '2026-11', income: 9000 }).amount, 0);
  assert.equal(calcIndexation({ baseMonth: '2026-01', period: '2026-12', income: 9000 }).amount, 252.93);
  // Підвищення окладу в листопаді (індексація 252,93): на 100 грн → фіксована 152,93; на 1000 грн → 0
  const up1 = onSalaryRaise({ baseMonth: '2026-01', month: '2026-11', oldSalary: 9000, newSalary: 9100 });
  assert.equal(up1.indexBaseMonth, '2026-11'); assert.equal(up1.indexFixed, 152.93);
  assert.equal(onSalaryRaise({ baseMonth: '2026-01', month: '2026-11', oldSalary: 9000, newSalary: 10000 }).indexFixed, 0);
  assert.equal(onSalaryRaise({ baseMonth: '2026-01', month: '2026-11', oldSalary: 9000, newSalary: 9000 }), null);

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
// ── ПДВ: перша подія, строки реєстрації, період декларації, РК ──
{
  const item = (qty, price, vatRate = '20') => ({ name: 'Послуга', unit: 'послуга', qty, price, vatRate });
  const inv = { id: 'i1', number: 'РАХ-1', direction: 'outgoing', clientName: 'ТОВ А', clientIpn: '12345678', items: [item(10, 1000)] }; // 12 000 з ПДВ
  const pay = (date, amount) => ({ invoiceId: 'i1', date, amount });
  const act = (id, date, qty) => ({ id, invoiceId: 'i1', date, items: [item(qty, 1000)] });

  // 1) Передоплата 50 % → ПН на 6000; потім акт на все → ПН на решту 6000
  let ev = V.firstEvents({ invoice: inv, payments: [pay('2026-10-05', 6000)], acts: [], vatInvoices: [] }).pending;
  assert.equal(ev.length, 1); assert.equal(ev[0].kind, 'prepayment'); assert.equal(ev[0].amount, 6000);
  const pn1 = { id: 'v1', ...V.draftPnForEvent(ev[0], [], { isVatPayer: true }) };
  assert.equal(pn1.number, '1'); assert.equal(V.vatTotals(pn1).base, 5000); assert.equal(V.vatTotals(pn1).vat, 1000);
  assert.equal(pn1.items[0].qty, 5);
  ev = V.firstEvents({ invoice: inv, payments: [pay('2026-10-05', 6000)], acts: [act('a1', '2026-10-20', 10)], vatInvoices: [pn1] }).pending;
  assert.equal(ev.length, 1); assert.equal(ev[0].kind, 'act'); assert.equal(ev[0].amount, 6000);
  const pn2 = { id: 'v2', ...V.draftPnForEvent(ev[0], [pn1], { isVatPayer: true }) };
  assert.equal(pn2.number, '2'); assert.equal(V.vatTotals(pn2).total, 6000); assert.equal(pn2.sourceActId, 'a1');
  // 2) Після обох ПН подій не лишається; доплата після акта нової ПН не дає
  assert.equal(V.firstEvents({ invoice: inv, payments: [pay('2026-10-05', 6000), pay('2026-11-02', 6000)], acts: [act('a1', '2026-10-20', 10)], vatInvoices: [pn1, pn2] }).pending.length, 0);
  // 3) Акт раніше за оплату → одна ПН на акт; оплата в той самий день іде першою
  ev = V.firstEvents({ invoice: inv, payments: [pay('2026-10-25', 12000)], acts: [act('a1', '2026-10-20', 10)], vatInvoices: [] }).pending;
  assert.equal(ev.length, 1); assert.equal(ev[0].kind, 'act'); assert.equal(ev[0].amount, 12000);
  ev = V.firstEvents({ invoice: inv, payments: [pay('2026-10-20', 12000)], acts: [act('a1', '2026-10-20', 10)], vatInvoices: [] }).pending;
  assert.equal(ev[0].kind, 'prepayment');
  // 4) Неплатник → тип причини 02, умовний ІПН; рахунок без ПДВ подій не дає
  const np = V.draftPnForEvent(ev[0], [], { isVatPayer: false });
  assert.equal(np.reasonType, '02'); assert.equal(np.buyerIpn, '100000000000'); assert.equal(np.counterparty, 'Неплатник');
  assert.equal(V.pendingPnEvents({ invoices: [{ ...inv, items: [item(1, 100, 'no_vat')] }], payments: [pay('2026-10-01', 100)] }).length, 0);

  // Строки реєстрації: 1–15 → 5 число, 16–кінець → 18 число, зведена 198.5 → 20 число
  assert.equal(V.registrationDeadline({ date: '2026-10-15', kind: 'pn' }).date, '2026-11-05');
  assert.equal(V.registrationDeadline({ date: '2026-10-16', kind: 'pn' }).date, '2026-11-18');
  assert.equal(V.registrationDeadline({ date: '2026-12-31', kind: 'pn' }).date, '2027-01-18');
  assert.equal(V.registrationDeadline({ date: '2026-10-31', kind: 'pn', spec: 'self198' }).date, '2026-11-20');
  const rkDown = { date: '2026-10-10', kind: 'rk', direction: 'outgoing', amount: -1000, rate: 20 };
  assert.equal(V.registrationDeadline(rkDown).by, 'buyer'); assert.equal(V.registrationDeadline(rkDown).date, '2026-10-27');
  assert.equal(V.rkRegistrar(rkDown), 'buyer'); assert.equal(V.rkRegistrar({ ...rkDown, amount: 1000 }), 'seller');
  assert.equal(V.rkRegistrar({ ...rkDown, spec: 'nonpayer' }), 'seller');

  // Період декларації
  const out = (o) => ({ direction: 'outgoing', kind: 'pn', rate: 20, ...o });
  const inc = (o) => ({ direction: 'incoming', kind: 'pn', rate: 20, ...o });
  const docs = [
    out({ date: '2026-10-05', amount: 10000 }),                                             // зобов'язання 2000 незалежно від реєстрації
    out({ date: '2026-10-07', amount: 1000, rate: 7 }),
    out({ date: '2026-10-31', amount: 500, spec: 'self198' }),                              // рядок 4.1
    out({ date: '2026-10-20', kind: 'rk', amount: -1000 }),                                 // зменшення без реєстрації — не враховано
    out({ date: '2026-10-21', kind: 'rk', amount: 300 }),                                   // збільшення — за датою
    inc({ date: '2026-10-10', amount: 4000, registered: true, registrationDate: '2026-10-30' }),
    inc({ date: '2026-10-12', amount: 2000 }),                                              // не зареєстрована — кредиту немає
    inc({ date: '2026-09-20', amount: 1000, registered: true, registrationDate: '2026-10-25' }), // запізнилась (строк 18.10) → жовтень
    inc({ date: '2026-10-28', amount: 500, registered: true, registrationDate: '2026-11-10' }),  // вчасно (строк 18.11) → жовтень
    inc({ date: '2026-10-15', kind: 'rk', amount: -200 }),                                  // зменшення кредиту — одразу
  ];
  const oct = V.calcVatMonth(docs, '2026-10');
  assert.equal(oct.oblig[20].vat, 2000); assert.equal(oct.oblig[7].vat, 70); assert.equal(oct.self[20].vat, 100);
  assert.equal(oct.obligAdjust.vat, 60); assert.equal(oct.obligVat, 2230);
  assert.equal(oct.credit[20].vat, 1100); assert.equal(oct.creditAdjust.vat, -40); assert.equal(oct.creditVat, 1060);
  assert.equal(oct.toPay, 1170); assert.equal(oct.pending.length, 2);
  assert.equal(V.calcVatMonth(docs, '2026-09').credit[20].vat, 0);
  // РК на зменшення, зареєстрована вчасно → період складання
  const reg = docs.map(d => d.kind === 'rk' && d.amount === -1000 ? { ...d, registered: true, registrationDate: '2026-10-26' } : d);
  assert.equal(V.calcVatMonth(reg, '2026-10').obligAdjust.vat, -140);
  // Від'ємне значення переходить у кредит наступного місяця
  const chain = [inc({ date: '2026-08-10', amount: 5000, registered: true, registrationDate: '2026-08-20' }), out({ date: '2026-09-10', amount: 2000 }), out({ date: '2026-10-10', amount: 1000 })];
  assert.equal(V.calcVatChain(chain, '2026-08').negative, 1000);
  assert.equal(V.calcVatChain(chain, '2026-09').negative, 600); assert.equal(V.calcVatChain(chain, '2026-09').carryIn, 1000);
  assert.equal(V.calcVatChain(chain, '2026-10').negative, 400); assert.equal(V.calcVatChain(chain, '2026-11').carryIn, 400);

  // РК: повернення 2 з 5 шт по 1000 → −2000 бази; зміна ціни −100 на 5 шт → −500
  const pn = { id: 'p', number: '7', date: '2026-10-05', direction: 'outgoing', rate: 20, counterparty: 'ТОВ А', items: [{ name: 'Товар', qty: 5, price: 1000, base: 5000, rate: 20 }] };
  const rk1 = V.draftRk(pn, V.buildRkItems(pn, [{ lineNo: 1, qtyDelta: -2 }], '103'), [pn], '2026-10-20');
  assert.equal(rk1.amount, -2000); assert.equal(V.vatTotals(rk1).vat, -400); assert.equal(rk1.number, '8'); assert.equal(rk1.correctedNumber, '7');
  assert.equal(V.buildRkItems(pn, [{ lineNo: 1, priceDelta: -100 }], '101')[0].base, -500);

  // Роздріб: виручка 12 600, з них підакцизна 2 100 → акциз 100; ПДВ-база (12 600 − 100) / 1,2
  assert.equal(V.retailExcise(2100), 100);
  const tx = [{ type: 'income', paymentMethod: 'cash', amount: 12600, exciseBase: 2100, date: '2026-10-03', description: 'Фіскальний чек ПРРО №1' },
              { type: 'income', paymentMethod: 'bank', amount: 999, date: '2026-10-03', description: 'оплата' }];
  const days = V.pendingRetailDays({ transactions: tx, vatInvoices: [] });
  assert.equal(days.length, 1); assert.equal(days[0].taxable, 12500); assert.equal(days[0].base, 10416.67);
  const dpn = V.draftRetailPn(days[0], []);
  assert.equal(dpn.reasonType, '11'); assert.equal(V.vatTotals(dpn).vat, 2083.33);
  assert.equal(V.pendingRetailDays({ transactions: tx, vatInvoices: [dpn] }).length, 0);
}
// ── Рахунок 64: субрахунки за видами податків ──
{
  const tx = (o) => ({ type: 'expense', paymentMethod: 'bank', date: '2026-11-10', amount: 100, ...o });
  const code = (o) => CAO(tx(o), null);
  assert.equal(code({ counterparty: 'ГУК у Київській обл.', description: 'Єдиний податок за 3 кв. 2026' }), '6411');
  assert.equal(code({ counterparty: 'ГУК у Київській обл.', description: 'ПДФО із заробітної плати за жовтень' }), '6412');
  assert.equal(code({ counterparty: 'Казначейство', description: 'Військовий збір із зарплати' }), '6413');
  assert.equal(code({ counterparty: 'ДПС', description: 'ПДВ за жовтень 2026' }), '6414');
  assert.equal(code({ counterparty: 'ГУК', description: 'Акцизний податок з роздрібної торгівлі' }), '6415');
  assert.equal(code({ counterparty: 'ГУК', description: 'Плата за ліцензію на роздрібну торгівлю алкоголем' }), '642');
  assert.equal(code({ counterparty: 'ГУК у Київській обл.', description: 'Єдиний внесок за працівників' }), '65');
  assert.equal(code({ counterparty: 'ТОВ Ромашка', description: 'ПДФО із зарплати' }), '6412');     // не 66
  assert.equal(code({ counterparty: 'Іваненко', description: 'Зарплата за жовтень' }), '66');
  assert.equal(code({ counterparty: 'ТОВ Постач', description: 'Оплата за товар, у т.ч. ПДВ 200,00' }), '84');
  assert.equal(code({ counterparty: 'ГУК', description: 'податок', ledgerAccount: '64' }), '6419');   // старе «64» без субрахунка
  assert.equal(code({ counterparty: 'ГУК', description: 'ПДВ', ledgerAccount: '64' }), '6414');
  assert.equal(code({ counterparty: 'будь-хто', description: 'будь-що', ledgerAccount: '6413' }), '6413');
  assert.equal(taxSubaccount('послуги без ПДВ'), '6419');
  assert.ok(accountMatches('6414', '64')); assert.ok(accountMatches('643', '64')); assert.ok(!accountMatches('65', '64')); assert.ok(!accountMatches('6414', '6412'));
  // загальна система: ліцензія — витрата, податки — ні
  assert.ok(IOTP(tx({ ledgerAccount: '6412' }))); assert.ok(!IOTP(tx({ ledgerAccount: '642' })));
  assert.ok(!IOTP(tx({ counterparty: 'Казначейство', description: 'Плата за ліцензію' })));

  // Проводки: зарплата, ПДВ з авансу і його закриття актом, акциз
  const le = BLE(
    [tx({ id: 't1', counterparty: 'ГУК', description: 'ПДФО із зарплати за 10.2026', amount: 1800 }),
     { id: 't2', type: 'income', paymentMethod: 'cash', amount: 2100, exciseBase: 2100, date: '2026-10-07', description: 'Фіскальний чек', counterparty: 'Роздрібний покупець' }],
    { payrollRecords: [{ id: 'r1', employeeId: 'e1', period: '2026-10', status: 'paid', totalGross: 10000, pdfo: 1800, vz: 500, esv: 2200 }],
      employees: [{ id: 'e1', fullName: 'Петренко' }],
      invoices: [{ id: 'i1', number: '1', direction: 'outgoing', clientName: 'ТОВ А' }],
      acts: [{ id: 'a1', invoiceId: 'i1', number: '1', date: '2026-10-20', total: 12000, vatAmount: 2000, type: 'act', clientName: 'ТОВ А' }],
      vatInvoices: [{ id: 'v1', direction: 'outgoing', kind: 'pn', basis: 'prepayment', sourceInvoiceId: 'i1', date: '2026-10-05', number: '1', amount: 5000, rate: 20 }] });
  const turn = (c) => ({ dt: le.filter(e => e.debit.code === c).reduce((s, e) => s + e.amount, 0), kt: le.filter(e => e.credit.code === c).reduce((s, e) => s + e.amount, 0) });
  assert.deepEqual(turn('6412'), { dt: 1800, kt: 1800 });          // нараховано і сплачено ПДФО
  assert.deepEqual(turn('6413'), { dt: 0, kt: 500 });
  assert.deepEqual(turn('65'), { dt: 0, kt: 2200 });
  assert.deepEqual(turn('66'), { dt: 2300, kt: 10000 });
  assert.deepEqual(turn('643'), { dt: 1000, kt: 1000 });           // аванс закрито актом
  assert.deepEqual(turn('6414'), { dt: 1000, kt: 3000 });          // разом зобов'язань 2000 — як у акті
  assert.deepEqual(turn('6415'), { dt: 0, kt: 100 });              // 2100 × 5 / 105
}
// ── ПДВ: нульова ставка за кодами, звільнені, імпорт, послуги нерезидента ──
{
  const docs = [
    { direction: 'outgoing', kind: 'pn', date: '2026-10-05', items: [
      { name: 'Експорт', base: 1000, rate: 0, rateCode: 901 }, { name: 'Перевезення міжнародне', base: 2000, rate: 0, rateCode: 902 },
      { name: 'Пільгова', base: 3000, rate: 0, rateCode: 903 }, { name: 'Звичайна', base: 4000, rate: 20 }] },
    { direction: 'incoming', kind: 'pn', spec: 'import', date: '2026-10-08', number: 'UA100/2026/1', amount: 5000, rate: 20 },     // без реєстрації
    { direction: 'outgoing', kind: 'pn', spec: 'nonresident', reasonType: '14', date: '2026-10-10', amount: 10000, rate: 20, registered: true, registrationDate: '2026-10-20' },
    { direction: 'outgoing', kind: 'pn', spec: 'nonresident', reasonType: '14', date: '2026-10-12', amount: 1000, rate: 20 },      // не зареєстрована
    { direction: 'outgoing', kind: 'pn', spec: 'nonresident', reasonType: '14', date: '2026-09-10', amount: 500, rate: 20, registered: true, registrationDate: '2026-10-30' }, // запізнилась
  ];
  const m = V.calcVatMonth(docs, '2026-10');
  assert.deepEqual(m.zero, { 901: 1000, 902: 2000, 903: 3000 });
  assert.equal(m.oblig[20].vat, 800); assert.equal(m.nonres[20].vat, 2200);            // рядок 6: обидві жовтневі
  assert.equal(m.importCredit[20].vat, 1000); assert.equal(m.nonresCredit[20].vat, 2100); // рядок 13: зареєстровані (2000 + 100 з вересня)
  assert.equal(m.obligVat, 3000); assert.equal(m.creditVat, 3100); assert.equal(m.negative, 100);
  assert.equal(m.pending.length, 1);
  assert.equal(V.calcVatMonth(docs, '2026-09').nonres[20].vat, 100); assert.equal(V.calcVatMonth(docs, '2026-09').nonresCredit[20].vat, 0);
  assert.equal(V.rateId({ rate: 0, rateCode: 901 }), '901'); assert.equal(V.rateId({ rate: 0 }), '902'); assert.equal(V.rateId({ rate: 7 }), '7');
}
// ── Нарахування податків за себе на субрахунки 64 ──
{
  const tx = [
    { type: 'income', date: '2026-07-10', amount: 100000 }, { type: 'income', date: '2026-08-10', amount: 50000 },
    { type: 'refund_out', date: '2026-09-01', amount: 10000 }, { type: 'income', date: '2026-10-05', amount: 70000 },
  ];
  const sum = (list, code) => list.filter(e => e.credit === code).reduce((s, e) => s + e.amount, 0);
  // 3 група 5 %: ІІІ квартал — дохід 140 000 → ЄП 7000, ВЗ 1 % = 1400, ЄСВ 3 × 1902,34; IV квартал ще не завершився
  const g3 = ownTaxAccruals({ transactions: tx, tax: { taxGroup: '3_5' }, today: new Date(2026, 10, 12) });
  assert.equal(sum(g3, '6411'), 7000); assert.equal(sum(g3, '6413'), 1400); assert.equal(sum(g3, '65'), 5707.02);
  assert.ok(g3.every(e => e.date === '2026-09-30' && e.debit === '84'));
  assert.equal(sum(ownTaxAccruals({ transactions: tx, tax: { taxGroup: '3_5', esvExempt: true }, today: new Date(2026, 10, 12) }), '65'), 0);
  // після кінця року додається IV квартал: 70 000 × 5 %
  assert.equal(sum(ownTaxAccruals({ transactions: tx, tax: { taxGroup: '3_5' }, today: new Date(2027, 0, 5) }), '6411'), 10500);
  // 2 група, ставка 20 % МЗП: 1729,40 × 3; ВЗ 10 % МЗП: 864,70 × 3
  const g2 = ownTaxAccruals({ transactions: tx, tax: { taxGroup: '2', epRatePercent: 20 }, today: new Date(2026, 10, 12) });
  assert.equal(sum(g2, '6411'), 5188.2); assert.equal(sum(g2, '6413'), 2594.1);
  // загальна система: чистий дохід 140 000 − 40 000 → ПДФО 18 000, ВЗ 5000
  const gen = ownTaxAccruals({ transactions: [...tx, { type: 'expense', date: '2026-08-15', amount: 40000, counterparty: 'ТОВ Постач', description: 'товар' }], tax: { taxGroup: 'general' }, today: new Date(2026, 10, 12) });
  assert.equal(sum(gen, '6412'), 18000); assert.equal(sum(gen, '6413'), 5000); assert.equal(sum(gen, '6411'), 0);
}
// ── Декларація з ПДВ у гривнях і акциз за додатком 5 ──
{
  const out = (o) => ({ direction: 'outgoing', kind: 'pn', rate: 20, ...o }), inc = (o) => ({ direction: 'incoming', kind: 'pn', rate: 20, ...o });
  const docs = [out({ date: '2026-10-05', amount: 10000.4 }), out({ date: '2026-10-28', amount: 1000.6 }), out({ date: '2026-10-29', kind: 'rk', amount: 300 }),
    inc({ date: '2026-10-10', amount: 4000, registered: true, registrationDate: '2026-10-30' }), inc({ date: '2026-10-08', spec: 'import', amount: 5000 })];
  const r = V.vatDeclarationRows(V.calcVatChain(docs, '2026-10'));
  assert.equal(r.R11GA, 11001); assert.equal(r.R11GB, 2200); assert.equal(r.R71GB, 60); assert.equal(r.R90GB, 2260);
  assert.equal(r.R101GB, 800); assert.equal(r.R111GB, 1000); assert.equal(r.R170GB, 1800); assert.equal(r.R180GB, 460); assert.equal(r.R190GB, undefined);
  const n = V.vatDeclarationRows(V.calcVatChain([docs[3]], '2026-10'), { seaLimit: 500 });
  assert.equal(n.R190GB, 800); assert.equal(n.R191G3, 500); assert.equal(n.R191GB, 300); assert.equal(n.R200GB, 500); assert.equal(n.R203GB, 500); assert.equal(n.R210GB, 800);
  assert.equal(V.vatDeclarationRows(V.calcVatChain([docs[3]], '2026-10')).R210GB, undefined);   // без суми з СЕА рядки 19.1–21 не заповнюються
  assert.equal(V.vatDeclarationRows(V.calcVatChain([docs[3]], '2026-11')).R161GB, 800);
  const e = calcExciseD5({ spirits: 4200, wine: 2100, beer: 1050 });
  assert.equal(e.spirits.base, 4000); assert.equal(e.spirits.tax, 200); assert.equal(e.wine.tax, 100); assert.equal(e.beer.tax, 50); assert.equal(e.total, 350);
}
// ── XML декларації єдиного податку за схемами F0103309 / F0103407 ──
{
  const fop = { rnokpp: '2812345678', fullName: 'Тест Тест', legalAddress: 'адреса', dpsRegion: 10, dpsDistrict: 13, dpsCode: 1013, dpsName: 'ДПС', mainKved: '49.41 Вантажний автомобільний транспорт', additionalKveds: '52.29 Інша допоміжна діяльність, 62.01' };
  assert.deepEqual(parseKveds(fop.mainKved, fop.additionalKveds).map(k => k.code), ['49.41', '52.29', '62.01']);
  assert.equal(parseKveds(fop.mainKved)[0].name, 'Вантажний автомобільний транспорт');
  const base = { incomeByMonth: Array(12).fill(100000), minWage: 8647, monthsOnSimplified: Array(12).fill(true), esvBaseByMonth: Array(12).fill(8647) };
  // 3 група, півріччя: один файл, період «півріччя» (тип 3, місяць 6), ЄП 5 % і ВЗ 1 % наростаючим
  const h = buildEpDeclPackage({ fop, year: 2026, decl: buildDeclaration({ ...base, taxGroup: '3_5', periodId: 2, prevRow12: 15000, prevRow23: 3000 }) });
  assert.equal(h.files.length, 1); assert.match(h.files[0].name, /F0103309100000000130620261013\.xml$/);
  const x = h.files[0].xml;
  assert.ok(x.includes('<HHY>1</HHY>') && x.includes('<R006G3>600000.00</R006G3>') && x.includes('<R011G3>30000.00</R011G3>'));
  assert.ok(x.includes('<R013G3>15000.00</R013G3>') && x.includes('<R0141G3>15000.00</R0141G3>') && x.includes('<R014G3>15000.00</R014G3>'));
  assert.ok(x.includes('<R023G3>6000.00</R023G3>') && x.includes('<R025G3>3000.00</R025G3>') && !x.includes('R021G3') && !x.includes('<HD1>'));
  // 3 група, рік: декларація з додатком 1, ЄСВ 8647 × 22 % × 12
  const y = buildEpDeclPackage({ fop, year: 2026, decl: buildDeclaration({ ...base, taxGroup: '3_5', periodId: 4 }) });
  assert.equal(y.files.length, 2); assert.ok(y.files[0].xml.includes('<R021G3>22828.08</R021G3>') && y.files[0].xml.includes('<HD1>1</HD1>'));
  assert.ok(y.files[1].name.includes('F0133109') && y.files[1].xml.includes('<R0912G4>1902.34</R0912G4>') && y.files[1].xml.includes('<R09G4>22828.08</R09G4>') && y.files[1].xml.includes('<R081G1>6</R081G1>'));
  // 2 група: річна форма F0103407, авансові внески за квартали, ВЗ 864,70 × 12 з відмітками місяців
  const g = buildEpDeclPackage({ fop, year: 2026, decl: buildDeclaration({ ...base, taxGroup: '2', periodId: 4 }), advanceByQuarter: [5188.2, 5188.2, 5188.2, 5188.2] });
  const gx = g.files[0].xml;
  assert.ok(g.files[0].name.includes('F0103407') && g.files[1].name.includes('F0134107'));
  assert.ok(gx.includes('<R03G4>5188.20</R03G4>') && !gx.includes('<R02G1>') && gx.includes('<R003G3>1200000.00</R003G3>') && gx.includes('<R08G12>1</R08G12>') && gx.includes('<R022G3>10376.40</R022G3>'));
}
console.log('ALL OK');
