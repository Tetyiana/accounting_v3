import { buildPartyIndex } from './settlements';

export const MONEY_IN_TYPES = ['income', 'refund_in', 'non_income'];

// Залишки коштів окремо: банк (разом з еквайрингом) і каса
export const cashBalances = (transactions = []) => {
  const r = { bank: 0, cash: 0 };
  transactions.forEach(t => {
    const amount = parseFloat(t.amount) || 0;
    const key = t.paymentMethod === 'cash' ? 'cash' : 'bank';
    r[key] += MONEY_IN_TYPES.includes(t.type) ? amount : -amount;
  });
  return { bank: Math.round(r.bank * 100) / 100, cash: Math.round(r.cash * 100) / 100 };
};

export const calculateRunningBalance = (transactions) => {
  let balance = 0;
  return transactions.map(t => {
    const amount = parseFloat(t.amount) || 0;
    // Надходження: дохід, повернення від постачальника, кошти, що не є доходом
    balance += MONEY_IN_TYPES.includes(t.type) ? amount : -amount;
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
// Автовизначення платежів до бюджету — за контрагентом і призначенням платежу.
const PFU_RE       = /пфу|пенсійн/i;
const TREASURY_RE  = /дпс|казначей|(^|[^а-яіїєґ])г?ук у |дксу/i;
const ESV_WORDS_RE = /(^|[^а-яіїєґ])єсв([^а-яіїєґ]|$)|єдин\S* (соц\S* )?внес/i;
const TAX_WORDS_RE = /єдин\S* подат|військов\S* зб|(^|[^а-яіїєґ])пдфо([^а-яіїєґ]|$)/i;
const PAYROLL_RE   = /зарплат|заробітн\S* плат|аванс з\/п|відпускн|лікарнян/i;

// Рахунки, які можна обрати кореспондуючими для операції банку/каси
export const CORR_ACCOUNTS = ['36', '37', '63', '64', '65', '66', '68', '70', '74', '84'];

const txText = (t) => `${t.counterparty || ''} ${t.description || ''}`;

// Автоматичний кореспондуючий рахунок операції (без урахування явно обраного).
// who — результат partyOfTx: чи це покупець / постачальник з документами.
const autoCorrAccount = (t, who) => {
  if (t.type === 'refund_out') return who?.side === 'customer' ? '36' : '70';
  if (t.type === 'refund_in')  return who?.side === 'supplier' ? '63' : '68';
  if (t.type === 'non_income') return '68';
  if (t.type === 'income')     return who?.side === 'customer' ? '36' : '70';
  // Витрата
  const text = txText(t);
  if (PFU_RE.test(text)) return '65';
  // ЄСВ теж сплачують на рахунки Казначейства — розрізняємо за призначенням платежу
  if (TREASURY_RE.test(text)) return ESV_WORDS_RE.test(text) ? '65' : '64';
  if (t.payrollRecordId || PAYROLL_RE.test(text)) return '66';
  if (ESV_WORDS_RE.test(text)) return '65';
  if (TAX_WORDS_RE.test(text)) return '64';
  if (who?.side === 'supplier') return '63';
  return '84';
};

// Кореспондуючий рахунок операції: явно обраний користувачем або автоматичний.
// docs = { acts, invoices, payments } — потрібні, щоб розпізнати покупців і постачальників.
export const corrAccountOf = (t, idx) => {
  if (t.ledgerAccount && LEDGER_ACCOUNTS[t.ledgerAccount]) return t.ledgerAccount;
  return autoCorrAccount(t, idx ? idx.partyOfTx(t) : null);
};

// Підказка для форми і перевірки виписки (до збереження операції)
export const suggestCorrAccount = (t, docs = {}) =>
  autoCorrAccount({ ...t, ledgerAccount: '' }, buildPartyIndex(docs).partyOfTx({ ...t, ledgerAccount: '' }));
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
    const corr     = acc(corrAccountOf(t, idx));
    // Гроші прийшли — Дт каса/банк; пішли — Кт каса/банк
    const moneyIn  = t.type === 'income' || t.type === 'refund_in' || t.type === 'non_income';
    const debit    = moneyIn ? cashAcc : corr;
    const credit   = moneyIn ? corr : cashAcc;

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
