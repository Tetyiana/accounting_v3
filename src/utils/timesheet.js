// Табель обліку робочого часу і чисельність працівників.
// Умовні позначення — з типової форми № П-5 (наказ Держкомстату від 05.12.2008 № 489):
//   Р — години роботи, В — щорічна основна відпустка,
//   НА — відпустка без збереження зарплати за згодою сторін,
//   ТН — оплачувана тимчасова непрацездатність.
// Вихідні (сб, нд) не позначаються. Святкові дні не виділяються: у воєнний час
// норми про святкові й неробочі дні не застосовуються (ч. 6 ст. 6 Закону № 2136-IX).

export const TS_CODES = { work: 'Р', annual: 'В', unpaid: 'НА', sick: 'ТН' };
export const HOURS_PER_DAY = 8;

const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const addDays = (isoDate, n) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
};
export const daysInMonth = (period) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};
const isWeekend = (isoDate) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow === 0 || dow === 6;
};

// Кінець періоду відсутності: endDate або початок + days − 1
export const leaveEnd = (l) => {
  if (l.endDate) return String(l.endDate).slice(0, 10);
  const n = Math.max(1, Math.round(+l.days || 1));
  return addDays(String(l.startDate).slice(0, 10), n - 1);
};
const leaveKind = (l) => l.type || l.leaveType || 'annual';

export const isEmployedOn = (emp, isoDate) => {
  const hire = emp.hireDate ? String(emp.hireDate).slice(0, 10) : '';
  const fire = emp.fireDate ? String(emp.fireDate).slice(0, 10) : '';
  if (hire && isoDate < hire) return false;
  if (fire && isoDate > fire) return false;   // день звільнення — останній день роботи
  return true;
};

// Табель одного працівника за місяць
export const buildEmployeeTimesheet = (emp, period, leaveRecords = []) => {
  const [y, m] = period.split('-').map(Number);
  const n = daysInMonth(period);
  const leaves = leaveRecords
    .filter(l => l.employeeId === emp.id && l.startDate && ['annual', 'unpaid', 'sick'].includes(leaveKind(l)))
    .map(l => ({ kind: leaveKind(l), from: String(l.startDate).slice(0, 10), to: leaveEnd(l) }));
  const days = [];
  const sum = { workDays: 0, hours: 0, annual: 0, unpaid: 0, unpaidWork: 0, sick: 0, employed: 0, normDays: 0 };
  let unpaidFrom = '', unpaidTo = '';
  for (let d = 1; d <= n; d++) {
    const date = iso(y, m, d);
    const weekend = isWeekend(date);
    if (!weekend) sum.normDays++;
    if (!isEmployedOn(emp, date)) { days.push({ d, code: '', hours: 0, weekend, off: true }); continue; }
    sum.employed++;
    const lv = leaves.find(l => date >= l.from && date <= l.to);
    if (lv) {
      sum[lv.kind]++;
      if (lv.kind === 'unpaid') {
        if (!weekend) sum.unpaidWork++;
        if (!unpaidFrom) unpaidFrom = date;
        unpaidTo = date;
      }
      days.push({ d, code: TS_CODES[lv.kind], hours: 0, weekend });
    } else if (weekend) {
      days.push({ d, code: '', hours: 0, weekend });
    } else {
      sum.workDays++; sum.hours += HOURS_PER_DAY;
      days.push({ d, code: TS_CODES.work, hours: HOURS_PER_DAY, weekend });
    }
  }
  const fullMonthEmployed = sum.employed === n;
  return { employee: emp, days, ...sum, unpaidFrom, unpaidTo, fullMonthEmployed };
};

export const buildTimesheet = (employees, period, leaveRecords = []) =>
  employees
    .map(e => buildEmployeeTimesheet(e, period, leaveRecords))
    .filter(t => t.employed > 0)
    .sort((a, b) => (a.employee.fullName || '').localeCompare(b.employee.fullName || '', 'uk'));

// Середньооблікова кількість штатних працівників за місяць: сума облікової
// кількості за кожен календарний день / кількість днів місяця
// (Інструкція зі статистики кількості працівників, наказ Держкомстату від 28.09.2005 № 286).
// Працівники у відпустці без збереження чи на лікарняному з облікового складу не виключаються.
export const avgHeadcountMonth = (employees, period, filter = () => true) => {
  const [y, m] = period.split('-').map(Number);
  const n = daysInMonth(period);
  let total = 0;
  for (const e of employees) {
    if (!filter(e)) continue;
    for (let d = 1; d <= n; d++) if (isEmployedOn(e, iso(y, m, d))) total++;
  }
  return total / n;
};

export const quarterPeriods = (year, quarter) =>
  [quarter * 3 - 2, quarter * 3 - 1, quarter * 3].map(mm => `${year}-${String(mm).padStart(2, '0')}`);

// За квартал: сума середньомісячних / 3
export const avgHeadcountQuarter = (employees, year, quarter, filter) =>
  quarterPeriods(year, quarter).reduce((s, p) => s + avgHeadcountMonth(employees, p, filter), 0) / 3;
