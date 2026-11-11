// Розрахунки з покупцями (рах. 36) і постачальниками (рах. 63) за методом нарахування:
//   акт / накладна покупцю      → виникає борг покупця
//   надходження від покупця     → закриває його акти, від найдавнішого (ФІФО)
//   надходження понад акти      → аванс одержаний
// Для постачальників — дзеркально.
//
// Оплату відносимо на контрагента так:
//   1) операція прив'язана до рахунку (через оплату або напряму) — контрагент рахунку;
//   2) інакше — за назвою контрагента в операції, якщо на нього є акти чи рахунки.
// Назви порівнюються без регістру, лапок і організаційної форми (ТОВ, ФОП, ПП…).

const round2 = (n) => Math.round((+n || 0) * 100) / 100;

const ORG_FORMS = /(^|\s)(тов|тзов|фоп|пп|прат|пат|ат|кп|дп|фг|сфг|гс|го|бф|тдв|ооо|llc|ltd)(?=\s|$)/g;
export const partyKey = (name) => (name || '')
  .toLowerCase()
  .replace(/[«»"'`“”„’‘.,]/g, ' ')
  .replace(ORG_FORMS, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const isReturnAct = (a) => a.type === 'return_act';
const actParty = (a, invById) => a.clientName || invById.get(a.invoiceId)?.clientName || '';
const actDirection = (a, invById) => a.direction || invById.get(a.invoiceId)?.direction || 'outgoing';

// Індекс документів: хто покупець, хто постачальник, до якого рахунку прив'язана операція
export const buildPartyIndex = ({ acts = [], invoices = [], payments = [] }) => {
  const invById = new Map(invoices.map(i => [i.id, i]));
  const payById = new Map(payments.map(p => [p.id, p]));
  const customers = new Map();   // key → назва
  const suppliers = new Map();
  const add = (map, name) => { const k = partyKey(name); if (k && !map.has(k)) map.set(k, name); };

  invoices.forEach(i => {
    if (i.status === 'cancelled') return;
    add(i.direction === 'incoming' ? suppliers : customers, i.clientName);
  });
  acts.forEach(a => add(actDirection(a, invById) === 'incoming' ? suppliers : customers, actParty(a, invById)));

  // Рахунок, до якого прив'язана операція журналу (або null)
  const invoiceOfTx = (t) => {
    const direct = t.invoiceId && invById.get(t.invoiceId);
    if (direct) return direct;
    const pay = t.invoicePaymentId && payById.get(t.invoicePaymentId);
    return (pay && invById.get(pay.invoiceId)) || null;
  };

  // Чия це операція: { side: 'customer' | 'supplier', key, name } або null
  const partyOfTx = (t) => {
    const inv = invoiceOfTx(t);
    if (inv) {
      const name = inv.clientName || t.counterparty || '';
      return { side: inv.direction === 'incoming' ? 'supplier' : 'customer', key: partyKey(name), name };
    }
    const key = partyKey(t.counterparty);
    if (!key) return null;
    const moneyIn = t.type === 'income' || t.type === 'refund_in';
    // Гроші від покупця / повернення від постачальника; оплата постачальнику / повернення покупцю
    const first  = (t.type === 'income' || t.type === 'refund_out') ? 'customer' : 'supplier';
    const second = first === 'customer' ? 'supplier' : 'customer';
    const has = (side) => (side === 'customer' ? customers : suppliers).has(key);
    if (t.type === 'non_income') return null;
    if (has(first)) return { side: first, key, name: (first === 'customer' ? customers : suppliers).get(key) };
    // refund_in від покупця чи refund_out постачальнику не буває — другу сторону не перевіряємо
    void moneyIn; void second;
    return null;
  };

  return { invById, customers, suppliers, invoiceOfTx, partyOfTx, actParty: (a) => actParty(a, invById), actDirection: (a) => actDirection(a, invById) };
};

/**
 * Стан розрахунків по кожному контрагенту.
 * Повертає масив:
 *   { side, key, name,
 *     docs: [{ act, total, paid, remaining }],   // акти з розподіленою оплатою (ФІФО)
 *     billed, received, balance,                 // balance > 0 — борг контрагента (для supplier — наш борг)
 *     advance }                                  // оплата понад акти
 */
export const buildSettlements = ({ acts = [], invoices = [], payments = [], transactions = [], asOf = '' }) => {
  const idx = buildPartyIndex({ acts, invoices, payments });
  const parties = new Map();
  const get = (side, key, name) => {
    const id = `${side}:${key}`;
    if (!parties.has(id)) parties.set(id, { side, key, name, docs: [], received: 0, returned: 0 });
    return parties.get(id);
  };
  const inPeriod = (d) => !asOf || (d || '') <= asOf;

  acts.forEach(a => {
    if (!inPeriod(a.date)) return;
    const name = idx.actParty(a);
    const key = partyKey(name);
    if (!key) return;
    const side = idx.actDirection(a) === 'incoming' ? 'supplier' : 'customer';
    const p = get(side, key, name);
    const total = round2(a.total);
    if (isReturnAct(a)) p.returned = round2(p.returned + total);   // повернення зменшує борг
    else p.docs.push({ act: a, total, paid: 0, remaining: total });
  });

  transactions.forEach(t => {
    if (!inPeriod(t.date)) return;
    const who = idx.partyOfTx(t);
    if (!who || !who.key) return;
    const p = get(who.side, who.key, who.name);
    const amt = round2(t.amount);
    // customer: income збільшує оплату, refund_out зменшує; supplier: expense збільшує, refund_in зменшує
    const plus = who.side === 'customer' ? t.type === 'income' : t.type === 'expense';
    const minus = who.side === 'customer' ? t.type === 'refund_out' : t.type === 'refund_in';
    if (plus) p.received = round2(p.received + amt);
    else if (minus) p.received = round2(p.received - amt);
  });

  return [...parties.values()].map(p => {
    p.docs.sort((a, b) => (a.act.date || '').localeCompare(b.act.date || '') || String(a.act.number).localeCompare(String(b.act.number), 'uk', { numeric: true }));
    // Оплата і повернення гасять акти від найдавнішого
    let pool = round2(p.received + p.returned);
    p.docs.forEach(d => {
      const part = Math.max(0, Math.min(d.remaining, pool));
      d.paid = round2(part);
      d.remaining = round2(d.total - part);
      pool = round2(pool - part);
    });
    const billed = round2(p.docs.reduce((s, d) => s + d.total, 0) - p.returned);
    return {
      side: p.side, key: p.key, name: p.name, docs: p.docs,
      billed, received: p.received,
      balance: round2(billed - p.received),
      advance: Math.max(0, pool),
    };
  });
};
