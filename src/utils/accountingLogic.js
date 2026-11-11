import { buildPartyIndex } from './settlements';

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
  '63': 'Розрахунки з постачальниками',
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
const round2 = (n) => Math.round((+n || 0) * 100) / 100;

const ACT_LABEL = { act: 'Акт', delivery_note: 'Накладна', return_act: 'Акт повернення' };

// Проводки за спрощеним планом, метод нарахування:
//   акт / накладна покупцю     → Дт 36 — Кт 70   (ПДВ з акта: Дт 36 — Кт 64)
//   акт повернення від покупця → Дт 70 — Кт 36
//   акт / накладна постачальника → Дт 84 — Кт 63
//   надходження від покупця    → Дт 30/31 — Кт 36 (закриває акти; без акта — аванс)
//   надходження без документів → Дт 30/31 — Кт 70 (контрагент без актів і рахунків)
//   оплата постачальнику       → Дт 63   — Кт 30/31
//   expense (звичайна)         → Дт 84   — Кт 30/31
//   expense (зарплата)         → Дт 66   — Кт 30/31
//   expense (податки)          → Дт 64/65 — Кт 30/31
//   refund_out (покупцю)       → Дт 36 (або 70, якщо покупець без документів) — Кт 30/31
//   refund_in (від пост.)      → Дт 30/31 — Кт 63 (або 68)
//   non_income (не дохід)      → Дт 30/31 — Кт 68
//
// docs = { acts, invoices, payments }. Без docs проводки будуються лише з операцій
// журналу, а покупців і постачальників немає з чого визначити.
export const buildLedgerEntries = (transactions = [], docs = {}) => {
  const { acts = [], invoices = [], payments = [] } = docs;
  const idx = buildPartyIndex({ acts, invoices, payments });
  const entries = [];

  // ── Акти і накладні ──
  acts.forEach(a => {
    const total = round2(a.total);
    if (!a.date || total <= 0) return;
    const incoming = idx.actDirection(a) === 'incoming';
    const isReturn = a.type === 'return_act';
    const vat = Math.min(round2(a.vatAmount), total);
    const net = round2(total - vat);
    const base = {
      date: a.date,
      counterparty: idx.actParty(a),
      description: `${ACT_LABEL[a.type] || 'Акт'} №${a.number || 'б/н'}`,
      sourceType: 'act', sourceId: a.id,
    };
    const push = (suffix, debit, credit, amount, note = '') => {
      if (amount > 0) entries.push({ ...base, id: `act_${a.id}_${suffix}`, debit, credit, amount, description: base.description + note });
    };
    if (!incoming) {
      if (isReturn) { push('n', acc('70'), acc('36'), net); push('v', acc('64'), acc('36'), vat, ' (ПДВ)'); }
      else          { push('n', acc('36'), acc('70'), net); push('v', acc('36'), acc('64'), vat, ' (ПДВ)'); }
    } else {
      if (isReturn) { push('n', acc('63'), acc('84'), net); push('v', acc('63'), acc('64'), vat, ' (ПДВ)'); }
      else          { push('n', acc('84'), acc('63'), net); push('v', acc('64'), acc('63'), vat, ' (ПДВ)'); }
    }
  });

  // ── Операції банку і каси ──
  transactions.forEach(t => {
    const amount   = +t.amount || 0;
    const cashAcc  = t.paymentMethod === 'cash' ? acc('30') : acc('31');
    const who      = idx.partyOfTx(t);
    let debit, credit;

    if (t.type === 'refund_out') {
      debit  = who?.side === 'customer' ? acc('36') : acc('70');
      credit = cashAcc;
    } else if (t.type === 'refund_in') {
      debit  = cashAcc;
      credit = who?.side === 'supplier' ? acc('63') : acc('68');
    } else if (t.type === 'non_income') {
      debit  = cashAcc;
      credit = acc('68');
    } else if (t.type === 'income') {
      debit  = cashAcc;
      credit = who?.side === 'customer' ? acc('36') : acc('70');
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
      } else if (who?.side === 'supplier') {
        debit = acc('63');
      } else {
        debit = acc('84');
      }
      credit = cashAcc;
    }

    entries.push({
      id: t.id,
      date: t.date,
      counterparty: t.counterparty || '',
      description: t.description || '',
      amount,
      debit, credit,
      sourceType: 'transaction', sourceId: t.id,
      partyKey: who?.key || '',
    });
  });

  return entries.sort((a, b) => (a.date||'').localeCompare(b.date||''));
};
