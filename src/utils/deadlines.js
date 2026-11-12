// Контроль термінів: податки, звітність, зарплата.
// Повертає список найближчих дедлайнів для ФОПа з урахуванням групи,
// модулів і фактичного стану (невиплачені нарахування тощо).
//
// Правила, закладені в дати:
//   • «до 20 числа» = останній день 19-те (ЄСВ, аванси ПДФО/ВЗ загальної системи);
//     «не пізніше 20 числа» (аванс ЄП і ВЗ груп 1, 2) = 20-те включно.
//   • Строк ПОДАННЯ звітності, що припав на суботу/неділю, переноситься на
//     наступний робочий день (п. 49.20 ПКУ). Так само — строк сплати, який
//     рахується від граничного строку подання (п. 57.1 ПКУ), і строк сплати ЄСВ.
//   • Щомісячний аванс ЄП і ВЗ груп 1, 2 НЕ переносимо: ДПС вважає, що
//     перенесення тут не діє, тож показуємо безпечну (ранішу) дату.
//   • Святкові дні не враховуються.

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Перенесення з вихідного на наступний робочий день
export const shiftWeekend = (d) => {
  const x = new Date(d);
  while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() + 1);
  return x;
};

// Останній день кварталу q (1..4) року y
const quarterEnd = (y, q) => new Date(y, q * 3, 0);
const Q_NAME = ['І', 'ІІ', 'ІІІ', 'IV'];

// Граничний строк подання: N календарних днів після кінця періоду
const reportDue = (periodEnd, days) => shiftWeekend(addDays(periodEnd, days));
// Сплата: протягом 10 к.д. після граничного строку подання
const payDue = (reportDeadline) => shiftWeekend(addDays(reportDeadline, 10));

export const buildDeadlines = ({
  taxGroup, isVatPayer, esvExempt = false, payrollRecords = [], employees = [], today = new Date(), licenses = [],
}) => {
  const now = startOfDay(today);
  const y = now.getFullYear(), m = now.getMonth(); // m: 0..11
  const list = [];
  const push = (date, title, kind = 'tax') => {
    const dt = Math.round((startOfDay(date) - now) / 86400000);
    if (dt >= -14 && dt <= 45) list.push({ date: iso(date), title, kind, daysTo: dt });
  };

  const isG12 = taxGroup === '1' || taxGroup === '2';
  const isG3  = taxGroup === '3_5' || taxGroup === '3_3_vat';
  const isG4  = taxGroup === '4';
  const isGeneral = taxGroup === 'general' || taxGroup === 'general_vat';
  const vat = isVatPayer || taxGroup === '3_3_vat' || taxGroup === 'general_vat';

  // Попередній і поточний квартали
  const curQ = Math.floor(m / 3) + 1;
  const prevQ = curQ === 1 ? 4 : curQ - 1;
  const prevQYear = curQ === 1 ? y - 1 : y;
  const prevQEnd = quarterEnd(prevQYear, prevQ);
  const thisQEnd = quarterEnd(y, curQ);

  if (isG12) {
    // Авансовий ЄП + фіксований ВЗ — щомісяця не пізніше 20 числа (без перенесення)
    push(new Date(y, m, 20), 'Сплата ЄП і ВЗ (аванс за поточний місяць) — 1-2 група');
    push(new Date(y, m + 1, 20), 'Сплата ЄП і ВЗ (аванс за наступний місяць) — 1-2 група');
    // Річна декларація — протягом 60 к.д. після закінчення року
    [y - 1, y].forEach((ry) =>
      push(reportDue(new Date(ry, 11, 31), 60), `Подання річної декларації ЄП за ${ry} рік (1-2 група)`, 'report'));
  }

  if (isG3) {
    // Квартальна (і за рік теж): подання — 40 к.д. після кварталу, сплата — ще 10 к.д.
    const prevDue = reportDue(prevQEnd, 40);
    push(prevDue, prevQ === 4
      ? `Подання декларації ЄП за ${prevQYear} рік`
      : `Подання декларації ЄП за ${Q_NAME[prevQ - 1]} кв. ${prevQYear}`, 'report');
    push(payDue(prevDue), `Сплата ЄП і ВЗ за ${Q_NAME[prevQ - 1]} кв. ${prevQYear}`);
    const nextDue = reportDue(thisQEnd, 40);
    push(nextDue, `Подання декларації ЄП за ${Q_NAME[curQ - 1]} кв. ${y}`, 'report');
  }

  if (isG4) {
    // Декларація — до 20 лютого поточного року; ЄП — щокварталу протягом
    // 30 к.д. після кварталу (10% / 10% / 50% / 30% річної суми).
    push(shiftWeekend(new Date(y, 1, 20)), `Подання декларації ЄП 4 групи на ${y} рік`, 'report');
    const share = ['10%', '10%', '50%', '30%'];
    push(shiftWeekend(addDays(prevQEnd, 30)), `Сплата ЄП 4 групи за ${Q_NAME[prevQ - 1]} кв. ${prevQYear} (${share[prevQ - 1]} річної суми)`);
    push(shiftWeekend(addDays(thisQEnd, 30)), `Сплата ЄП 4 групи за ${Q_NAME[curQ - 1]} кв. ${y} (${share[curQ - 1]} річної суми)`);
    // Фіксований ВЗ — щомісяця не пізніше 20 числа
    push(new Date(y, m, 20), 'Сплата ВЗ (фіксований, за поточний місяць) — 4 група');
    push(new Date(y, m + 1, 20), 'Сплата ВЗ (фіксований, за наступний місяць) — 4 група');
  }

  if (isGeneral) {
    // Аванси ПДФО і ВЗ за І–ІІІ квартали — до 20 числа місяця після кварталу
    if (prevQ !== 4) push(new Date(prevQYear, prevQ * 3, 19), `Аванс ПДФО і ВЗ за ${Q_NAME[prevQ - 1]} кв. ${prevQYear} (загальна система)`);
    if (curQ !== 4)  push(new Date(y, curQ * 3, 19), `Аванс ПДФО і ВЗ за ${Q_NAME[curQ - 1]} кв. ${y} (загальна система)`);
    // Декларація про майновий стан і доходи — до 1 травня; сплата — ще 10 к.д.
    const declDue = shiftWeekend(new Date(y, 3, 30));
    push(declDue, `Подання декларації про майновий стан і доходи за ${y - 1} рік`, 'report');
    push(payDue(declDue), `Сплата ПДФО і ВЗ за декларацією за ${y - 1} рік`);
  }

  // ЄСВ за себе — щокварталу до 20 числа місяця після кварталу (останній день — 19-те)
  if (!esvExempt) {
    push(shiftWeekend(new Date(prevQYear, prevQ * 3, 19)), `Сплата ЄСВ за себе за ${Q_NAME[prevQ - 1]} кв. ${prevQYear}`);
    push(shiftWeekend(new Date(y, curQ * 3, 19)), `Сплата ЄСВ за себе за ${Q_NAME[curQ - 1]} кв. ${y}`);
  }

  if (vat) {
    // Декларація з ПДВ — 20 к.д. після місяця; сплата — ще 10 к.д.
    [m - 1, m].forEach((mm) => {
      const monthEnd = new Date(y, mm + 1, 0);
      const due = reportDue(monthEnd, 20);
      const label = `${pad(monthEnd.getMonth() + 1)}.${monthEnd.getFullYear()}`;
      push(due, `Подання декларації з ПДВ за ${label}`, 'report');
      push(payDue(due), `Сплата ПДВ за ${label}`);
    });
  }

  // Зарплата: якщо є активні працівники
  const hasEmployees = employees.some(e => e.isActive);
  if (hasEmployees) {
    push(new Date(y, m, 22), 'Аванс зарплати (за 1-15 число)', 'payroll');
    push(new Date(y, m, 7),  'Остаточна виплата з/п за попередній місяць', 'payroll');
    push(new Date(y, m + 1, 7), 'Остаточна виплата з/п за поточний місяць', 'payroll');
    // Податковий розрахунок (ПДФО/ВЗ/ЄСВ найманих) — 40 к.д. після кварталу
    push(reportDue(prevQEnd, 40), `Податковий розрахунок (ПДФО/ВЗ/ЄСВ найманих) за ${Q_NAME[prevQ - 1]} кв. ${prevQYear}`, 'report');
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

  // Ліцензії на роздрібну торгівлю (Закон № 3817-IX): черговий платіж — до початку кварталу.
  // Роздрібний акциз з алкоголю: декларація до 20 числа, сплата — ще 10 календарних днів.
  if (licenses.length) {
    push(new Date(y, curQ * 3, 0), `Плата за ліцензії за ${Q_NAME[curQ % 4]} квартал (до початку кварталу)`, 'license');
    if (licenses.some(l => l.kind === 'alcohol' || l.kind === 'cider')) {
      const due = shiftWeekend(new Date(y, m, 20));
      push(due, 'Декларація акцизного податку (роздрібний акциз) за попередній місяць', 'excise');
      push(addDays(due, 10), 'Сплата роздрібного акцизу за попередній місяць', 'excise');
    }
  }

  return list.sort((a, b) => a.date.localeCompare(b.date));
};
