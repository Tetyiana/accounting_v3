// Модулі підписки: тарифікація по-модульно на кожного ФОПа.
export const MODULES = [
  { id: 'base',      label: 'База',            price: 100, required: true,
    desc: 'Продажі/закупівлі, журнал операцій, книга доходів, декларація ЄП, реєстр документів' },
  { id: 'warehouse', label: 'Склад',           price: 50,
    desc: 'Рух ТМЦ, залишки, видаткові накладні' },
  { id: 'payroll',   label: 'Зарплата і кадри', price: 100,
    desc: 'Нарахування, аванс/виплата, ЄСВ, накази, звітність' },
  { id: 'vat',       label: 'ПДВ',             price: 75,
    desc: 'Реєстр ПН, розрахунок, декларація з ПДВ' },
  { id: 'rro',       label: 'ПРРО (Checkbox)', price: 50,
    desc: 'Фіскалізація чеків, зміни, X/Z-звіти' },
];
export const modulePrice = (id) => MODULES.find(m => m.id === id)?.price || 0;
