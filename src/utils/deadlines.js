// Контроль термінів: податки, звітність, зарплата.
// Повертає список найближчих дедлайнів для ФОПа з урахуванням групи,
// модулів і фактичного стану (невиплачені нарахування тощо).

const iso = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const daysTo = (dateStr) => Math.ceil((new Date(dateStr) - new Date(iso(new Date()))) / 86400000);

// Кінець кварталу для дати
const quarterEnd = (y, q) => new Date(y, q * 3, 0); // q: 1..4

export const buildDeadlines = ({ taxGroup, isVatPayer, payrollRecords = [], employees = [] }) => {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(); // m: 0..11
  const list = [];
  const push = (date, title, kind = 'tax') => {
    const dt = daysTo(iso(date));
    if (dt >= -14 && dt <= 45) list.push({ date: iso(date), title, kind, daysTo: dt });
  };

  const isG12 = taxGroup === '1' || taxGroup === '2';
  const isG3  = taxGroup === '3_5' || taxGroup === '3_3_vat';

  if (isG12) {
    // Авансовий ЄП + фіксований ВЗ — щомісяця до 20 числа (включно)
    push(new Date(y, m, 20), 'Сплата ЄП і ВЗ (аванс за місяць) — 1-2 група');
    push(new Date(y, m + 1, 20), 'Сплата ЄП і ВЗ (аванс) — наступний місяць');
    // Річна декларація — до 1 березня
    push(new Date(now < new Date(y, 2, 1) ? y : y + 1, 2, 1), 'Подання річної декларації ЄП (1-2 гр.)', 'report');
  }

  if (isG3) {
    // Квартальна: подання 40 к.д. після кварталу, сплата ще 10 к.д.
    const curQ = Math.floor(m / 3) + 1;
    const prevQEnd = quarterEnd(curQ === 1 ? y - 1 : y, curQ === 1 ? 4 : curQ - 1);
    push(addDays(prevQEnd, 40), `Подання декларації ЄП за ${curQ === 1 ? 'IV' : ['І','ІІ','ІІІ'][curQ - 2]} кв.`, 'report');
    push(addDays(prevQEnd, 50), 'Сплата ЄП і ВЗ за квартал');
    const thisQEnd = quarterEnd(y, curQ);
    push(addDays(thisQEnd, 40), 'Подання декларації ЄП (наст. квартал)', 'report');
  }

  // ЄСВ за себе — щокварталу до 20 числа місяця після кварталу
  const curQ = Math.floor(m / 3) + 1;
  const esvQEnd = quarterEnd(curQ === 1 ? y - 1 : y, curQ === 1 ? 4 : curQ - 1);
  push(addDays(new Date(esvQEnd.getFullYear(), esvQEnd.getMonth() + 1, 19), 1), 'Сплата ЄСВ за себе (за квартал)');
  const nextEsvQEnd = quarterEnd(y, curQ);
  push(new Date(nextEsvQEnd.getFullYear(), nextEsvQEnd.getMonth() + 1, 20), 'Сплата ЄСВ за себе (наст. квартал)');

  if (isVatPayer) {
    push(new Date(y, m, 20), 'Подання декларації з ПДВ (за попередній місяць)', 'report');
    push(new Date(y, m, 30), 'Сплата ПДВ');
  }

  // Зарплата: якщо є активні працівники
  const hasEmployees = employees.some(e => e.isActive);
  if (hasEmployees) {
    push(new Date(y, m, 22), 'Аванс зарплати (за 1-15 число)', 'payroll');
    push(new Date(y, m, 7),  'Остаточна виплата з/п за попередній місяць', 'payroll');
    push(new Date(y, m + 1, 7), 'Остаточна виплата з/п за поточний місяць', 'payroll');
    // Єдина звітність (ПДФО/ВЗ/ЄСВ найманих) — 40 к.д. після кварталу
    push(addDays(esvQEnd, 40), 'Єдина звітність (ПДФО/ВЗ/ЄСВ найманих)', 'report');
  }

  // Стан: незавершені нарахування
  payrollRecords
    .filter(r => r.status === 'approved' || r.status === 'advance_paid')
    .forEach(r => {
      const emp = employees.find(e => e.id === r.employeeId);
      list.push({
        date: iso(now), daysTo: 0, kind: 'action',
        title: `Не завершена виплата з/п: ${emp?.fullName || ''} за ${r.period} (${r.status === 'advance_paid' ? 'виплачено лише аванс' : 'затверджено, не виплачено'})`,
      });
    });

  return list.sort((a, b) => a.date.localeCompare(b.date));
};
