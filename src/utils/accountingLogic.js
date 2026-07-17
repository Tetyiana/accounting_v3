export const calculateRunningBalance = (transactions) => {
  let balance = 0;
  return transactions.map(t => {
    const amount = parseFloat(t.amount) || 0;
    balance += t.type === 'income' ? amount : -amount;
    return { ...t, balance: parseFloat(balance.toFixed(2)) };
  });
};

// ─── Спрощений план рахунків для ФОП ─────────────────────────────────
export const LEDGER_ACCOUNTS = {
  '301': 'Каса',
  '311': 'Банківський рахунок',
  '641': 'Розрахунки за податками',
  '651': 'Розрахунки за ЄСВ',
  '661': 'Розрахунки з оплати праці',
  '701': 'Доход від реалізації',
  '84':  'Інші операційні витрати',
};

const acc = (code) => ({ code, label: LEDGER_ACCOUNTS[code] || code });
const BUDGET_TAX_RE  = /дпс|казначей/i;
const BUDGET_ESV_RE  = /пфу|пенсійн/i;

// Формує спрощені бухгалтерські проводки (Дт/Кт) на основі операцій журналу.
// Касовий метод: доходи/витрати визнаються по факту руху коштів — без рахунку 361/631,
// що відповідає практиці обліку ФОП на спрощеній системі.
export const buildLedgerEntries = (transactions = []) => {
  const sorted = [...transactions].sort((a, b) => (a.date||'').localeCompare(b.date||''));

  return sorted.map(t => {
    const amount   = +t.amount || 0;
    const cashAcc  = t.paymentMethod === 'cash' ? acc('301') : acc('311');
    let debit, credit;

    if (t.type === 'income') {
      debit  = cashAcc;
      credit = acc('701');
    } else {
      // Витрата
      if (t.payrollRecordId) {
        if (BUDGET_TAX_RE.test(t.counterparty||'')) debit = acc('641');
        else if (BUDGET_ESV_RE.test(t.counterparty||'')) debit = acc('651');
        else debit = acc('661'); // виплата з/п на руки
      } else if (BUDGET_TAX_RE.test(t.counterparty||'')) {
        debit = acc('641');
      } else if (BUDGET_ESV_RE.test(t.counterparty||'')) {
        debit = acc('651');
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
