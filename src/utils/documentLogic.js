// Бізнес-логіка документообігу: розрахунки по рахунках, правило першої події,
// формування записів КДВ, авто-заповнення дебіторки/кредиторки.

import { VAT_RATES } from '../constants/documentTypes';

// ─── Розрахунок рядка документа ─────────────────────────────────────
export const calcItemAmounts = (item) => {
  const qty   = +item.qty   || 0;
  const price = +item.price || 0;
  const rate  = VAT_RATES.find(v => v.id === item.vatRate)?.rate || 0;
  const subtotal = qty * price;
  const vatAmount = subtotal * rate;
  return { subtotal, vatAmount, total: subtotal + vatAmount };
};

export const calcDocTotals = (items = []) => {
  return items.reduce((acc, item) => {
    const { subtotal, vatAmount, total } = calcItemAmounts(item);
    return {
      subtotal:  acc.subtotal  + subtotal,
      vatAmount: acc.vatAmount + vatAmount,
      total:     acc.total     + total,
    };
  }, { subtotal: 0, vatAmount: 0, total: 0 });
};

// ─── Статус рахунку ──────────────────────────────────────────────────
export const calcInvoiceStatus = (invoice, payments = []) => {
  if (invoice.status === 'cancelled') return 'cancelled';
  const total = +invoice.total || 0;
  const paid  = payments
    .filter(p => p.invoiceId === invoice.id)
    .reduce((s, p) => s + (+p.amount || 0), 0);
  if (paid >= total && total > 0) return 'paid';
  if (paid > 0) return 'partial';
  if (invoice.dueDate && invoice.dueDate < new Date().toISOString().slice(0,10)) return 'overdue';
  return invoice.status || 'sent';
};

export const calcInvoicePaid = (invoiceId, payments = []) =>
  payments.filter(p => p.invoiceId === invoiceId).reduce((s, p) => s + (+p.amount || 0), 0);

// ─── Правило першої події ────────────────────────────────────────────
// Повертає об'єкт { date, type: 'payment'|'act', amount } або null.
// ЄП — перша оплата.
// Загальна система — перша з двох подій (оплата АБО підписаний акт).
export const getFirstEvent = ({ invoice, acts = [], payments = [], taxGroup }) => {
  const isUnified = ['1','2','3_5','3_3_vat'].includes(taxGroup);

  const firstPayment = [...payments]
    .filter(p => p.invoiceId === invoice.id)
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  if (isUnified) {
    return firstPayment
      ? { date: firstPayment.date, type: 'payment', amount: +firstPayment.amount || 0, id: firstPayment.id }
      : null;
  }

  // Загальна система
  const firstAct = [...acts]
    .filter(a => a.invoiceId === invoice.id && a.status === 'signed' && a.direction === 'outgoing')
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  if (!firstPayment && !firstAct) return null;
  if (!firstPayment) return { date: firstAct.date, type: 'act', amount: +firstAct.total || 0, id: firstAct.id };
  if (!firstAct)     return { date: firstPayment.date, type: 'payment', amount: +firstPayment.amount || 0, id: firstPayment.id };

  return firstPayment.date <= firstAct.date
    ? { date: firstPayment.date, type: 'payment', amount: +firstPayment.amount || 0, id: firstPayment.id }
    : { date: firstAct.date,     type: 'act',     amount: +firstAct.total  || 0, id: firstAct.id };
};

// ─── Формування записів КДВ ─────────────────────────────────────────
// Повертає масив рядків КДВ з урахуванням групи оподаткування та
// правила першої події. Кожен рядок вже готовий до відображення.
export const buildKdvEntries = ({ invoices = [], acts = [], payments = [], transactions = [], taxGroup }) => {
  const isUnified = ['1','2','3_5','3_3_vat'].includes(taxGroup);
  const entries   = [];
  let num = 1;

  if (isUnified) {
    // ЄП: дохід = кожна оплата по вхідних рахунках + прямі доходи з журналу
    // (у журналі можуть бути платежі, не прив'язані до рахунків)
    const linkedPaymentIds = new Set(payments.map(p => p.id));

    // 1) Платежі по рахунках (invoices)
    [...payments]
      .filter(p => p.direction === 'outgoing')
      .sort((a, b) => (a.date||'').localeCompare(b.date||''))
      .forEach(p => {
        const inv  = invoices.find(i => i.id === p.invoiceId);
        const amt  = +p.amount || 0;
        const comm = +p.acquiringCommission || 0;
        entries.push({
          id:     `pay_${p.id}`,
          num:    num++,
          date:   p.date,
          docRef: inv ? `Рах. №${inv.number} від ${inv.date}` : 'Оплата',
          sourceId: p.id,
          sourceType: 'payment',
          cash:      p.paymentMethod === 'cash'      ? amt : 0,
          bank:      p.paymentMethod === 'bank'      ? amt : 0,
          acquiring: p.paymentMethod === 'acquiring' ? amt : 0,
          other:     0,
          income:    amt,
          expense:   comm > 0 ? comm : 0,
          vatOblig:  0,
          expenseDoc: comm > 0 ? comm : 0,
          expenseNoDoc: 0,
          totalExpense: comm > 0 ? comm : 0,
          netIncome: amt - (comm > 0 ? comm : 0),
          note:      comm > 0 ? `Комісія еквайрингу: ${comm.toFixed(2)} грн` : '',
          isReturn:  amt < 0,
        });
      });

    // 2) Прямі доходи з журналу — включаємо ВСІ income транзакції крім тих,
    // що вже враховані через оплату рахунків (щоб не дублювати)
    const invoicePaymentTransIds = new Set(
      payments.map(p => `inv_${p.id}`)
    );
    transactions
      .filter(t => t.type === 'income')
      // Виключаємо лише ті транзакції, що були автоматично створені через оплату рахунку
      // (їх вже обліковано в розділі 1 вище через payments)
      .filter(t => !t.invoicePaymentId)
      .sort((a, b) => (a.date||'').localeCompare(b.date||''))
      .forEach(t => {
        const amt = +t.amount || 0;
        if (amt <= 0) return;
        const method = t.paymentMethod || 'bank';
        entries.push({
          id:     `tx_${t.id}`,
          num:    num++,
          date:   t.date,
          docRef: t.counterparty || 'Надходження',
          sourceId: t.id,
          sourceType: 'transaction',
          cash:      method === 'cash'      ? amt : 0,
          bank:      method !== 'cash' && method !== 'acquiring' ? amt : 0,
          acquiring: method === 'acquiring' ? amt : 0,
          other:     0,
          income:    amt,
          expense:   0, vatOblig: 0,
          expenseDoc: 0, expenseNoDoc: 0, totalExpense: 0, netIncome: amt,
          note: t.description || '',
          isReturn: false,
        });
      });

  } else {
    // Загальна система: перша подія
    const processed = new Set();
    [...invoices]
      .filter(inv => inv.direction === 'outgoing' && inv.status !== 'cancelled')
      .sort((a, b) => (a.date||'').localeCompare(b.date||''))
      .forEach(inv => {
        const fe = getFirstEvent({ invoice: inv, acts, payments, taxGroup });
        if (!fe || processed.has(inv.id)) return;
        processed.add(inv.id);
        const amt = fe.amount;
        entries.push({
          id:     `fe_${inv.id}`,
          num:    num++,
          date:   fe.date,
          docRef: `Рах. №${inv.number} (${fe.type === 'payment' ? 'оплата' : 'акт'})`,
          sourceId: inv.id,
          sourceType: 'invoice',
          cash:   0, bank: amt, acquiring: 0, other: 0,
          income: amt,
          expense: 0,
          vatOblig: +inv.vatAmount || 0,
          expenseDoc: 0, expenseNoDoc: 0, totalExpense: 0, netIncome: amt,
          note: '',
          isReturn: false,
        });
      });

    // Прямі витрати з журналу
    transactions
      .filter(t => t.type === 'expense')
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach(t => {
        const amt = +t.amount || 0;
        // Знаходимо відповідний запис доходу того ж дня або додаємо окремо
        entries.push({
          id:     `exp_${t.id}`,
          num:    num++,
          date:   t.date,
          docRef: t.counterparty || 'Витрата',
          sourceId: t.id,
          sourceType: 'transaction',
          cash: 0, bank: 0, acquiring: 0, other: 0,
          income: 0, vatOblig: 0,
          expenseDoc: t.hasDocument ? amt : 0,
          expenseNoDoc: t.hasDocument ? 0 : amt,
          totalExpense: amt,
          netIncome: -amt,
          note: t.description || '',
          isReturn: false,
        });
      });
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date)).map((e, i) => ({ ...e, num: i+1 }));
};

// ─── Автоматичне формування дебіторки/кредиторки ────────────────────
// Повертає масив записів боргів, що виводяться в DebtorsView.
// Не пише в localStorage — це computed дані на основі рахунків/актів/платежів.
export const computeAutoDebts = ({ invoices = [], acts = [], payments = [] }) => {
  const debts = [];

  invoices.forEach(inv => {
    if (inv.status === 'cancelled') return;
    const total = +inv.total || 0;
    const paid  = calcInvoicePaid(inv.id, payments);
    const remaining = total - paid;
    if (remaining <= 0) return;

    // Перевіряємо чи є акт (якщо є — це реальна заборгованість, не аванс)
    const hasSignedAct = acts.some(a => a.invoiceId === inv.id && a.status === 'signed');

    debts.push({
      id:           `auto_${inv.id}`,
      isAuto:       true,
      invoiceId:    inv.id,
      type:         inv.direction === 'outgoing' ? 'debtor' : 'creditor',
      counterparty: inv.clientName || 'Без назви',
      amount:       remaining,
      date:         inv.date,
      dueDate:      inv.dueDate || '',
      status:       hasSignedAct ? 'pending' : 'advance',
      note:         hasSignedAct
                      ? `Рах. №${inv.number}, акт підписано`
                      : `Рах. №${inv.number}, аванс (акт не підписано)`,
    });
  });

  return debts;
};

// ─── Форматування суми ───────────────────────────────────────────────
export const fmtMoney = (n) =>
  (+n || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
