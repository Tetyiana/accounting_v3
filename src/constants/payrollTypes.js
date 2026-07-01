// Всі константи модуля зарплати.
// Ставки актуальні станом на 2025-2026 рр. (Україна).

export const PDFO_RATE   = 0.18;
export const VZ_RATE     = 0.05;
export const ESV_RATE    = 0.22;
export const MIN_WAGE    = 8647;   // мінімальна зарплата (грн, 2026 р.)
export const ESV_MAX_BASE = MIN_WAGE * 15;
export const AVG_CALENDAR_DAYS = 29.3;
export const ANNUAL_LEAVE_DAYS = 24;

export const INCOME_CODE_SALARY    = '101'; // зарплата
export const INCOME_CODE_SICK      = '101'; // лікарняний (перші 5 днів)
export const INCOME_CODE_LEAVE     = '101'; // відпускні
export const INCOME_CODE_COMPENSATION = '101'; // компенсація відпустки

export const PERSON_TYPE_EMPLOYEE = '1';   // код категорії застрахованої особи

export const DEDUCTION_TYPES = [
  { id: 'alimony',    label: 'Аліменти'         },
  { id: 'executive',  label: 'Виконавчий лист'  },
];

export const DEDUCTION_BASES = [
  { id: 'percent', label: 'Відсоток від нетто' },
  { id: 'fixed',   label: 'Фіксована сума'     },
];

export const LEAVE_TYPES = [
  { id: 'annual',       label: 'Щорічна відпустка'           },
  { id: 'sick',         label: 'Лікарняний'                  },
  { id: 'compensation', label: 'Компенсація за невикористану відпустку' },
  { id: 'unpaid',       label: 'Відпустка без збереження зарплати' },
];

export const PAYROLL_STATUSES = [
  { id: 'draft',    label: 'Чернетка'  },
  { id: 'approved', label: 'Затверджено' },
  { id: 'paid',     label: 'Виплачено'  },
];

export const EMPTY_EMPLOYEE = {
  id:               null,
  fullName:         '',
  rnokpp:           '',
  position:         '',
  salary:           '',    // місячний оклад
  iban:             '',
  hireDate:         '',
  terminationDate:  null,
  isActive:         true,
  leaveEntitlement: ANNUAL_LEAVE_DAYS,
  leaveAccrued:     0,     // накопичено (к.д.)
  leaveUsed:        0,     // використано (к.д.)
  notes:            '',
  createdAt:        null,
};

export const EMPTY_PAYROLL = {
  id:               null,
  employeeId:       null,
  period:           '',    // YYYY-MM
  // Нарахування
  grossSalary:      0,     // оклад за відпрацьований час
  sickDays:         0,
  sickPayPercent:   100,
  sickPayAmount:    0,
  leaveDays:        0,
  leavePayAmount:   0,
  compensationDays: 0,     // дні компенсації при звільненні
  compensationAmount: 0,
  unpaidDays:       0,     // відпустка за власний рахунок (р.д.)
  workingDaysInMonth: 21,  // робочих днів у місяці (для розрахунку денної ставки)
  unpaidDeductionAmount: 0,// утримання за ВВР
  otherAccruals:    0,
  totalGross:       0,
  // Утримання з працівника
  pdfo:             0,
  vz:               0,
  deductions:       [],    // [{type,label,base,value,amount}]
  totalDeductions:  0,
  // До виплати
  netPay:           0,
  // Нарахування роботодавця
  esv:              0,
  // Статус
  status:           'draft',
  paidDate:         null,
  notes:            '',
  createdAt:        null,
};
