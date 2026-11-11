// Складський облік: рух товарів і залишки за середньозваженою собівартістю.
//
// Рухи беруться з двох джерел:
//   1) ручні записи складу (таблиця movements): прихід, видаток, списання, інвентаризація;
//   2) накладні на товар із розділу «Продажі / Закупівлі» — автоматично:
//        накладна від постачальника → прихід за ціною закупівлі;
//        накладна покупцю           → видаток;
//        акт повернення             → зворотний рух.
//      Рядки з одиницями послуг (год, послуга тощо) на склад не потрапляють.
//
// Собівартість вибуття — середньозважена на момент операції
// (п. 16 НП(С)БО 9 «Запаси» допускає цей метод).

const round2 = (n) => Math.round((+n || 0) * 100) / 100;
const round4 = (n) => Math.round((+n || 0) * 10000) / 10000;

export const SERVICE_UNITS = ['год', 'хв', 'день', 'місяць', 'послуга', 'сеанс', 'відвідування'];

export const MOVEMENT_KINDS = {
  in:  [
    { id: 'purchase',   label: 'Закупівля' },
    { id: 'production', label: 'Власне виробництво' },
    { id: 'return_in',  label: 'Повернення від покупця' },
    { id: 'surplus',    label: 'Надлишок (інвентаризація)' },
    { id: 'opening',    label: 'Початковий залишок' },
  ],
  out: [
    { id: 'sale',       label: 'Продаж' },
    { id: 'materials',  label: 'Списання у виробництво' },
    { id: 'return_out', label: 'Повернення постачальнику' },
    { id: 'writeoff',   label: 'Списання (брак, псування)' },
    { id: 'shortage',   label: 'Нестача (інвентаризація)' },
  ],
};
export const kindLabel = (operation, kind) =>
  [...MOVEMENT_KINDS.in, ...MOVEMENT_KINDS.out].find(k => k.id === kind)?.label
  || (operation === 'in' ? 'Прихід' : 'Видаток');

// Ключ позиції: артикул, якщо є, інакше назва (без регістру і зайвих пробілів)
export const itemKey = (m) => {
  const sku = (m.sku || '').trim().toLowerCase();
  return sku ? `sku:${sku}` : `name:${(m.itemName || '').trim().toLowerCase().replace(/\s+/g, ' ')}`;
};

// Сумісність зі старим записом: тип операції міг зберігатися в movementType
const opOf = (m) => m.operation || (m.movementType === 'out' ? 'out' : m.movementType === 'in' ? 'in' : 'in');

// Усі рухи: ручні + з накладних. Відсортовані за датою, прихід раніше за видаток того ж дня.
export const buildWarehouseMovements = ({ movements = [], acts = [], invoices = [], products = [] }) => {
  const invById = new Map(invoices.map(i => [i.id, i]));
  const skuByName = new Map(products.filter(p => p.sku).map(p => [(p.name || '').trim().toLowerCase(), p.sku]));
  const list = movements.map(m => ({
    ...m, operation: opOf(m), qty: +m.qty || 0, price: +m.price || 0, auto: false,
    description: m.description || m.note || '',
  }));

  acts.forEach(a => {
    if (a.type !== 'delivery_note' && a.type !== 'return_act') return;
    const inv = invById.get(a.invoiceId);
    const incoming = (a.direction || inv?.direction || 'outgoing') === 'incoming';
    const isReturn = a.type === 'return_act';
    // закупівля → прихід; продаж → видаток; повернення — навпаки
    const operation = incoming !== isReturn ? 'in' : 'out';
    const kind = isReturn ? (incoming ? 'return_out' : 'return_in') : (incoming ? 'purchase' : 'sale');
    (a.items || []).forEach((it, i) => {
      const qty = +it.qty || 0;
      if (!it.name || qty <= 0 || SERVICE_UNITS.includes(it.unit)) return;
      list.push({
        id: `auto_${a.id}_${i}`, auto: true, sourceActId: a.id,
        date: a.date, itemName: it.name, unit: it.unit || 'шт',
        sku: skuByName.get(it.name.trim().toLowerCase()) || '', batch: '',
        operation, kind, qty, price: +it.price || 0,
        counterparty: a.clientName || inv?.clientName || '',
        description: `${isReturn ? 'Акт повернення' : 'Накладна'} №${a.number || 'б/н'}`,
      });
    });
  });

  return list.sort((a, b) => (a.date || '').localeCompare(b.date || '')
    || (a.operation === b.operation ? 0 : a.operation === 'in' ? -1 : 1));
};

/**
 * Проводить рухи в хронологічному порядку.
 * Повертає:
 *   rows  — рухи з полями balance (залишок позиції після операції), cost (собівартість
 *           одиниці, за якою проведено операцію), costAmount (сума за собівартістю);
 *   items — оборотна відомість по позиціях за період [dateStart; dateEnd]:
 *           { key, itemName, sku, unit, openQty, openValue, inQty, inValue,
 *             outQty, outValue, qty, value, avgCost, saleAmount, negative }
 */
export const calcWarehouse = (list, { dateStart = '', dateEnd = '' } = {}) => {
  const state = new Map();   // key → { qty, value }
  const items = new Map();
  const rows = [];

  list.forEach(m => {
    if (dateEnd && (m.date || '') > dateEnd) return;
    const key = itemKey(m);
    const st = state.get(key) || { qty: 0, value: 0 };
    if (!items.has(key)) {
      items.set(key, {
        key, itemName: m.itemName, sku: m.sku || '', unit: m.unit || '',
        openQty: 0, openValue: 0, inQty: 0, inValue: 0, outQty: 0, outValue: 0,
        saleAmount: 0, negative: false,
      });
    }
    const it = items.get(key);
    if (!it.sku && m.sku) it.sku = m.sku;
    if (!it.unit && m.unit) it.unit = m.unit;
    const before = !!dateStart && (m.date || '') < dateStart;

    let cost, costAmount;
    if (m.operation === 'in') {
      // Прихід без ціни (повернення від покупця, надлишок) — за поточною середньою собівартістю
      cost = m.price > 0 ? m.price : (st.qty > 0 ? st.value / st.qty : 0);
      costAmount = round2(cost * m.qty);
      st.qty = round4(st.qty + m.qty);
      st.value = round2(st.value + costAmount);
      if (!before) { it.inQty = round4(it.inQty + m.qty); it.inValue = round2(it.inValue + costAmount); }
    } else {
      cost = st.qty > 0 ? st.value / st.qty : 0;
      // Останню одиницю списуємо разом із залишком вартості — без копійчаних хвостів
      costAmount = m.qty >= st.qty && st.qty > 0 ? st.value : round2(cost * m.qty);
      st.qty = round4(st.qty - m.qty);
      st.value = st.qty > 0 ? round2(st.value - costAmount) : 0;
      if (st.qty < 0) it.negative = true;
      if (!before) {
        it.outQty = round4(it.outQty + m.qty); it.outValue = round2(it.outValue + costAmount);
        if (m.kind === 'sale') it.saleAmount = round2(it.saleAmount + m.qty * m.price);
      }
    }
    state.set(key, st);
    if (before) { it.openQty = st.qty; it.openValue = st.value; }
    else rows.push({ ...m, balance: st.qty, cost: round2(cost), costAmount });
  });

  const result = [...items.values()].map(it => {
    const st = state.get(it.key);
    return { ...it, qty: st.qty, value: st.value, avgCost: st.qty > 0 ? round2(st.value / st.qty) : 0 };
  }).sort((a, b) => a.itemName.localeCompare(b.itemName, 'uk'));

  return { rows, items: result };
};

// Залишок по кожній позиції наростаючим підсумком (для Головної сторінки)
export const calculateWarehouseStock = (movements) => {
  const stocks = {};
  return movements.map(m => {
    const qty = parseFloat(m.qty) || 0;
    const key = m.itemName;
    stocks[key] = (stocks[key] || 0) + (opOf(m) === 'in' ? qty : -qty);
    return { ...m, balance: parseFloat(stocks[key].toFixed(4)) };
  });
};
