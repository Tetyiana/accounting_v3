// Бізнес-логіка документообігу: розрахунки по рахунках, правило першої події,
// формування записів КДВ, авто-заповнення дебіторки/кредиторки.

import { VAT_RATES } from '../constants/documentTypes';
import { isOwnTaxPayment } from './generalSystem';
import { buildSettlements, effectivePayments, buildPartyIndex } from './settlements';
import { corrAccountOf } from './accountingLogic';

const round2 = (n) => Math.round((+n || 0) * 100) / 100;

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
  const isUnified = ['1','2','3_5','3_3_vat','4'].includes(taxGroup);

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
  const isUnified = ['1','2','3_5','3_3_vat','4'].includes(taxGroup);
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

    // 3) Повернення коштів клієнту — зменшують дохід за касовим методом
    transactions
      .filter(t => t.type === 'refund_out')
      .sort((a, b) => (a.date||'').localeCompare(b.date||''))
      .forEach(t => {
        const amt = +t.amount || 0;
        if (amt <= 0) return;
        const method = t.paymentMethod || 'bank';
        entries.push({
          id:     `rf_${t.id}`,
          num:    num++,
          date:   t.date,
          docRef: `Повернення: ${t.counterparty || ''}${t.description ? ' — ' + t.description : ''}`,
          sourceId: t.id,
          sourceType: 'refund',
          cash:      method === 'cash' ? -amt : 0,
          bank:      method === 'bank' ? -amt : 0,
          acquiring: method === 'acquiring' ? -amt : 0,
          other:     0,
          income:    -amt,          // зменшує дохід
          expense:   0, vatOblig: 0,
          expenseDoc: 0, expenseNoDoc: 0, totalExpense: 0, netIncome: -amt,
          note:      t.description || '',
          isReturn:  true,
        });
      });
    // refund_in (повернення від постачальника) у КДВ НЕ потрапляє —
    // це не дохід, а повернення власних коштів.
    // non_income (власні кошти, позика, переказ між рахунками) — теж не дохід.
    // Виняток: поворотна фінансова допомога, не повернена протягом 365 днів,
    // включається до доходу з дати спливу цього терміну (пп. 165.1.31 ПКУ).
    const today = new Date().toISOString().slice(0, 10);
    transactions
      .filter(t => t.type === 'non_income' && t.nonIncomeCategory === 'fin_aid_returnable' && !t.matDopReturned)
      .forEach(t => {
        const receivedDate = new Date(t.date);
        const dueDate = new Date(receivedDate);
        dueDate.setDate(dueDate.getDate() + 365);
        const dueDateStr = dueDate.toISOString().slice(0, 10);
        if (dueDateStr > today) return; // ще не минуло 365 днів
        const amt = +t.amount || 0;
        entries.push({
          id:     `matdop_${t.id}`,
          num:    num++,
          date:   dueDateStr,
          docRef: `Мат.допомога від ${t.counterparty || ''} (365 днів минуло — включається в дохід)`,
          sourceId: t.id,
          sourceType: 'mat_dop_included',
          cash: 0, bank: 0, acquiring: 0, other: amt,
          income: amt,
          expense: 0, vatOblig: 0,
          expenseDoc: 0, expenseNoDoc: 0, totalExpense: 0, netIncome: amt,
          note: `Отримано ${t.date}. Не повернено протягом року → пп. 165.1.31 ПКУ`,
          isReturn: false,
        });
      });

  } else {
    // ── Загальна система: Типова форма обліку доходів і витрат
    //    (наказ Мінфіну від 13.05.2021 № 261). Касовий метод: дохід — отримані кошти,
    //    витрати — оплачені й документально підтверджені (п. 177.2, 177.4 ПКУ).
    //    Платник ПДВ суми ПДВ ні до доходу, ні до витрат не включає.
    const isVat = taxGroup === 'general_vat';
    const partyIdx = buildPartyIndex({ acts, invoices, payments });
    const blank = {
      income: 0, refund: 0, incomeAdj: 0, vatOblig: 0,
      expGoods: 0, expPayroll: 0, expTaxes: 0, expOther: 0, amort: 0,
      totalExpense: 0, netIncome: 0, expDoc: '',
    };
    const ref = (t, fallback) => [t.counterparty, t.description].filter(Boolean).join(' — ') || fallback;

    transactions.forEach(t => {
      const amt = +t.amount || 0;
      if (amt <= 0 || !t.date) return;
      const vat = isVat ? Math.min(+t.vatAmount || 0, amt) : 0;
      const net = round2(amt - vat);
      const base = { ...blank, id: `g_${t.id}`, num: num++, date: t.date, sourceId: t.id, sourceType: 'transaction', note: t.description || '', isReturn: false };

      if (t.type === 'income') {
        // гр. 2 — отриманий дохід; надходження з рахунком «не дохід» (68) сюди не потрапляють
        if (corrAccountOf(t, partyIdx) === '68') return;
        entries.push({ ...base, docRef: ref(t, 'Надходження'), income: net, incomeAdj: net, vatOblig: vat, netIncome: net });
      } else if (t.type === 'refund_out') {
        // гр. 3 — повернуті покупцю кошти
        entries.push({ ...base, docRef: ref(t, 'Повернення покупцю'), refund: net, incomeAdj: -net, netIncome: -net, isReturn: true });
      } else if (t.type === 'expense') {
        if (isOwnTaxPayment(t)) return;            // власні ПДФО, ВЗ, ПДВ — не витрати
        const account = corrAccountOf(t, partyIdx);
        // гр. 6 — товари, роботи, послуги (постачальники); гр. 7 — оплата праці і нарахування;
        // гр. 8 — податки, збори, ЄСВ, ліцензії; гр. 9 — інші витрати
        let key;
        if (account === '66') key = 'expPayroll';
        else if (account === '65') key = t.payrollRecordId ? 'expPayroll' : 'expTaxes';
        else if (account === '63') key = 'expGoods';
        else if (account === '642') key = 'expTaxes';   // ліцензії та інші обов'язкові платежі
        else if (account === '84') key = 'expOther';
        else return;                               // 36, 37, 68 — не витрати діяльності
        entries.push({ ...base, docRef: ref(t, 'Витрата'), expDoc: ref(t, ''), [key]: net, totalExpense: net, netIncome: -net });
      }
    });
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date)).map((e, i) => ({ ...e, num: i+1 }));
};

// ─── Автоматичне формування дебіторки/кредиторки ────────────────────
// Повертає масив записів боргів, що виводяться в DebtorsView.
// Не пише в localStorage — це computed дані на основі рахунків/актів/платежів.
export const computeAutoDebts = ({ invoices = [], acts = [], payments = [], transactions = [] }) => {
  const debts = [];
  const today = new Date().toISOString().slice(0, 10);
  const invById = new Map(invoices.map(i => [i.id, i]));
  const invoicesWithActs = new Set(acts.filter(a => a.invoiceId).map(a => a.invoiceId));
  // Оплати рахунків разом із надходженнями з Банк/Каса без прив'язки до рахунку
  const payEff = effectivePayments({ invoices, payments, transactions, acts });

  // 1. Борги за актами і накладними: оплата контрагента гасить його акти від найдавнішого.
  buildSettlements({ acts, invoices, payments, transactions }).forEach(p => {
    const customer = p.side === 'customer';
    p.docs.forEach(d => {
      if (d.remaining <= 0) return;
      const inv = invById.get(d.act.invoiceId);
      const dueDate = inv?.dueDate || '';
      const isOverdue = !!dueDate && dueDate < today;
      const partial = d.paid > 0 ? `, оплачено ${fmtMoney(d.paid)} з ${fmtMoney(d.total)}` : '';
      debts.push({
        id:           `auto_act_${d.act.id}`,
        isAuto:       true,
        actId:        d.act.id,
        invoiceId:    d.act.invoiceId || null,
        type:         customer ? 'debtor' : 'creditor',
        counterparty: p.name || 'Без назви',
        amount:       d.remaining,
        date:         d.act.date,
        dueDate,
        status:       isOverdue ? 'overdue' : 'pending',
        note:         `Акт №${d.act.number || 'б/н'} від ${d.act.date}${partial}`
                      + (isOverdue ? `, термін оплати минув (${dueDate})` : ''),
      });
    });
    // Оплата понад акти — аванс: одержаний від покупця (ми винні) або виданий постачальнику (нам винні)
    if (p.advance > 0) {
      debts.push({
        id:           `auto_adv_${p.side}_${p.key}`,
        isAuto:       true,
        type:         customer ? 'creditor' : 'debtor',
        counterparty: p.name || 'Без назви',
        amount:       p.advance,
        date:         today,
        dueDate:      '',
        status:       'advance',
        note:         customer ? 'Аванс одержано, акта ще немає' : 'Аванс сплачено, акта ще немає',
      });
    }
  });

  // 2. Рахунки без актів: виставлено, але не оплачено — очікувана оплата.
  invoices.forEach(inv => {
    if (inv.status === 'cancelled') return;
    if (invoicesWithActs.has(inv.id)) return;        // борг уже показано за актом
    const remaining = (+inv.total || 0) - calcInvoicePaid(inv.id, payEff);
    if (remaining <= 0) return;
    const isOverdue = inv.dueDate && inv.dueDate < today;
    debts.push({
      id:           `auto_${inv.id}`,
      isAuto:       true,
      invoiceId:    inv.id,
      type:         inv.direction === 'outgoing' ? 'debtor' : 'creditor',
      counterparty: inv.clientName || 'Без назви',
      amount:       remaining,
      date:         inv.date,
      dueDate:      inv.dueDate || '',
      status:       isOverdue ? 'overdue' : 'invoice',
      note:         isOverdue
                      ? `Рах. №${inv.number}, термін оплати минув (${inv.dueDate}), акта немає`
                      : `Рах. №${inv.number} виставлено, акта немає`,
    });
  });

  return debts;
};

export const fmtMoney = (n) =>
  (+n || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
