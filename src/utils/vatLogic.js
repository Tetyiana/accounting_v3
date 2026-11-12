// Логіка ПДВ: види податкових накладних, строки реєстрації, правило першої події,
// розрахунки коригування, період включення до декларації.
// Норми: ст. 187, 192, 198, 201 ПКУ; Порядок заповнення ПН — наказ Мінфіну від 31.12.2015 № 1307;
// строки реєстрації на час воєнного стану — п. 89 підрозд. 2 розд. ХХ ПКУ.
import { VAT_RATES } from '../constants/documentTypes';

const r2 = (n) => Math.round((+n || 0) * 100) / 100;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const month = (s) => String(s || '').slice(0, 7);

export const VAT_RATE_LIST = [20, 7, 14, 0];
// Ставки для позицій ПН. Для нульових — код ставки з графи 8 ПН:
// 901 — 0 % при експорті, 902 — 0 % за іншими операціями, 903 — звільнено від оподаткування.
export const VAT_RATE_OPTIONS = [
  { id: '20', rate: 20, label: '20 %' }, { id: '7', rate: 7, label: '7 %' }, { id: '14', rate: 14, label: '14 %' },
  { id: '901', rate: 0, label: '0 % — експорт' }, { id: '902', rate: 0, label: '0 % — інші операції' },
  { id: '903', rate: 0, label: 'Без ПДВ — звільнено' },
];
export const rateId = (it) => (+it.rate > 0 ? String(+it.rate) : String(it.rateCode || 902));

// Умовні ІПН покупця (пп. 4, 10–12 Порядку № 1307)
export const IPN_NONPAYER = '100000000000';
export const IPN_SELF = '600000000000';
export const IPN_NONRESIDENT = '500000000000';   // постачальник-нерезидент (п. 12 Порядку № 1307)

// Види ПН. reasonType — «Не підлягає наданню отримувачу (покупцю) з причини»;
// consolidatedCode — код ознаки «Зведена податкова накладна».
export const PN_SPECS = [
  { id: '', label: 'Звичайна (покупець — платник ПДВ)' },
  { id: 'nonpayer', label: 'Неплатнику ПДВ (тип причини 02)', reasonType: '02', buyer: 'Неплатник', ipn: IPN_NONPAYER },
  { id: 'daily', label: 'Підсумкова за щоденними підсумками, неплатникам (тип причини 11)', reasonType: '11', buyer: 'Неплатник', ipn: IPN_NONPAYER },
  { id: 'rhythm', label: 'Зведена на ритмічні постачання платнику (код 4, п. 201.4 ПКУ)', consolidatedCode: '4' },
  { id: 'rhythm_nonpayer', label: 'Зведена на ритмічні постачання неплатнику (код 4, тип причини 02)', consolidatedCode: '4', reasonType: '02', buyer: 'Неплатник', ipn: IPN_NONPAYER },
  { id: 'self198', label: 'Зведена за п. 198.5 ПКУ — компенсуючі зобов\'язання (код 1)', consolidatedCode: '1', self: true, ipn: IPN_SELF, reasons: ['04', '08', '09', '13'] },
  { id: 'nonresident', label: 'Послуги від нерезидента — складає отримувач (тип причини 14, п. 208.2 ПКУ)', reasonType: '14', nonres: true },
  { id: 'self199', label: 'Зведена за п. 199.1 ПКУ — пропорційний кредит (код 2)', consolidatedCode: '2', self: true, ipn: IPN_SELF, reasons: ['08', '09'] },
];
export const REASON_TYPES = {
  '02': 'постачання неплатнику податку',
  '04': 'постачання в межах балансу для невиробничого використання',
  '08': 'постачання для операцій, що не є об\'єктом оподаткування ПДВ',
  '09': 'постачання для операцій, звільнених від оподаткування ПДВ',
  '11': 'складена за щоденними підсумками операцій',
  '13': 'використання не в господарській діяльності',
  '14': 'складена отримувачем (покупцем) послуг від нерезидента',
};
export const specOf = (v) => PN_SPECS.find(s => s.id === (v.spec || '')) || PN_SPECS[0];
export const isSelfPn = (v) => !!specOf(v).self;
export const isNonpayerPn = (v) => specOf(v).ipn === IPN_NONPAYER;
export const isNonresPn = (v) => !!specOf(v).nonres;
// Імпорт: податковий кредит за митною декларацією, без реєстрації в ЄРПН (п. 198.2, 201.12 ПКУ)
export const isImportDoc = (v) => v.direction === 'incoming' && v.spec === 'import';

// Причини коригування (коди графи 2.1 РК)
export const RK_REASONS = [
  { id: '101', label: '101 — зміна ціни' },
  { id: '102', label: '102 — зміна кількості' },
  { id: '103', label: '103 — повернення товару або авансових платежів' },
  { id: '104', label: '104 — зміна номенклатури' },
];

// ─── Суми ─────────────────────────────────────────────────────────
// ПН може мати позиції з різними ставками; без позицій — одна сума і одна ставка.
export const vatLines = (v) => {
  const rate = v.rate == null || v.rate === '' ? 20 : +v.rate;
  if (Array.isArray(v.items) && v.items.length) {
    return v.items.map(it => {
      const r = it.rate == null || it.rate === '' ? rate : +it.rate;
      const base = r2(it.base != null && it.base !== '' ? +it.base : (+it.qty || 0) * (+it.price || 0));
      return { ...it, rate: r, base, vat: r2(base * r / 100) };
    });
  }
  const base = r2(v.amount);
  return [{ name: v.description || '', rate, base, vat: r2(base * rate / 100) }];
};
export const vatTotals = (v) => {
  const lines = vatLines(v);
  const byRate = {};
  for (const l of lines) {
    byRate[l.rate] = byRate[l.rate] || { base: 0, vat: 0 };
    byRate[l.rate].base = r2(byRate[l.rate].base + l.base);
  }
  // ПДВ рахуємо від суми бази за ставкою, а не як суму округлених рядків
  for (const r of Object.keys(byRate)) byRate[r].vat = r2(byRate[r].base * +r / 100);
  const base = r2(Object.values(byRate).reduce((s, x) => s + x.base, 0));
  const vat = r2(Object.values(byRate).reduce((s, x) => s + x.vat, 0));
  // обсяги без ПДВ за кодами ставки: експорт, інші нульові, звільнені
  const zero = { 901: 0, 902: 0, 903: 0 };
  for (const l of lines) if (!l.rate) { const c = +l.rateCode || 902; zero[c] = r2((zero[c] || 0) + l.base); }
  return { byRate, base, vat, total: r2(base + vat), zero };
};

// ─── Нумерація виданих ПН/РК: у межах місяця, без нулів на початку (п. 6 Порядку № 1307)
export const nextVatNumber = (vatInvoices, dateStr) => {
  const key = month(dateStr || iso(new Date()));
  const max = vatInvoices.reduce((m, v) => {
    if (v.direction !== 'outgoing' || month(v.date) !== key) return m;
    const n = parseInt(String(v.number || '').split('/')[0], 10);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return String(max + 1);
};

// ─── Строк реєстрації в ЄРПН (воєнні строки, п. 89 підрозд. 2 розд. ХХ ПКУ) ────
//  складені 1–15 числа — до 5 числа наступного місяця;
//  складені з 16 числа — до 18 числа наступного місяця;
//  зведені за пп. 198.5, 199.1 — 20 календарних днів після місяця складання;
//  РК на зменшення покупцю-платнику (реєструє покупець) — 18 календарних днів з дня отримання.
export const registrationDeadline = (v) => {
  if (!v.date) return null;
  const d = parse(v.date);
  if (isSelfPn(v)) return { date: iso(new Date(d.getFullYear(), d.getMonth() + 1, 20)), by: 'seller' };
  if (v.kind === 'rk' && vatTotals(v).vat < 0 && !isNonpayerPn(v) && !v.buyerIsNonpayer) {
    const x = new Date(d); x.setDate(x.getDate() + 17);   // день отримання — перший з 18
    return { date: iso(x), by: 'buyer' };
  }
  const day = d.getDate() <= 15 ? 5 : 18;
  return { date: iso(new Date(d.getFullYear(), d.getMonth() + 1, day)), by: 'seller' };
};
export const isRegisteredOnTime = (v) => {
  if (!v.registered) return false;
  const dl = registrationDeadline(v);
  return !v.registrationDate || !dl || String(v.registrationDate).slice(0, 10) <= dl.date;
};

// ─── До якого періоду декларації потрапляє документ ───────────────
// Повертає { period, side: 'oblig'|'credit', row: 'main'|'self'|'adjust', pending }.
//  Видана ПН — зобов'язання за датою складання, незалежно від реєстрації.
//  Видана РК: збільшення — за датою складання; зменшення — лише після реєстрації в ЄРПН
//   (п. 192.1 ПКУ): вчасно зареєстрована — період складання, із запізненням — період реєстрації.
//  Отримана ПН — кредит лише за зареєстрованою (п. 198.6 ПКУ): вчасно — період складання,
//   із запізненням — період реєстрації.
//  Отримана РК: зменшення кредиту — за датою складання незалежно від реєстрації;
//   збільшення — лише після реєстрації.
export const declarationSlot = (v) => {
  const t = vatTotals(v);
  const out = v.direction === 'outgoing';
  const side = out ? 'oblig' : 'credit';
  const row = v.kind === 'rk' ? 'adjust' : (isSelfPn(v) ? 'self' : 'main');
  if (isImportDoc(v)) return { period: month(v.date), side: 'credit', row: 'import', pending: '' };
  const needsReg = out ? (v.kind === 'rk' && t.vat < 0) : !(v.kind === 'rk' && t.vat < 0);
  if (!needsReg) return { period: month(v.date), side, row, pending: '' };
  if (!v.registered) {
    return { period: '', side, row,
      pending: out ? 'РК на зменшення не зареєстровано в ЄРПН — зобов\'язання не зменшено'
                   : 'не зареєстровано в ЄРПН — податковий кредит не враховано' };
  }
  const period = isRegisteredOnTime(v) ? month(v.date) : month(v.registrationDate);
  return { period, side, row, pending: '' };
};

const emptyRates = () => ({ 20: { base: 0, vat: 0 }, 7: { base: 0, vat: 0 }, 14: { base: 0, vat: 0 }, 0: { base: 0, vat: 0 } });

// Розрахунок за місяць. Рядки декларації з ПДВ (наказ Мінфіну від 28.01.2016 № 21):
//  1.1 — постачання за ставкою 20 %, 1.2 — 7 %, 1.3 — 14 %, 2/3 — 0 %;
//  4.1/4.2/4.3 — зобов'язання за пп. 198.5, 199.1 (зведені ПН); 7 — коригування зобов'язань (РК);
//  10.1/10.2/10.3 — придбання за ставками 20 / 7 / 14 %; 14 — коригування кредиту (РК);
//  16.1 — від'ємне значення попереднього періоду; 18 — до сплати; 19 — від'ємне значення.
export const calcVatMonth = (vatInvoices, period, carryIn = 0) => {
  const res = {
    period, oblig: emptyRates(), self: emptyRates(), credit: emptyRates(),
    obligAdjust: { base: 0, vat: 0 }, creditAdjust: { base: 0, vat: 0 }, pending: [], carryIn: r2(carryIn),
    zero: { 901: 0, 902: 0, 903: 0 },                                  // рядки 2, 3, 5
    nonres: emptyRates(), nonresCredit: emptyRates(), importCredit: emptyRates(),   // рядки 6, 13, 11
  };
  const addTo = (bucket, t) => {
    for (const [rate, x] of Object.entries(t.byRate)) {
      const b = bucket[rate] || (bucket[rate] = { base: 0, vat: 0 });
      b.base = r2(b.base + x.base); b.vat = r2(b.vat + x.vat);
    }
  };
  for (const v of vatInvoices) {
    // Послуги від нерезидента (п. 208.2 ПКУ): зобов'язання — за датою ПН (рядок 6);
    // кредит (рядок 13) — після реєстрації цієї ПН: вчасно — той самий період, із запізненням — період реєстрації.
    if (isNonresPn(v) && v.direction === 'outgoing' && v.kind !== 'rk') {
      const t = vatTotals(v);
      if (month(v.date) === period) addTo(res.nonres, t);
      if (!v.registered) {
        if (month(v.date) <= period) res.pending.push({ doc: v, reason: 'ПН на послуги нерезидента не зареєстровано в ЄРПН — зобов\'язання нараховано, кредит не враховано' });
      } else if ((isRegisteredOnTime(v) ? month(v.date) : month(v.registrationDate)) === period) addTo(res.nonresCredit, t);
      continue;
    }
    const slot = declarationSlot(v);
    if (slot.pending && month(v.date) <= period) { res.pending.push({ doc: v, reason: slot.pending }); continue; }
    if (slot.period !== period) continue;
    const t = vatTotals(v);
    if (slot.row === 'adjust') {
      const a = slot.side === 'oblig' ? res.obligAdjust : res.creditAdjust;
      a.base = r2(a.base + t.base); a.vat = r2(a.vat + t.vat);
      continue;
    }
    if (slot.row === 'import') { addTo(res.importCredit, t); continue; }
    addTo(slot.side === 'credit' ? res.credit : (slot.row === 'self' ? res.self : res.oblig), t);
    if (slot.side === 'oblig' && slot.row === 'main') for (const c of [901, 902, 903]) res.zero[c] = r2(res.zero[c] + t.zero[c]);
  }
  const sumVat = (b) => r2(Object.values(b).reduce((s, x) => s + x.vat, 0));
  res.obligVat = r2(sumVat(res.oblig) + sumVat(res.self) + sumVat(res.nonres) + res.obligAdjust.vat);       // рядок 9
  res.creditVat = r2(sumVat(res.credit) + sumVat(res.importCredit) + sumVat(res.nonresCredit)
    + res.creditAdjust.vat + res.carryIn);                                                                   // рядок 17
  const diff = r2(res.obligVat - res.creditVat);
  res.toPay = diff > 0 ? diff : 0;                                                          // рядок 18
  res.negative = diff < 0 ? -diff : 0;                                                      // рядок 19
  return res;
};

// Від'ємне значення переноситься до кредиту наступного місяця (рядок 21 → рядок 16.1),
// тому місяці рахуються ланцюжком від першого документа.
export const calcVatChain = (vatInvoices, period) => {
  const months = vatInvoices.flatMap(v => [month(v.date), month(v.registrationDate)]).filter(Boolean).sort();
  let cur = months[0] && months[0] < period ? months[0] : period;
  let carry = 0, res = null;
  for (let guard = 0; guard < 240; guard++) {
    res = calcVatMonth(vatInvoices, cur, carry);
    if (cur >= period) break;
    carry = res.negative;
    const [y, m] = cur.split('-').map(Number);
    cur = iso(new Date(y, m, 1)).slice(0, 7);
  }
  return res;
};

// ─── Правило першої події (п. 187.1 ПКУ) ──────────────────────────
// Зобов'язання виникають за тим, що сталося раніше: оплата чи відвантаження.
// Наростаючим підсумком: зобов'язання = max(оплачено, відвантажено). Кожне зростання
// цього максимуму — подія, на яку потрібна ПН. Уже виписані ПН/РК закривають події
// від найдавнішої. Суми — з ПДВ.
const docTotal = (items = []) => r2(items.reduce((s, it) => {
  const rate = VAT_RATES.find(x => x.id === it.vatRate)?.rate || 0;
  return s + (+it.qty || 0) * (+it.price || 0) * (1 + rate);
}, 0));
const hasVat = (items = []) => items.some(it => it.vatRate && it.vatRate !== 'no_vat');

export const linkedVatDocs = (invoice, invActs, vatInvoices) => {
  const actIds = new Set(invActs.map(a => a.id));
  return vatInvoices.filter(v => v.direction === 'outgoing' && (
    v.sourceInvoiceId === invoice.id || (v.sourceActId && actIds.has(v.sourceActId)) ||
    (!v.sourceInvoiceId && !v.sourceActId && v.sourceInvoiceNumber && v.sourceInvoiceNumber === invoice.number)));
};

export const firstEvents = ({ invoice, acts = [], payments = [], vatInvoices = [] }) => {
  const invActs = acts.filter(a => a.invoiceId === invoice.id && a.status !== 'cancelled');
  const events = [
    ...invActs.map(a => ({ date: String(a.date).slice(0, 10), kind: 'act', amount: docTotal(a.items), act: a, order: 1 })),
    ...payments.filter(p => p.invoiceId === invoice.id).map(p => ({ date: String(p.date).slice(0, 10), kind: 'prepayment', amount: +p.amount || 0, payment: p, order: 0 })),
  ].filter(e => e.date && e.amount > 0).sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  let shipped = 0, paid = 0, top = 0;
  const due = [];
  for (const e of events) {
    if (e.kind === 'act') shipped = r2(shipped + e.amount); else paid = r2(paid + e.amount);
    const now = Math.max(shipped, paid);
    if (now > top + 0.004) { due.push({ ...e, amount: r2(now - top) }); top = now; }
  }
  let issued = r2(linkedVatDocs(invoice, invActs, vatInvoices).reduce((s, v) => s + vatTotals(v).total, 0));
  const pending = [];
  for (const e of due) {
    const cover = Math.min(issued, e.amount);
    issued = r2(issued - cover);
    if (e.amount - cover > 0.004) pending.push({ ...e, amount: r2(e.amount - cover), invoice });
  }
  return { pending, shipped, paid, liability: top };
};

// Позиції ПН на подію: номенклатура з акта (або рахунку — для передоплати),
// кількість пропорційна сумі події.
export const itemsForEvent = (event) => {
  const src = (event.kind === 'act' ? event.act?.items : event.invoice?.items) || [];
  const srcTotal = docTotal(src);
  const k = srcTotal > 0 ? Math.min(1, event.amount / srcTotal) : 1;
  return src.filter(it => it.vatRate && it.vatRate !== 'no_vat').map(it => {
    const rate = Math.round((VAT_RATES.find(x => x.id === it.vatRate)?.rate || 0) * 100);
    const qty = Math.round((+it.qty || 0) * k * 1e6) / 1e6;
    return {
      name: it.name || it.description || '', unitName: it.unit || '', uktzed: it.uktzed || '', dkpp: it.dkpp || '',
      qty, price: +it.price || 0, base: r2((+it.qty || 0) * (+it.price || 0) * k), rate,
    };
  });
};

// Проєкт ПН на подію першої події
export const draftPnForEvent = (event, vatInvoices, client) => {
  const inv = event.invoice;
  const items = itemsForEvent(event);
  const nonpayer = client ? !client.isVatPayer : false;
  const base = r2(items.reduce((s, x) => s + x.base, 0));
  return {
    kind: 'pn', direction: 'outgoing', date: event.date, number: nextVatNumber(vatInvoices, event.date),
    counterparty: nonpayer ? 'Неплатник' : (inv.clientName || ''),
    buyerIpn: nonpayer ? IPN_NONPAYER : (client?.vatIpn || ''),
    counterpartyTin: nonpayer ? '' : (inv.clientIpn || client?.ipn || ''),
    spec: nonpayer ? 'nonpayer' : '', reasonType: nonpayer ? '02' : '', consolidatedCode: '',
    items, amount: base, rate: items[0]?.rate ?? 20,
    basis: event.kind, sourceActId: event.act?.id || null, sourceInvoiceId: inv.id, sourceInvoiceNumber: inv.number,
    description: event.kind === 'prepayment' ? `Попередня оплата за рахунком № ${inv.number}` : '',
    registered: false,
  };
};

// Усі події без ПН за продажами з ПДВ
export const pendingPnEvents = ({ invoices = [], acts = [], payments = [], vatInvoices = [] }) =>
  invoices
    .filter(i => i.direction === 'outgoing' && i.status !== 'cancelled' && hasVat(i.items))
    .flatMap(i => firstEvents({ invoice: i, acts, payments, vatInvoices }).pending)
    .sort((a, b) => a.date.localeCompare(b.date));

// ─── Роздріб: підсумкова ПН за день (п. 201.4 ПКУ, тип причини 11) ─
// Роздрібна виручка — надходження готівкою/карткою без рахунку (чеки ПРРО).
// Роздрібний акциз (5 %) до бази ПДВ не входить: ПДВ = (виручка − акциз) / 6.
export const retailExcise = (grossExcisable) => r2((+grossExcisable || 0) * 5 / 105);
export const isRetailReceipt = (t) => t.type === 'income' && !t.invoiceId &&
  ['cash', 'acquiring'].includes(t.paymentMethod) && /чек|роздріб/i.test(`${t.description || ''} ${t.counterparty || ''}`);
export const pendingRetailDays = ({ transactions = [], vatInvoices = [], rate = 20 }) => {
  const days = {};
  for (const t of transactions) {
    if (!isRetailReceipt(t)) continue;
    const d = String(t.date).slice(0, 10);
    days[d] = days[d] || { date: d, gross: 0, excise: 0 };
    days[d].gross = r2(days[d].gross + (+t.amount || 0));
    days[d].excise = r2(days[d].excise + retailExcise(t.exciseBase));
  }
  for (const v of vatInvoices) {
    if (v.direction !== 'outgoing' || v.basis !== 'retail' || !days[v.date]) continue;
    days[v.date].issued = r2((days[v.date].issued || 0) + vatTotals(v).total);
  }
  return Object.values(days)
    .map(x => {
      const taxable = r2(x.gross - x.excise - (x.issued || 0));
      return { ...x, taxable, base: r2(taxable / (1 + rate / 100)) };
    })
    .filter(x => x.taxable > 0.004)
    .sort((a, b) => a.date.localeCompare(b.date));
};
export const draftRetailPn = (day, vatInvoices, rate = 20) => ({
  kind: 'pn', direction: 'outgoing', date: day.date, number: nextVatNumber(vatInvoices, day.date),
  counterparty: 'Неплатник', buyerIpn: IPN_NONPAYER, counterpartyTin: '',
  spec: 'daily', reasonType: '11', consolidatedCode: '',
  items: [{ name: 'Товари (послуги) за щоденними підсумками операцій', unitName: 'грн', qty: 1, price: day.base, base: day.base, rate }],
  amount: day.base, rate, basis: 'retail', description: 'Підсумкова за день', registered: false,
});

// ─── Розрахунок коригування ───────────────────────────────────────
// Рядки РК до позицій ПН. Зміна кількості / повернення — один рядок зі зміною кількості
// за ціною ПН. Зміна ціни — рядок зі зміною ціни на всю кількість.
// changes: [{ lineNo, qtyDelta, priceDelta }], reasonCode — код причини.
export const buildRkItems = (pn, changes, reasonCode) => {
  const lines = vatLines(pn);
  const items = [];
  changes.forEach((c, i) => {
    const src = lines[(c.lineNo || 1) - 1];
    if (!src) return;
    const qty = +src.qty || 1, price = +src.price || src.base;
    const qd = +c.qtyDelta || 0, pd = +c.priceDelta || 0;
    if (!qd && !pd) return;
    const base = r2(qd * price + pd * (qty + qd));
    items.push({
      lineNo: c.lineNo || 1, reasonCode, group: i + 1, name: src.name, unitName: src.unitName || '',
      uktzed: src.uktzed || '', dkpp: src.dkpp || '', rate: src.rate,
      qtyDelta: qd, price, priceDelta: pd, qtyForPrice: pd ? qty + qd : 0, base,
    });
  });
  return items;
};
export const draftRk = (pn, items, vatInvoices, date) => ({
  kind: 'rk', direction: pn.direction, date, number: pn.direction === 'outgoing' ? nextVatNumber(vatInvoices, date) : '',
  counterparty: pn.counterparty, buyerIpn: pn.buyerIpn || '', counterpartyTin: pn.counterpartyTin || '',
  spec: pn.spec || '', reasonType: pn.reasonType || '', consolidatedCode: pn.consolidatedCode || '',
  items, amount: r2(items.reduce((s, x) => s + x.base, 0)), rate: pn.rate ?? 20,
  correctedId: pn.id, correctedNumber: pn.number, correctedDate: pn.date,
  sourceInvoiceId: pn.sourceInvoiceId || null, sourceInvoiceNumber: pn.sourceInvoiceNumber || '',
  basis: 'manual', registered: false,
});
// Хто реєструє РК (п. 192.1 ПКУ): зменшення суми покупцю-платнику — покупець, решту — постачальник
export const rkRegistrar = (rk) =>
  (vatTotals(rk).vat < 0 && !isNonpayerPn(rk) && !isSelfPn(rk)) ? 'buyer' : 'seller';
