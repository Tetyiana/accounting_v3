import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { round2 } from '../utils/payrollLogic';

const DataContext = createContext();

const KEYS = (fopId) => ({
  transactions:   `fop_tx_${fopId}`,
  movements:      `fop_mv_${fopId}`,
  debts:          `fop_debts_${fopId}`,
  vatInvoices:    `fop_vat_${fopId}`,
  invoices:       `fop_inv_${fopId}`,
  acts:           `fop_acts_${fopId}`,
  payments:       `fop_pay_${fopId}`,
  employees:      `fop_emp_${fopId}`,
  payrollRecords: `fop_payroll_${fopId}`,
  leaveRecords:   `fop_leave_${fopId}`,
  clients:        `fop_clients_${fopId}`,
  products:       `fop_products_${fopId}`,
  trash:          `fop_trash_${fopId}`,
});

const load = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
};

const mkId = () => `${Date.now()}_${Math.random().toString(36).slice(2,6)}`;

export const DataProvider = ({ fopId, children }) => {
  const K = useMemo(() => KEYS(fopId), [fopId]);

  const [transactions, setTransactions] = useState(() => load(K.transactions, []));
  const [movements,    setMovements]    = useState(() => load(K.movements, []));
  const [debts,        setDebts]        = useState(() => load(K.debts, []));
  const [vatInvoices,  setVatInvoices]  = useState(() => load(K.vatInvoices, []));
  const [invoices,     setInvoices]     = useState(() => load(K.invoices, []));
  const [acts,         setActs]         = useState(() => load(K.acts, []));
  const [payments,     setPayments]     = useState(() => load(K.payments, []));
  const [employees,    setEmployees]    = useState(() => load(K.employees, []));
  const [payrollRecords, setPayrollRecords] = useState(() => load(K.payrollRecords, []));
  const [leaveRecords,   setLeaveRecords]   = useState(() => load(K.leaveRecords, []));
  const [clients,      setClients]      = useState(() => load(K.clients, []));
  const [products,     setProducts]     = useState(() => load(K.products, []));
  const [trash,        setTrash]        = useState(() => load(K.trash, []));

  useEffect(() => { localStorage.setItem(K.transactions,   JSON.stringify(transactions));   }, [transactions,   K.transactions]);
  useEffect(() => { localStorage.setItem(K.movements,      JSON.stringify(movements));       }, [movements,      K.movements]);
  useEffect(() => { localStorage.setItem(K.debts,          JSON.stringify(debts));           }, [debts,          K.debts]);
  useEffect(() => { localStorage.setItem(K.vatInvoices,    JSON.stringify(vatInvoices));     }, [vatInvoices,    K.vatInvoices]);
  useEffect(() => { localStorage.setItem(K.invoices,       JSON.stringify(invoices));        }, [invoices,       K.invoices]);
  useEffect(() => { localStorage.setItem(K.acts,           JSON.stringify(acts));            }, [acts,           K.acts]);
  useEffect(() => { localStorage.setItem(K.payments,       JSON.stringify(payments));        }, [payments,       K.payments]);
  useEffect(() => { localStorage.setItem(K.employees,      JSON.stringify(employees));       }, [employees,      K.employees]);
  useEffect(() => { localStorage.setItem(K.payrollRecords, JSON.stringify(payrollRecords));  }, [payrollRecords, K.payrollRecords]);
  useEffect(() => { localStorage.setItem(K.leaveRecords,   JSON.stringify(leaveRecords));    }, [leaveRecords,   K.leaveRecords]);
  useEffect(() => { localStorage.setItem(K.clients,        JSON.stringify(clients));          }, [clients,        K.clients]);
  useEffect(() => { localStorage.setItem(K.products,       JSON.stringify(products));         }, [products,       K.products]);
  useEffect(() => { localStorage.setItem(K.trash,          JSON.stringify(trash));           }, [trash,          K.trash]);

  // ─── Журнал (транзакції) ─────────────────────────────────────────
  const addTransaction = useCallback((t) => {
    const item = { ...t, id: t.id || mkId() };
    setTransactions(prev => [...prev, item]);
    return item;
  }, []);

  const deleteTransaction = useCallback((id) => {
    setTransactions(prev => {
      const item = prev.find(t => t.id === id);
      if (item) setTrash(tr => [...tr, { id: `tx_${id}`, kind: 'transaction', data: item, deletedAt: new Date().toISOString() }]);
      return prev.filter(t => t.id !== id);
    });
  }, []);

  // ─── Склад ──────────────────────────────────────────────────────
  const addMovement = useCallback((m) => {
    setMovements(prev => [...prev, { ...m, id: mkId() }]);
  }, []);

  const deleteMovement = useCallback((id) => {
    setMovements(prev => {
      const item = prev.find(m => m.id === id);
      if (item) setTrash(tr => [...tr, { id: `mv_${id}`, kind: 'movement', data: item, deletedAt: new Date().toISOString() }]);
      return prev.filter(m => m.id !== id);
    });
  }, []);

  // ─── Дебітори / Кредитори (ручні) ───────────────────────────────
  const addDebt = useCallback((d) => {
    setDebts(prev => [...prev, { ...d, id: mkId() }]);
  }, []);

  const updateDebt = useCallback((id, patch) => {
    setDebts(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));
  }, []);

  const deleteDebt = useCallback((id) => {
    setDebts(prev => {
      const item = prev.find(d => d.id === id);
      if (item) setTrash(tr => [...tr, { id: `debt_${id}`, kind: 'debt', data: item, deletedAt: new Date().toISOString() }]);
      return prev.filter(d => d.id !== id);
    });
  }, []);

  // ─── ПДВ накладні ───────────────────────────────────────────────
  const addVatInvoice    = useCallback((v) => setVatInvoices(prev => [...prev, { ...v, id: mkId() }]), []);
  const deleteVatInvoice = useCallback((id) => {
    setVatInvoices(prev => {
      const item = prev.find(v => v.id === id);
      if (item) setTrash(tr => [...tr, { id: `vat_${id}`, kind: 'vatInvoice', data: item, deletedAt: new Date().toISOString() }]);
      return prev.filter(v => v.id !== id);
    });
  }, []);

  // ─── Рахунки (документообіг) ────────────────────────────────────
  const addInvoice = useCallback((inv) => {
    const item = { ...inv, id: mkId(), createdAt: new Date().toISOString() };
    setInvoices(prev => [...prev, item]);
    return item;
  }, []);

  const updateInvoice = useCallback((id, patch) => {
    setInvoices(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
  }, []);

  const deleteInvoice = useCallback((id) => {
    setInvoices(prev => {
      const item = prev.find(i => i.id === id);
      if (item) setTrash(tr => [...tr, { id: `inv_${id}`, kind: 'invoice', data: item, deletedAt: new Date().toISOString() }]);
      return prev.filter(i => i.id !== id);
    });
  }, []);

  // ─── Акти / Накладні ────────────────────────────────────────────
  const addAct = useCallback((act) => {
    const item = { ...act, id: mkId(), createdAt: new Date().toISOString() };
    setActs(prev => [...prev, item]);
    return item;
  }, []);

  const updateAct = useCallback((id, patch) => {
    setActs(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a));
  }, []);

  const deleteAct = useCallback((id) => {
    setActs(prev => {
      const item = prev.find(a => a.id === id);
      if (item) setTrash(tr => [...tr, { id: `act_${id}`, kind: 'act', data: item, deletedAt: new Date().toISOString() }]);
      return prev.filter(a => a.id !== id);
    });
  }, []);

  // ─── Платежі по рахунках ────────────────────────────────────────
  // При додаванні платежу автоматично створюємо запис у журналі
  // та оновлюємо статус рахунку.
  const addPayment = useCallback((payment, { invoice } = {}) => {
    const item = { ...payment, id: mkId(), createdAt: new Date().toISOString() };
    setPayments(prev => [...prev, item]);

    // Авто-транзакція в журналі
    const transType = payment.direction === 'outgoing' ? 'income' : 'expense';
    const txDesc = invoice
      ? `Оплата по рах. №${invoice.number}${invoice.clientName ? ' від ' + invoice.clientName : ''}`
      : (payment.notes || 'Оплата по рахунку');

    addTransaction({
      date:             payment.date,
      type:             transType,
      counterparty:     invoice?.clientName || payment.counterparty || '',
      amount:           +payment.amount || 0,
      description:      txDesc,
      invoicePaymentId: item.id, // маркер: ця транзакція від оплати рахунку
    });

    // Якщо еквайринг — окремий запис комісії як витрата
    const comm = +payment.acquiringCommission || 0;
    if (comm > 0) {
      addTransaction({
        date:        payment.date,
        type:        'expense',
        counterparty:'Банк (еквайринг)',
        amount:      comm,
        description: `Комісія еквайрингу по рах. №${invoice?.number || ''}`,
        invoicePaymentId: item.id,
      });
    }

    return item;
  }, [addTransaction]);

  const deletePayment = useCallback((id) => {
    setPayments(prev => {
      const item = prev.find(p => p.id === id);
      if (item) setTrash(tr => [...tr, { id: `pay_${id}`, kind: 'payment', data: item, deletedAt: new Date().toISOString() }]);
      return prev.filter(p => p.id !== id);
    });
    // Видаляємо пов'язані авто-транзакції
    setTransactions(prev => prev.filter(t => t.invoicePaymentId !== id));
  }, []);

  // ─── Працівники ─────────────────────────────────────────────────
  const addEmployee = useCallback((emp) => {
    const item = { ...emp, id: mkId(), createdAt: new Date().toISOString() };
    setEmployees(prev => [...prev, item]);
    return item;
  }, []);

  const updateEmployee = useCallback((id, patch) => {
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  }, []);

  const deleteEmployee = useCallback((id) => {
    setEmployees(prev => {
      const item = prev.find(e => e.id === id);
      if (item) setTrash(tr => [...tr, { id: `emp_${id}`, kind: 'employee', data: item, deletedAt: new Date().toISOString() }]);
      return prev.filter(e => e.id !== id);
    });
  }, []);

  // ─── Нарахування зарплати ───────────────────────────────────────
  const addPayrollRecord = useCallback((record) => {
    const item = { ...record, id: mkId(), createdAt: new Date().toISOString() };
    setPayrollRecords(prev => [...prev, item]);
    return item;
  }, []);

  const updatePayrollRecord = useCallback((id, patch) => {
    setPayrollRecords(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }, []);

  const deletePayrollRecord = useCallback((id) => {
    setPayrollRecords(prev => {
      const item = prev.find(r => r.id === id);
      if (item) setTrash(tr => [...tr, { id: `pr_${id}`, kind: 'payrollRecord', data: item, deletedAt: new Date().toISOString() }]);
      return prev.filter(r => r.id !== id);
    });
    // Видаляємо авто-транзакції пов'язані з цим нарахуванням
    setTransactions(prev => prev.filter(t => t.payrollRecordId !== id));
  }, []);

  // Затвердити та виплатити — автоматично створює транзакції в журналі
  const approveAndPayPayroll = useCallback((recordId, paidDate) => {
    setPayrollRecords(prev => prev.map(r => {
      if (r.id !== recordId) return r;
      const emp = employees.find(e => e.id === r.employeeId);
      const name = emp?.fullName || 'Працівник';
      const period = r.period || '';

      // Виплата зарплати
      addTransaction({
        date:            paidDate,
        type:            'expense',
        counterparty:    name,
        amount:          +r.netPay || 0,
        description:     `Виплата з/п ${name} за ${period}`,
        payrollRecordId: r.id,
      });
      // ПДФО до бюджету
      if ((+r.pdfo||0) > 0) addTransaction({
        date: paidDate, type: 'expense', counterparty: 'ДПС (ПДФО)',
        amount: +r.pdfo, description: `ПДФО з/п ${name} ${period}`, payrollRecordId: r.id,
      });
      // ВЗ до бюджету
      if ((+r.vz||0) > 0) addTransaction({
        date: paidDate, type: 'expense', counterparty: 'ДПС (ВЗ)',
        amount: +r.vz, description: `ВЗ з/п ${name} ${period}`, payrollRecordId: r.id,
      });
      // ЄСВ до бюджету
      if ((+r.esv||0) > 0) addTransaction({
        date: paidDate, type: 'expense', counterparty: 'ПФУ (ЄСВ)',
        amount: +r.esv, description: `ЄСВ з/п ${name} ${period}`, payrollRecordId: r.id,
      });

      return { ...r, status: 'paid', paidDate };
    }));
  }, [employees, addTransaction]);

  // ─── Відпустки ──────────────────────────────────────────────────
  const addLeaveRecord = useCallback((leave) => {
    const item = { ...leave, id: mkId(), createdAt: new Date().toISOString() };
    setLeaveRecords(prev => [...prev, item]);
    // Тільки щорічна відпустка зменшує залишок. Відпустка за власний рахунок (unpaid),
    // лікарняний і компенсація — не списуються з балансу щорічної відпустки.
    const affectsAnnualBalance = leave.type === 'annual' && leave.days > 0;
    if (affectsAnnualBalance) {
      setEmployees(prev => prev.map(e =>
        e.id === leave.employeeId
          ? { ...e, leaveUsed: round2((+e.leaveUsed||0) + (+leave.days||0)) }
          : e
      ));
    }
    return item;
  }, []);

  const deleteLeaveRecord = useCallback((id) => {
    setLeaveRecords(prev => {
      const item = prev.find(r => r.id === id);
      // При видаленні щорічної відпустки — повертаємо дні в баланс
      if (item && item.type === 'annual' && item.days > 0) {
        setEmployees(emp => emp.map(e =>
          e.id === item.employeeId
            ? { ...e, leaveUsed: Math.max(0, round2((+e.leaveUsed||0) - (+item.days||0))) }
            : e
        ));
      }
      return prev.filter(r => r.id !== id);
    });
  }, []);

  // ─── Довідник контрагентів ──────────────────────────────────────
  const addClient    = useCallback((c) => { const item = {...c, id:mkId(), createdAt:new Date().toISOString()}; setClients(p=>[...p,item]); return item; }, []);
  const updateClient = useCallback((id, patch) => setClients(p=>p.map(c=>c.id===id?{...c,...patch}:c)), []);
  const deleteClient = useCallback((id) => setClients(p=>p.filter(c=>c.id!==id)), []);

  // ─── Довідник номенклатури ──────────────────────────────────────
  const addProduct    = useCallback((pr) => { const item = {...pr, id:mkId(), createdAt:new Date().toISOString()}; setProducts(p=>[...p,item]); return item; }, []);
  const updateProduct = useCallback((id, patch) => setProducts(p=>p.map(pr=>pr.id===id?{...pr,...patch}:pr)), []);
  const deleteProduct = useCallback((id) => setProducts(p=>p.filter(pr=>pr.id!==id)), []);

  // ─── Кошик (оновлений) ──────────────────────────────────────────
  const restoreFromTrash = useCallback((trashId) => {
    setTrash(prev => {
      const item = prev.find(t => t.id === trashId);
      if (!item) return prev;
      if (item.kind === 'transaction')    setTransactions(p => [...p, item.data]);
      if (item.kind === 'movement')       setMovements(p => [...p, item.data]);
      if (item.kind === 'debt')           setDebts(p => [...p, item.data]);
      if (item.kind === 'vatInvoice')     setVatInvoices(p => [...p, item.data]);
      if (item.kind === 'invoice')        setInvoices(p => [...p, item.data]);
      if (item.kind === 'act')            setActs(p => [...p, item.data]);
      if (item.kind === 'payment')        setPayments(p => [...p, item.data]);
      if (item.kind === 'employee')       setEmployees(p => [...p, item.data]);
      if (item.kind === 'payrollRecord')  setPayrollRecords(p => [...p, item.data]);
      return prev.filter(t => t.id !== trashId);
    });
  }, []);

  const purgeFromTrash  = useCallback((id) => setTrash(prev => prev.filter(t => t.id !== id)), []);
  const purgeAllTrash   = useCallback(() => setTrash([]), []);

  // ─── Резервна копія ─────────────────────────────────────────────
  const exportBackup = useCallback(() => ({
    version: 4,
    exportedAt: new Date().toISOString(),
    transactions, movements, debts, vatInvoices,
    invoices, acts, payments,
    employees, payrollRecords, leaveRecords,
    clients, products,
    trash,
  }), [transactions, movements, debts, vatInvoices, invoices, acts, payments,
       employees, payrollRecords, leaveRecords, clients, products, trash]);

  const importBackup = useCallback((backup) => {
    if (!backup || typeof backup !== 'object') return { ok: false, error: 'Некоректний файл' };
    setTransactions(  Array.isArray(backup.transactions)   ? backup.transactions   : []);
    setMovements(     Array.isArray(backup.movements)       ? backup.movements       : []);
    setDebts(         Array.isArray(backup.debts)           ? backup.debts           : []);
    setVatInvoices(   Array.isArray(backup.vatInvoices)     ? backup.vatInvoices     : []);
    setInvoices(      Array.isArray(backup.invoices)        ? backup.invoices        : []);
    setActs(          Array.isArray(backup.acts)            ? backup.acts            : []);
    setPayments(      Array.isArray(backup.payments)        ? backup.payments        : []);
    setEmployees(     Array.isArray(backup.employees)       ? backup.employees       : []);
    setPayrollRecords(Array.isArray(backup.payrollRecords)  ? backup.payrollRecords  : []);
    setLeaveRecords(  Array.isArray(backup.leaveRecords)    ? backup.leaveRecords    : []);
    setClients(       Array.isArray(backup.clients)         ? backup.clients         : []);
    setProducts(      Array.isArray(backup.products)        ? backup.products        : []);
    setTrash(         Array.isArray(backup.trash)           ? backup.trash           : []);
    return { ok: true };
  }, []);

  return (
    <DataContext.Provider value={{
      transactions,  addTransaction,    deleteTransaction,
      movements,     addMovement,       deleteMovement,
      debts,         addDebt,   updateDebt,   deleteDebt,
      vatInvoices,   addVatInvoice,     deleteVatInvoice,
      invoices,      addInvoice, updateInvoice, deleteInvoice,
      acts,          addAct,     updateAct,     deleteAct,
      payments,      addPayment,        deletePayment,
      employees,     addEmployee, updateEmployee, deleteEmployee,
      payrollRecords, addPayrollRecord, updatePayrollRecord, deletePayrollRecord, approveAndPayPayroll,
      leaveRecords,  addLeaveRecord,    deleteLeaveRecord,
      clients,       addClient,   updateClient,   deleteClient,
      products,      addProduct,  updateProduct,  deleteProduct,
      trash,         restoreFromTrash,  purgeFromTrash, purgeAllTrash,
      exportBackup,  importBackup,
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => useContext(DataContext);
