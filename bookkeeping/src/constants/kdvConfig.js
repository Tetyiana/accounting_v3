// Конфігурація Книги доходів (і витрат) за групами оподаткування.
// Наказ МФУ №1637 — гр. 1–3; Наказ МФУ №481 — загальна система.

const INCOME_COLS = [
  { key: 'cash',     label: 'Готівка, грн',        align: 'right' },
  { key: 'bank',     label: 'Безготівкові, грн',   align: 'right' },
  { key: 'acquiring',label: 'Еквайринг, грн',      align: 'right' },
  { key: 'other',    label: 'Інші, грн',           align: 'right' },
  { key: 'income',   label: 'Разом дохід, грн',    align: 'right', total: true },
];

const BASE_COLS = [
  { key: 'num',    label: '№',       align: 'left' },
  { key: 'date',   label: 'Дата',    align: 'left' },
  { key: 'docRef', label: 'Документ',align: 'left' },
];

export const KDV_CONFIGS = {
  '1': {
    title:    'Книга обліку доходів',
    subtitle: 'Наказ МФУ №1637 від 19.06.2015',
    incomeOnly: true,
    columns: [...BASE_COLS, ...INCOME_COLS],
  },
  '2': {
    title:    'Книга обліку доходів',
    subtitle: 'Наказ МФУ №1637 від 19.06.2015',
    incomeOnly: true,
    columns: [...BASE_COLS, ...INCOME_COLS],
  },
  '3_5': {
    title:    'Книга обліку доходів',
    subtitle: 'Наказ МФУ №1637 від 19.06.2015',
    incomeOnly: true,
    columns: [...BASE_COLS, ...INCOME_COLS],
  },
  '3_3_vat': {
    title:    'Книга обліку доходів і витрат',
    subtitle: 'Наказ МФУ №1637 від 19.06.2015',
    incomeOnly: false,
    columns: [
      ...BASE_COLS,
      ...INCOME_COLS,
      { key: 'vatOblig',   label: 'ПДВ зобов., грн', align: 'right' },
      { key: 'expense',    label: 'Витрати, грн',     align: 'right', total: true },
    ],
  },
  'general': {
    title:    'Книга обліку доходів і витрат',
    subtitle: 'Наказ МФУ №481 від 13.05.2021',
    incomeOnly: false,
    columns: [
      ...BASE_COLS,
      { key: 'income',       label: 'Дохід, грн',             align: 'right', total: true },
      { key: 'expenseDoc',   label: 'Витрати з докум., грн',   align: 'right' },
      { key: 'expenseNoDoc', label: 'Витрати без докум., грн', align: 'right' },
      { key: 'totalExpense', label: 'Разом витрати, грн',      align: 'right', total: true },
      { key: 'netIncome',    label: 'Чистий дохід, грн',       align: 'right', total: true },
    ],
  },
  'general_vat': {
    title:    'Книга обліку доходів і витрат',
    subtitle: 'Наказ МФУ №481 від 13.05.2021',
    incomeOnly: false,
    columns: [
      ...BASE_COLS,
      { key: 'income',       label: 'Дохід, грн',             align: 'right', total: true },
      { key: 'vatOblig',     label: 'ПДВ зобов., грн',        align: 'right' },
      { key: 'expenseDoc',   label: 'Витрати з докум., грн',   align: 'right' },
      { key: 'expenseNoDoc', label: 'Витрати без докум., грн', align: 'right' },
      { key: 'totalExpense', label: 'Разом витрати, грн',      align: 'right', total: true },
      { key: 'netIncome',    label: 'Чистий дохід, грн',       align: 'right', total: true },
    ],
  },
};

export const QUARTER_LABEL = ['I квартал', 'II квартал', 'III квартал', 'IV квартал'];
export const HALF_LABEL    = ['I півріччя', 'II півріччя'];
