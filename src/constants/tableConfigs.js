// Єдине джерело правди для структури таблиць у всьому додатку.
// Щоб додати/прибрати колонку (наприклад "Серія" або "ПДВ") — міняємо рядок
// тут, компоненти таблиць (DynamicTable + views) не чіпаємо.

export const TABLE_CONFIGS = {
  JOURNAL: {
    columns: [
      { key: 'date',         label: 'Дата',        align: 'left'  },
      { key: 'type',         label: 'Тип',         align: 'left'  },
      { key: 'counterparty', label: 'Контрагент',  align: 'left'  },
      { key: 'description',  label: 'Примітка',    align: 'left'  },
      { key: 'amount',       label: 'Сума, грн',   align: 'right' },
      { key: 'balance',      label: 'Баланс, грн', align: 'right' },
    ],
  },
  WAREHOUSE: {
    columns: [
      { key: 'date',     label: 'Дата',          align: 'left'  },
      { key: 'itemName', label: 'Найменування',  align: 'left'  },
      { key: 'batch',    label: 'Партія',        align: 'left'  },
      { key: 'sku',      label: 'Артикул',       align: 'left'  },
      { key: 'operation',label: 'Операція',      align: 'left'  },
      { key: 'qty',      label: 'Кількість',     align: 'right' },
      { key: 'price',    label: 'Ціна, грн',     align: 'right' },
      { key: 'balance',  label: 'Залишок',       align: 'right' },
    ],
  },
  DEBTS: {
    columns: [
      { key: 'date',         label: 'Дата виникнення', align: 'left'  },
      { key: 'type',         label: 'Тип',             align: 'left'  },
      { key: 'counterparty', label: 'Контрагент',      align: 'left'  },
      { key: 'amount',       label: 'Сума, грн',       align: 'right' },
      { key: 'dueDate',      label: 'Термін оплати',   align: 'left'  },
      { key: 'status',       label: 'Статус',          align: 'left'  },
    ],
  },
  VAT_INVOICES: {
    columns: [
      { key: 'date',         label: 'Дата',          align: 'left'  },
      { key: 'number',       label: '№ накладної',   align: 'left'  },
      { key: 'direction',    label: 'Напрямок',      align: 'left'  },
      { key: 'counterparty', label: 'Контрагент',    align: 'left'  },
      { key: 'amount',       label: 'Сума без ПДВ',  align: 'right' },
      { key: 'vatAmount',    label: 'ПДВ 20%',       align: 'right' },
      { key: 'total',        label: 'Разом',         align: 'right' },
    ],
  },
};

export const ENTITY_TYPES = {
  BANK:      'bank',
  WAREHOUSE: 'warehouse',
  DEBTORS:   'debtors',
  CREDITORS: 'creditors',
};

export const ENTITY_LABELS = {
  [ENTITY_TYPES.BANK]:      'Банківський рахунок',
  [ENTITY_TYPES.WAREHOUSE]: 'Склад (сировина/продукція)',
  [ENTITY_TYPES.DEBTORS]:   'Дебітори',
  [ENTITY_TYPES.CREDITORS]: 'Кредитори',
};

export const DEBT_TYPES = [
  { id: 'debtor',   label: 'Дебітор (винні нам)' },
  { id: 'creditor', label: 'Кредитор (винні ми)' },
];

export const DEBT_STATUSES = [
  { id: 'pending',  label: 'Очікує' },
  { id: 'paid',     label: 'Погашено' },
  { id: 'overdue',  label: 'Прострочено' },
];
