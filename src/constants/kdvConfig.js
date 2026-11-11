// Конфігурація Книги доходів (і витрат) за групами оподаткування.
// Наказ МФУ №1637 — гр. 1–3; наказ Мінфіну від 13.05.2021 № 261 — загальна система.

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

// Загальна система — графи типової форми (наказ Мінфіну від 13.05.2021 № 261).
// Гр. 5 (реквізити документа про витрати) — у колонці «Документ».
// Гр. 10 (амортизація) програма не розраховує.
const GENERAL_COLS = [
  { key: 'income',     label: 'Гр. 2. Дохід, грн',                      align: 'right', total: true },
  { key: 'refund',     label: 'Гр. 3. Повернуто, грн',                  align: 'right', total: true },
  { key: 'incomeAdj',  label: 'Гр. 4. Скоригований дохід, грн',         align: 'right', total: true },
  { key: 'expGoods',   label: 'Гр. 6. Товари, роботи, послуги, грн',    align: 'right', total: true },
  { key: 'expPayroll', label: 'Гр. 7. Оплата праці і нарахування, грн', align: 'right', total: true },
  { key: 'expTaxes',   label: 'Гр. 8. Податки, збори, ЄСВ, грн',        align: 'right', total: true },
  { key: 'expOther',   label: 'Гр. 9. Інші витрати, грн',               align: 'right', total: true },
  { key: 'netIncome',  label: 'Гр. 11. Чистий дохід, грн',              align: 'right', total: true },
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
    title:    'Облік доходів і витрат (типова форма)',
    subtitle: 'Наказ Мінфіну від 13.05.2021 № 261',
    incomeOnly: false,
    columns: [...BASE_COLS, ...GENERAL_COLS],
  },
  'general_vat': {
    title:    'Облік доходів і витрат (типова форма)',
    subtitle: 'Наказ Мінфіну від 13.05.2021 № 261 · суми без ПДВ',
    incomeOnly: false,
    columns: [...BASE_COLS, ...GENERAL_COLS],
  },
};

export const QUARTER_LABEL = ['I квартал', 'II квартал', 'III квартал', 'IV квартал'];
export const HALF_LABEL    = ['I півріччя', 'II півріччя'];
