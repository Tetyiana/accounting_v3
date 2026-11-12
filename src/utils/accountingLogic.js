import { buildPartyIndex } from './settlements';
import { ownTaxAccruals } from './ownTaxAccrual';

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
  '64': 'Розрахунки за податками (усього)',
  '6411': 'Єдиний податок',
  '6412': 'ПДФО',
  '6413': 'Військовий збір',
  '6414': 'ПДВ',
  '6415': 'Акцизний податок',
  '6419': 'Інші податки і збори',
  '642': 'Обов\'язкові платежі (ліцензії)',
  '643': 'Податкові зобов\'язання (ПДВ з авансів)',
  '65': 'Розрахунки за страхуванням (ЄСВ)',
  '66': 'Розрахунки з оплати праці',
  '68': 'Розрахунки за іншими операціями',
  '70': 'Дохід від реалізації',
  '74': 'Інші доходи',
  '79': 'Фінансові результати',
  '84': 'Витрати',
};

const acc = (code) => ({ code, label: LEDGER_ACCOUNTS[code] || code });

// Субрахунки рахунка 64: 641 — податки (аналітика за видами: 6411 ЄП, 6412 ПДФО,
// 6413 військовий збір, 6414 ПДВ, 6415 акциз, 6419 інші), 642 — обов'язкові платежі,
// 643 — податкові зобов'язання з ПДВ за отриманими авансами.
export const TAX_SUBACCOUNTS = ['6411', '6412', '6413', '6414', '6415', '6419', '642', '643'];
export const isTaxAccount = (code) => String(code || '').startsWith('64');
// Рахунок підходить під обраний: сам рахунок або його субрахунок (64 → 6411…643)
export const accountMatches = (code, selected) =>
  code === selected || (String(selected).length === 2 && String(code).startsWith(selected) && code !== selected && isTaxAccount(selected));
// Вид податку за призначенням платежу
export const taxSubaccount = (text = '') => {
  const s = String(text).toLowerCase();
  if (/ліценз/.test(s)) return '642';
  if (/акциз/.test(s)) return '6415';
  if (/(^|[^а-яіїєґ])пдв([^а-яіїєґ]|$)|додан\S* варт/.test(s) && !/без пдв/.test(s)) return '6414';
  if (/військов\S* зб|(^|[^а-яіїєґ])вз([^а-яіїєґ]|$)/.test(s)) return '6413';
  if (/(^|[^а-яіїєґ])пдфо([^а-яіїєґ]|$)|доход\S* фізичн/.test(s)) return '6412';
  if (/єдин\S* подат|(^|[^а-яіїєґ])єп([^а-яіїєґ]|$)/.test(s)) return '6411';
  return '6419';
};
// Автовизначення платежів до бюджету — за контрагентом і призначенням платежу.
const PFU_RE       = /пфу|пенсійн/i;
const TREASURY_RE  = /дпс|казначей|(^|[^а-яіїєґ])г?ук у |дксу/i;
const ESV_WORDS_RE = /(^|[^а-яіїєґ])єсв([^а-яіїєґ]|$)|єдин\S* (соц\S* )?внес/i;
const TAX_WORDS_RE = /єдин\S* подат|військов\S* зб|(^|[^а-яіїєґ])пдфо([^а-яіїєґ]|$)/i;
const PAYROLL_RE   = /зарплат|заробітн\S* плат|аванс з\/п|відпускн|лікарнян/i;

// Рахунки, які можна обрати кореспондуючими для операції банку/каси
export const CORR_ACCOUNTS = ['36', '37', '63', ...TAX_SUBACCOUNTS, '65', '66', '68', '70', '74', '84'];

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
  if (TREASURY_RE.test(text)) return ESV_WORDS_RE.test(text) ? '65' : taxSubaccount(text);
  if (t.payrollRecordId) return '66';
  // податок чи внесок у призначенні важить більше, ніж слово «зарплата» («ПДФО із зарплати»)
  if (ESV_WORDS_RE.test(text)) return '65';
  if (TAX_WORDS_RE.test(text) || /акциз|ліценз/i.test(text)) return taxSubaccount(text);
  if (PAYROLL_RE.test(text)) return '66';
  if (who?.side === 'supplier') return '63';
  return '84';
};

// Кореспондуючий рахунок операції: явно обраний користувачем або автоматичний.
// docs = { acts, invoices, payments } — потрібні, щоб розпізнати покупців і постачальників.
export const corrAccountOf = (t, idx) => {
  // «64» без субрахунка — так зберігалося раніше: вид податку визначаємо за призначенням
  if (t.ledgerAccount === '64') return taxSubaccount(txText(t));
  if (t.ledgerAccount && LEDGER_ACCOUNTS[t.ledgerAccount]) return t.ledgerAccount;
  return autoCorrAccount(t, idx ? idx.partyOfTx(t) : null);
};

// Підказка для форми і перевірки виписки (до збереження операції)
export const suggestCorrAccount = (t, docs = {}) =>
  autoCorrAccount({ ...t, ledgerAccount: '' }, buildPartyIndex(docs).partyOfTx({ ...t, ledgerAccount: '' }));
const round2 = (n) => Math.round((+n || 0) * 100) / 100;

const ACT_LABEL = { act: 'Акт', delivery_note: 'Накладна', return_act: 'Акт повернення' };

// Проводки за спрощеним планом, метод нарахування:
//   акт / накладна покупцю     → Дт 36 — Кт 70   (ПДВ з акта: Дт 36 — Кт 6414)
//   ПН на передоплату          → Дт 643 — Кт 6414; при відвантаженні — Дт 6414 — Кт 643
//   зарплата (нарахування)     → Дт 84 — Кт 66; ПДФО: Дт 66 — Кт 6412; ВЗ: Дт 66 — Кт 6413; ЄСВ: Дт 84 — Кт 65
//   роздрібний акциз за місяць → Дт 70 — Кт 6415
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
  const { acts = [], invoices = [], payments = [], payrollRecords = [], vatInvoices = [], employees = [], tax = null } = docs;
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
      if (isReturn) { push('n', acc('70'), acc('36'), net); push('v', acc('6414'), acc('36'), vat, ' (ПДВ)'); }
      else          { push('n', acc('36'), acc('70'), net); push('v', acc('36'), acc('6414'), vat, ' (ПДВ)'); }
    } else {
      if (isReturn) { push('n', acc('63'), acc('84'), net); push('v', acc('63'), acc('6414'), vat, ' (ПДВ)'); }
      else          { push('n', acc('84'), acc('63'), net); push('v', acc('6414'), acc('63'), vat, ' (ПДВ)'); }
    }
  });

  // ── ПДВ з отриманих авансів: ПН на передоплату і її закриття відвантаженням ──
  const vatOf = (v) => {
    const lines = Array.isArray(v.items) && v.items.length ? v.items : [{ base: v.amount, rate: v.rate }];
    return round2(lines.reduce((s, l) => s + (+l.base || 0) * (l.rate == null || l.rate === '' ? (v.rate ?? 20) : +l.rate) / 100, 0));
  };
  const advByInvoice = {};
  vatInvoices.filter(v => v.direction === 'outgoing' && v.kind !== 'rk' && v.basis === 'prepayment' && v.sourceInvoiceId && v.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .forEach(v => {
      const vat = vatOf(v);
      if (vat <= 0) return;
      entries.push({
        id: `pn_${v.id}`, date: String(v.date).slice(0, 10), counterparty: v.counterparty || '',
        description: `ПН №${v.number} на передоплату (ПДВ з авансу)`, amount: vat,
        debit: acc('643'), credit: acc('6414'), sourceType: 'vat', sourceId: v.id,
      });
      (advByInvoice[v.sourceInvoiceId] = advByInvoice[v.sourceInvoiceId] || []).push({ date: String(v.date).slice(0, 10), left: vat });
    });
  acts.filter(a => a.invoiceId && advByInvoice[a.invoiceId] && a.type !== 'return_act' && a.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .forEach(a => {
      let need = Math.min(round2(a.vatAmount), round2(a.total));
      let closed = 0;
      for (const adv of advByInvoice[a.invoiceId]) {
        if (need <= 0) break;
        if (adv.date > a.date || adv.left <= 0) continue;
        const x = Math.min(adv.left, need);
        adv.left = round2(adv.left - x); need = round2(need - x); closed = round2(closed + x);
      }
      if (closed > 0) entries.push({
        id: `act_${a.id}_adv`, date: a.date, counterparty: idx.actParty(a),
        description: `${ACT_LABEL[a.type] || 'Акт'} №${a.number || 'б/н'}: закриття ПДВ з авансу`, amount: closed,
        debit: acc('6414'), credit: acc('643'), sourceType: 'act', sourceId: a.id,
      });
    });

  // ── Зарплата: нарахування і утримання (останній день місяця нарахування) ──
  payrollRecords.filter(r => r.status !== 'draft' && /^\d{4}-\d{2}$/.test(r.period || '')).forEach(r => {
    const [y, m] = r.period.split('-').map(Number);
    const date = `${r.period}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    const name = employees.find(e => e.id === r.employeeId)?.fullName || 'Працівник';
    const push = (suffix, debit, credit, amount, what) => {
      if (round2(amount) > 0) entries.push({
        id: `pay_${r.id}_${suffix}`, date, counterparty: name, description: `${what} за ${r.period}`,
        amount: round2(amount), debit: acc(debit), credit: acc(credit), sourceType: 'payroll', sourceId: r.id,
      });
    };
    push('g', '84', '66', r.totalGross, 'Нараховано зарплату');
    push('p', '66', '6412', r.pdfo, 'Утримано ПДФО');
    push('v', '66', '6413', r.vz, 'Утримано військовий збір');
    push('e', '84', '65', r.esv, 'Нараховано ЄСВ');
  });

  // ── Податки ФОП за себе: нарахування за завершені квартали (docs.tax — група і ставки) ──
  if (tax) ownTaxAccruals({ transactions, tax }).forEach(e => entries.push({ ...e, debit: acc(e.debit), credit: acc(e.credit) }));

  // ── Роздрібний акциз: 5 / 105 вартості підакцизних товарів у чеках за місяць ──
  const exciseByMonth = {};
  transactions.forEach(t => {
    if (!(+t.exciseBase > 0) || !t.date) return;
    const k = String(t.date).slice(0, 7);
    const sign = t.type === 'refund_out' ? -1 : t.type === 'income' ? 1 : 0;
    exciseByMonth[k] = (exciseByMonth[k] || 0) + sign * (+t.exciseBase);
  });
  Object.entries(exciseByMonth).forEach(([k, base]) => {
    const tax = round2(base * 5 / 105);
    if (tax <= 0) return;
    const [y, m] = k.split('-').map(Number);
    entries.push({
      id: `excise_${k}`, date: `${k}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`, counterparty: '',
      description: `Роздрібний акциз за ${k}`, amount: tax, debit: acc('70'), credit: acc('6415'),
      sourceType: 'excise', sourceId: k,
    });
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
