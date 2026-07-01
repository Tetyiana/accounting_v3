// Всі константи для документообігу: рахунки, акти, накладні, платежі.

export const INVOICE_STATUSES = {
  draft:     { id: 'draft',     label: 'Чернетка',         color: 'muted'   },
  sent:      { id: 'sent',      label: 'Виставлено',       color: 'warning' },
  partial:   { id: 'partial',   label: 'Часткова оплата',  color: 'warning' },
  paid:      { id: 'paid',      label: 'Оплачено',         color: 'success' },
  cancelled: { id: 'cancelled', label: 'Скасовано',        color: 'danger'  },
  overdue:   { id: 'overdue',   label: 'Прострочено',      color: 'danger'  },
};

export const ACT_TYPES = [
  { id: 'act',           label: 'Акт виконаних робіт/послуг' },
  { id: 'delivery_note', label: 'Накладна на товар'          },
  { id: 'return_act',    label: 'Акт повернення'             },
];

export const PAYMENT_METHODS = [
  { id: 'bank',      label: 'Банківський переказ' },
  { id: 'cash',      label: 'Готівка'             },
  { id: 'acquiring', label: 'Еквайринг (карта)'  },
];

export const VAT_RATES = [
  { id: 'no_vat', label: 'Без ПДВ', rate: 0    },
  { id: '0',      label: '0%',      rate: 0    },
  { id: '7',      label: '7%',      rate: 0.07 },
  { id: '20',     label: '20%',     rate: 0.20 },
];

export const DOC_DIRECTIONS = {
  OUTGOING: 'outgoing', // від нас клієнту (продаж)
  INCOMING: 'incoming', // від постачальника нам (закупівля)
};

export const UNITS = ['шт', 'кг', 'г', 'л', 'мл', 'м', 'м²', 'м³', 'уп', 'год', 'послуга'];

export const EMPTY_ITEM = { id: '1', name: '', qty: 1, unit: 'шт', price: '', vatRate: 'no_vat' };

export const EMPTY_INVOICE = {
  id: null,
  direction: 'outgoing',
  number: '',
  date: new Date().toISOString().slice(0, 10),
  dueDate: '',
  clientName: '',
  clientIpn: '',
  clientAddress: '',
  items: [{ ...EMPTY_ITEM }],
  notes: '',
  status: 'draft',
  createdAt: null,
};

export const EMPTY_ACT = {
  id: null,
  invoiceId: null,
  type: 'act',
  direction: 'outgoing',
  number: '',
  date: new Date().toISOString().slice(0, 10),
  clientName: '',
  clientIpn: '',
  clientAddress: '',
  items: [],
  notes: '',
  status: 'draft', // draft | signed
};

export const EMPTY_PAYMENT = {
  id: null,
  invoiceId: null,
  direction: 'outgoing',
  date: new Date().toISOString().slice(0, 10),
  amount: '',
  paymentMethod: 'bank',
  acquiringCommission: '',
  notes: '',
};
