export const calculateRunningBalance = (transactions) => {
  let balance = 0;
  return transactions.map(t => {
    const amount = parseFloat(t.amount) || 0;
    balance += t.type === 'income' ? amount : -amount;
    return { ...t, balance: parseFloat(balance.toFixed(2)) };
  });
};

// ─── Спрощений план рахунків (наказ Мінфіну від 19.04.2001 №186) ─────
// Двозначні коди — придатні для ФОП і малих ЮО, що обрали спрощений облік.
export const LEDGER_ACCOUNTS = {
  '30': 'Готівка',
  '31': 'Рахунки в банках',
  '36': 'Розрахунки з покупцями',
  '37': 'Розрахунки з різними дебіторами',
  '64': 'Розрахунки за податками',
  '65': 'Розрахунки за страхуванням (ЄСВ)',
  '66': 'Розрахунки з оплати праці',
  '68': 'Розрахунки за іншими операціями',
  '70': 'Дохід від реалізації',
  '74': 'Інші доходи',
  '79': 'Фінансові результати',
  '84': 'Витрати',
};

const acc = (code) => ({ code, label: LEDGER_ACCOUNTS[code] || code });
const BUDGET_TAX_RE  = /дпс|казначей/i;
const BUDGET_ESV_RE  = /пфу|пенсійн/i;

// Проводки за спрощеним планом, касовий метод:
//   income                     → Дт 30/31 — Кт 70   (виручка)
//   expense (звичайна)         → Дт 84   — Кт 30/31
//   expense (зарплата)         → Дт 66   — Кт 30/31
//   expense (податки)          → Дт 64/65 — Кт 30/31
//   refund_out (клієнту)       → Дт 70   — Кт 30/31 (сторно доходу)
//   refund_in (від пост.)      → Дт 30/31 — Кт 68
//   non_income (не дохід)      → Дт 30/31 — Кт 68
export const buildLedgerEntries = (transactions = []) => {
  const sorted = [...transactions].sort((a, b) => (a.date||'').localeCompare(b.date||''));

  return sorted.map(t => {
    const amount   = +t.amount || 0;
    const cashAcc  = t.paymentMethod === 'cash' ? acc('30') : acc('31');
    let debit, credit;

    if (t.type === 'refund_out') {
      debit  = acc('70');
      credit = cashAcc;
    } else if (t.type === 'refund_in') {
      debit  = cashAcc;
      credit = acc('68');
    } else if (t.type === 'non_income') {
      debit  = cashAcc;
      credit = acc('68');
    } else if (t.type === 'income') {
      debit  = cashAcc;
      credit = acc('70');
    } else {
      // Витрата
      if (t.payrollRecordId) {
        if (BUDGET_TAX_RE.test(t.counterparty||'')) debit = acc('64');
        else if (BUDGET_ESV_RE.test(t.counterparty||'')) debit = acc('65');
        else debit = acc('66');
      } else if (BUDGET_TAX_RE.test(t.counterparty||'')) {
        debit = acc('64');
      } else if (BUDGET_ESV_RE.test(t.counterparty||'')) {
        debit = acc('65');
      } else {
        debit = acc('84');
      }
      credit = cashAcc;
    }

    return {
      id: t.id,
      date: t.date,
      counterparty: t.counterparty || '',
      description: t.description || '',
      amount,
      debit, credit,
    };
  });
};
