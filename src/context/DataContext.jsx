import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { round2 } from '../utils/payrollLogic';
import { dbSelect, dbInsert, dbUpdate, dbDelete, newId } from '../lib/db';

// Всі дані ФОПа — у Supabase. API контексту незмінний (camelCase, синхронні
// функції): UUID генерується на клієнті, запис у базу — у фоні.

const DataContext = createContext();

// payroll: плоскі поля розрахунку ↔ jsonb data
const payrollToRow  = (r) => {
  const { id, fopId, employeeId, period, status, createdAt, ...rest } = r;
  return { id, fopId, employeeId, period, status, data: rest };
};
const payrollFromRow = (r) => ({
  id: r.id, fopId: r.fopId, employeeId: r.employeeId,
  period: r.period, status: r.status, ...(r.data || {}),
});

// trash: kind/data (views) ↔ entity_type/entity_data (схема)
const trashToRow   = (t) => ({ id: t.id, fopId: t.fopId, entityType: t.kind, entityData: t.data });
const trashFromRow = (t) => ({ id: t.id, kind: t.entityType, data: t.entityData, deletedAt: t.deletedAt });

// acts: у views поле type, у схемі act_type
const actToRow   = ({ type, ...a }) => ({ ...a, actType: type });
const actFromRow = ({ actType, ...a }) => ({ ...a, type: actType });

export const DataProvider = ({ fopId, children }) => {
  const [transactions,   setTransactions]   = useState([]);
  const [movements,      setMovements]      = useState([]);
  const [debts,          setDebts]          = useState([]);
  const [vatInvoices,    setVatInvoices]    = useState([]);
  const [invoices,       setInvoices]       = useState([]);
  const [acts,           setActs]           = useState([]);
  const [payments,       setPayments]       = useState([]);
  const [employees,      setEmployees]      = useState([]);
  const [payrollRecords, setPayrollRecords] = useState([]);
  const [leaveRecords,   setLeaveRecords]   = useState([]);
  const [hrOrders,       setHrOrders]       = useState([]);
  const [clients,        setClients]        = useState([]);
  const [products,       setProducts]       = useState([]);
  const [trash,          setTrash]          = useState([]);
  const [loading,        setLoading]        = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      dbSelect('transactions',    { fopId }),
      dbSelect('movements',       { fopId }),
      dbSelect('debts',           { fopId }),
      dbSelect('vat_invoices',    { fopId }),
      dbSelect('invoices',        { fopId }),
      dbSelect('acts',            { fopId }),
      dbSelect('payments',        { fopId }),
      dbSelect('employees',       { fopId }),
      dbSelect('payroll_records', { fopId }),
      dbSelect('leave_records',   { fopId }),
      dbSelect('hr_orders',       { fopId }),
      dbSelect('clients',         { fopId }),
      dbSelect('products',        { fopId }),
      dbSelect('trash',           { fopId }),
    ]).then(([tx, mv, db_, vat, inv, ac, pay, emp, pr, lv, hro, cl, prod, tr]) => {
      if (!alive) return;
      setTransactions(tx);
      setMovements(mv);
      setDebts(db_);
      setVatInvoices(vat);
      setInvoices(inv);
      setActs(ac.map(actFromRow));
      setPayments(pay);
      setEmployees(emp);
      setPayrollRecords(pr.map(payrollFromRow));
      setLeaveRecords(lv);
      setHrOrders(hro);
      setClients(cl);
      setProducts(prod);
      setTrash(tr.map(trashFromRow));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [fopId]);

  // ─── Фабрики CRUD ────────────────────────────────────────────
  const mk = useCallback((extra = {}) => ({
    id: newId(), fopId, createdAt: new Date().toISOString(), ...extra,
  }), [fopId]);

  const stripMeta = ({ id, fopId: _f, createdAt: _c, ...clean }) => clean;

  // ─── Транзакції ──────────────────────────────────────────────
  const addTransaction = useCallback((t) => {
    const item = { ...mk(), ...t, id: newId(), fopId };
    setTransactions(p => [...p, item]);
    dbInsert('transactions', item);
    return item;
  }, [fopId, mk]);

  const updateTransaction = useCallback((id, patch) => {
    setTransactions(p => p.map(t => t.id === id ? { ...t, ...patch } : t));
    dbUpdate('transactions', id, stripMeta(patch));
  }, []);

  const deleteTransaction = useCallback((id) => {
    setTransactions(prev => {
      const item = prev.find(t => t.id === id);
      if (item) {
        const trashItem = { id: newId(), fopId, kind: 'transaction', data: item, deletedAt: new Date().toISOString() };
        setTrash(tr => [...tr, trashItem]);
        dbInsert('trash', trashToRow(trashItem));
      }
      return prev.filter(t => t.id !== id);
    });
    dbDelete('transactions', id);
  }, [fopId]);

  // ─── Склад ───────────────────────────────────────────────────
  const addMovement = useCallback((m) => {
    const item = { ...mk(), ...m, id: newId(), fopId };
    setMovements(p => [...p, item]);
    dbInsert('movements', item);
    return item;
  }, [fopId, mk]);

  const deleteMovement = useCallback((id) => {
    setMovements(prev => {
      const item = prev.find(m => m.id === id);
      if (item) {
        const t = { id: newId(), fopId, kind: 'movement', data: item, deletedAt: new Date().toISOString() };
        setTrash(tr => [...tr, t]); dbInsert('trash', trashToRow(t));
      }
      return prev.filter(m => m.id !== id);
    });
    dbDelete('movements', id);
  }, [fopId]);

  // ─── Борги ───────────────────────────────────────────────────
  const addDebt = useCallback((d) => {
    const item = { ...mk(), ...d, id: newId(), fopId };
    setDebts(p => [...p, item]); dbInsert('debts', item);
    return item;
  }, [fopId, mk]);

  const updateDebt = useCallback((id, patch) => {
    setDebts(p => p.map(d => d.id === id ? { ...d, ...patch } : d));
    dbUpdate('debts', id, stripMeta(patch));
  }, []);

  const deleteDebt = useCallback((id) => {
    setDebts(prev => {
      const item = prev.find(d => d.id === id);
      if (item) {
        const t = { id: newId(), fopId, kind: 'debt', data: item, deletedAt: new Date().toISOString() };
        setTrash(tr => [...tr, t]); dbInsert('trash', trashToRow(t));
      }
      return prev.filter(d => d.id !== id);
    });
    dbDelete('debts', id);
  }, [fopId]);

  // ─── ПН ──────────────────────────────────────────────────────
  const addVatInvoice = useCallback((v) => {
    const item = { ...mk(), ...v, id: newId(), fopId };
    setVatInvoices(p => [...p, item]); dbInsert('vat_invoices', item);
    return item;
  }, [fopId, mk]);

  const deleteVatInvoice = useCallback((id) => {
    setVatInvoices(prev => {
      const item = prev.find(v => v.id === id);
      if (item) {
        const t = { id: newId(), fopId, kind: 'vatInvoice', data: item, deletedAt: new Date().toISOString() };
        setTrash(tr => [...tr, t]); dbInsert('trash', trashToRow(t));
      }
      return prev.filter(v => v.id !== id);
    });
    dbDelete('vat_invoices', id);
  }, [fopId]);

  // ─── Рахунки ─────────────────────────────────────────────────
  const addInvoice = useCallback((inv) => {
    const item = { ...mk(), ...inv, id: newId(), fopId };
    setInvoices(p => [...p, item]); dbInsert('invoices', item);
    return item;
  }, [fopId, mk]);

  const updateInvoice = useCallback((id, patch) => {
    setInvoices(p => p.map(i => i.id === id ? { ...i, ...patch } : i));
    dbUpdate('invoices', id, stripMeta(patch));
  }, []);

  const deleteInvoice = useCallback((id) => {
    setInvoices(prev => {
      const item = prev.find(i => i.id === id);
      if (item) {
        const t = { id: newId(), fopId, kind: 'invoice', data: item, deletedAt: new Date().toISOString() };
        setTrash(tr => [...tr, t]); dbInsert('trash', trashToRow(t));
      }
      return prev.filter(i => i.id !== id);
    });
    // каскад у базі приберe acts/payments; чистимо і локально
    setActs(p => p.filter(a => a.invoiceId !== id));
    setPayments(p => p.filter(pm => pm.invoiceId !== id));
    dbDelete('invoices', id);
  }, [fopId]);

  // ─── Акти ────────────────────────────────────────────────────
  const addAct = useCallback((act) => {
    const item = { ...mk(), ...act, id: newId(), fopId };
    setActs(p => [...p, item]); dbInsert('acts', actToRow(item));
    return item;
  }, [fopId, mk]);

  const updateAct = useCallback((id, patch) => {
    setActs(p => p.map(a => a.id === id ? { ...a, ...patch } : a));
    dbUpdate('acts', id, actToRow({ ...stripMeta(patch), type: patch.type }));
  }, []);

  const deleteAct = useCallback((id) => {
    setActs(prev => {
      const item = prev.find(a => a.id === id);
      if (item) {
        const t = { id: newId(), fopId, kind: 'act', data: item, deletedAt: new Date().toISOString() };
        setTrash(tr => [...tr, t]); dbInsert('trash', trashToRow(t));
      }
      return prev.filter(a => a.id !== id);
    });
    dbDelete('acts', id);
  }, [fopId]);

  // ─── Оплати (+ авто-транзакція) ─────────────────────────────
  const addPayment = useCallback((payment, { invoice } = {}) => {
    const item = { ...mk(), ...payment, id: newId(), fopId };
    setPayments(p => [...p, item]);
    dbInsert('payments', item);

    const transType = payment.direction === 'outgoing' ? 'income' : 'expense';
    const txDesc = invoice
      ? `Оплата по рах. №${invoice.number}${invoice.clientName ? ' від ' + invoice.clientName : ''}`
      : (payment.notes || 'Оплата по рахунку');

    addTransaction({
      date: payment.date, type: transType,
      counterparty: invoice?.clientName || payment.counterparty || '',
      amount: +payment.amount || 0,
      description: txDesc,
      invoicePaymentId: item.id,
    });

    const comm = +payment.acquiringCommission || 0;
    if (comm > 0) {
      addTransaction({
        date: payment.date, type: 'expense', counterparty: 'Банк (еквайринг)',
        amount: comm, description: `Комісія еквайрингу по рах. №${invoice?.number || ''}`,
        invoicePaymentId: item.id,
      });
    }
    return item;
  }, [fopId, mk, addTransaction]);

  const deletePayment = useCallback((id) => {
    setPayments(prev => {
      const item = prev.find(p => p.id === id);
      if (item) {
        const t = { id: newId(), fopId, kind: 'payment', data: item, deletedAt: new Date().toISOString() };
        setTrash(tr => [...tr, t]); dbInsert('trash', trashToRow(t));
      }
      return prev.filter(p => p.id !== id);
    });
    setTransactions(prev => {
      prev.filter(t => t.invoicePaymentId === id).forEach(t => dbDelete('transactions', t.id));
      return prev.filter(t => t.invoicePaymentId !== id);
    });
    dbDelete('payments', id);
  }, [fopId]);

  // ─── Працівники ──────────────────────────────────────────────
  const addEmployee = useCallback((emp) => {
    const item = { ...mk(), ...emp, id: newId(), fopId };
    setEmployees(p => [...p, item]); dbInsert('employees', item);
    return item;
  }, [fopId, mk]);

  const updateEmployee = useCallback((id, patch) => {
    setEmployees(p => p.map(e => e.id === id ? { ...e, ...patch } : e));
    dbUpdate('employees', id, stripMeta(patch));
  }, []);

  const deleteEmployee = useCallback((id) => {
    setEmployees(prev => {
      const item = prev.find(e => e.id === id);
      if (item) {
        const t = { id: newId(), fopId, kind: 'employee', data: item, deletedAt: new Date().toISOString() };
        setTrash(tr => [...tr, t]); dbInsert('trash', trashToRow(t));
      }
      return prev.filter(e => e.id !== id);
    });
    dbDelete('employees', id);
  }, [fopId]);

  // ─── Зарплата ────────────────────────────────────────────────
  const addPayrollRecord = useCallback((record) => {
    const item = { ...mk(), ...record, id: newId(), fopId };
    setPayrollRecords(p => [...p, item]);
    dbInsert('payroll_records', payrollToRow(item));
    return item;
  }, [fopId, mk]);

  const updatePayrollRecord = useCallback((id, patch) => {
    setPayrollRecords(p => p.map(r => {
      if (r.id !== id) return r;
      const merged = { ...r, ...patch };
      const { id: _i, fopId: _f, employeeId, period, status, createdAt: _c, ...rest } = merged;
      dbUpdate('payroll_records', id, { employeeId, period, status, data: rest });
      return merged;
    }));
  }, []);

  const deletePayrollRecord = useCallback((id) => {
    setPayrollRecords(prev => {
      const item = prev.find(r => r.id === id);
      if (item) {
        const t = { id: newId(), fopId, kind: 'payrollRecord', data: item, deletedAt: new Date().toISOString() };
        setTrash(tr => [...tr, t]); dbInsert('trash', trashToRow(t));
      }
      return prev.filter(r => r.id !== id);
    });
    dbDelete('payroll_records', id);
  }, [fopId]);

  const approveAndPayPayroll = useCallback((recordId, paidDate) => {
    setPayrollRecords(prev => prev.map(r => {
      if (r.id !== recordId) return r;
      const emp  = employees.find(e => e.id === r.employeeId);
      const name = emp?.fullName || 'Працівник';
      const period = r.period || '';

      // Фіксується ЛИШЕ факт виплати з/п працівнику (касовий метод).
      // Податки (ПДФО/ВЗ/ЄСВ) — НЕ створюються автоматично: це нараховані
      // зобов'язання, а сплата фіксується окремою операцією банк/каса
      // (вручну чи з виписки, контрагент ДПС/ПФУ) — інакше стан
      // розрахунків з бюджетом показував би фейкову сплату.
      addTransaction({
        date: paidDate, type: 'expense', counterparty: name,
        amount: +r.netPay || 0, description: `Виплата з/п ${name} за ${period}`,
        payrollRecordId: r.id,
      });

      const merged = { ...r, status: 'paid', paidDate };
      const { id: _i, fopId: _f, employeeId, period: pd, status, createdAt: _c, ...rest } = merged;
      dbUpdate('payroll_records', r.id, { employeeId, period: pd, status, data: rest });
      return merged;
    }));
  }, [employees, addTransaction]);

  // ─── Відпустки ──────────────────────────────────────────────
  const addLeaveRecord = useCallback((leave) => {
    const item = { ...mk(), ...leave, id: newId(), fopId };
    setLeaveRecords(p => [...p, item]); dbInsert('leave_records', item);
    // списання днів з балансу працівника
    if (leave.employeeId && +leave.days > 0 && (leave.type === 'annual' || leave.leaveType === 'annual')) {
      setEmployees(prev => prev.map(e => {
        if (e.id !== leave.employeeId) return e;
        const used = round2((+e.leaveUsed || 0) + (+leave.days || 0));
        dbUpdate('employees', e.id, { leaveUsed: used });
        return { ...e, leaveUsed: used };
      }));
    }
    return item;
  }, [fopId, mk]);

  const deleteLeaveRecord = useCallback((id) => {
    setLeaveRecords(prev => {
      const item = prev.find(l => l.id === id);
      if (item && item.employeeId && (item.type === 'annual' || item.leaveType === 'annual')) {
        setEmployees(pe => pe.map(e => {
          if (e.id !== item.employeeId) return e;
          const used = Math.max(0, round2((+e.leaveUsed || 0) - (+item.days || 0)));
          dbUpdate('employees', e.id, { leaveUsed: used });
          return { ...e, leaveUsed: used };
        }));
      }
      return prev.filter(l => l.id !== id);
    });
    dbDelete('leave_records', id);
  }, []);

  // ─── Кадрові накази (Фаза 6) ────────────────────────────────
  const addHrOrder = useCallback((o) => {
    const item = { ...mk(), ...o, id: newId(), fopId };
    setHrOrders(p => [...p, item]); dbInsert('hr_orders', item);
    return item;
  }, [fopId, mk]);

  const deleteHrOrder = useCallback((id) => {
    setHrOrders(p => p.filter(o => o.id !== id));
    dbDelete('hr_orders', id);
  }, []);

  // ─── Довідники ──────────────────────────────────────────────
  const addClient = useCallback((c) => {
    const item = { ...mk(), ...c, id: newId(), fopId };
    setClients(p => [...p, item]); dbInsert('clients', item);
    return item;
  }, [fopId, mk]);

  const updateClient = useCallback((id, patch) => {
    setClients(p => p.map(c => c.id === id ? { ...c, ...patch } : c));
    dbUpdate('clients', id, stripMeta(patch));
  }, []);

  const deleteClient = useCallback((id) => {
    setClients(p => p.filter(c => c.id !== id));
    dbDelete('clients', id);
  }, []);

  const addProduct = useCallback((pr) => {
    const item = { ...mk(), ...pr, id: newId(), fopId };
    setProducts(p => [...p, item]); dbInsert('products', item);
    return item;
  }, [fopId, mk]);

  const updateProduct = useCallback((id, patch) => {
    setProducts(p => p.map(x => x.id === id ? { ...x, ...patch } : x));
    dbUpdate('products', id, stripMeta(patch));
  }, []);

  const deleteProduct = useCallback((id) => {
    setProducts(p => p.filter(x => x.id !== id));
    dbDelete('products', id);
  }, []);

  // ─── Кошик ──────────────────────────────────────────────────
  const restoreFromTrash = useCallback((trashId) => {
    setTrash(prev => {
      const item = prev.find(t => t.id === trashId);
      if (!item) return prev;
      const d = item.data;
      const reinsert = (setter, table, row) => { setter(p => [...p, d]); dbInsert(table, row || d); };
      if (item.kind === 'transaction')   reinsert(setTransactions, 'transactions');
      if (item.kind === 'movement')      reinsert(setMovements, 'movements');
      if (item.kind === 'debt')          reinsert(setDebts, 'debts');
      if (item.kind === 'vatInvoice')    reinsert(setVatInvoices, 'vat_invoices');
      if (item.kind === 'invoice')       reinsert(setInvoices, 'invoices');
      if (item.kind === 'act')           reinsert(setActs, 'acts', actToRow(d));
      if (item.kind === 'payment')       reinsert(setPayments, 'payments');
      if (item.kind === 'employee')      reinsert(setEmployees, 'employees');
      if (item.kind === 'payrollRecord') reinsert(setPayrollRecords, 'payroll_records', payrollToRow(d));
      dbDelete('trash', trashId);
      return prev.filter(t => t.id !== trashId);
    });
  }, []);

  const purgeFromTrash = useCallback((id) => {
    setTrash(prev => prev.filter(t => t.id !== id));
    dbDelete('trash', id);
  }, []);

  const purgeAllTrash = useCallback(() => {
    setTrash(prev => { prev.forEach(t => dbDelete('trash', t.id)); return []; });
  }, []);

  // ─── Резервна копія (експорт JSON — додатковий захист) ─────
  const exportBackup = useCallback(() => ({
    version: 5, exportedAt: new Date().toISOString(),
    transactions, movements, debts, vatInvoices, invoices, acts, payments,
    employees, payrollRecords, leaveRecords, hrOrders, clients, products, trash,
  }), [transactions, movements, debts, vatInvoices, invoices, acts, payments,
       employees, payrollRecords, leaveRecords, hrOrders, clients, products, trash]);

  const importBackup = useCallback((backup) => {
    if (!backup || typeof backup !== 'object') return { ok: false, error: 'Некоректний файл' };
    // Вставка кожного запису в базу з новими UUID + ремап зв'язків
    const remapInv = {}, remapEmp = {}, remapPay = {};
    const ins = (arr, table, prep = x => x, remap) => (Array.isArray(arr) ? arr : []).map(src => {
      const oldId = src.id;
      const item = { ...src, id: newId(), fopId };
      if (remap && oldId) remap[oldId] = item.id;
      dbInsert(table, prep(item));
      return item;
    });

    const inv = ins(backup.invoices, 'invoices', x => x, remapInv);
    const emp = ins(backup.employees, 'employees', x => x, remapEmp);
    const tx  = ins((backup.transactions||[]).map(t => ({ ...t, invoicePaymentId: null })), 'transactions');
    const ac  = ins((backup.acts||[]).map(a => ({ ...a, invoiceId: remapInv[a.invoiceId] || null })), 'acts', actToRow);
    const pay = ins((backup.payments||[]).map(p => ({ ...p, invoiceId: remapInv[p.invoiceId] || null })), 'payments', x => x, remapPay);
    const pr  = ins((backup.payrollRecords||[]).map(r => ({ ...r, employeeId: remapEmp[r.employeeId] || null })), 'payroll_records', payrollToRow);
    const lv  = ins((backup.leaveRecords||[]).map(l => ({ ...l, employeeId: remapEmp[l.employeeId] || null })), 'leave_records');
    const mv  = ins(backup.movements, 'movements');
    const db_ = ins(backup.debts, 'debts');
    const vat = ins(backup.vatInvoices, 'vat_invoices');
    const cl  = ins(backup.clients, 'clients');
    const prod= ins(backup.products, 'products');

    setInvoices(p => [...p, ...inv]);   setEmployees(p => [...p, ...emp]);
    setTransactions(p => [...p, ...tx]); setActs(p => [...p, ...ac]);
    setPayments(p => [...p, ...pay]);    setPayrollRecords(p => [...p, ...pr]);
    setLeaveRecords(p => [...p, ...lv]); setMovements(p => [...p, ...mv]);
    setDebts(p => [...p, ...db_]);       setVatInvoices(p => [...p, ...vat]);
    setClients(p => [...p, ...cl]);      setProducts(p => [...p, ...prod]);
    return { ok: true };
  }, [fopId]);

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh',
                  fontFamily:'system-ui', color:'#4a6b62' }}>
      Завантаження даних ФОП…
    </div>
  );

  return (
    <DataContext.Provider value={{
      transactions,  addTransaction, updateTransaction, deleteTransaction,
      movements,     addMovement,       deleteMovement,
      debts,         addDebt,   updateDebt,   deleteDebt,
      vatInvoices,   addVatInvoice,     deleteVatInvoice,
      invoices,      addInvoice, updateInvoice, deleteInvoice,
      acts,          addAct,     updateAct,     deleteAct,
      payments,      addPayment,        deletePayment,
      employees,     addEmployee, updateEmployee, deleteEmployee,
      payrollRecords, addPayrollRecord, updatePayrollRecord, deletePayrollRecord, approveAndPayPayroll,
      leaveRecords,  addLeaveRecord,    deleteLeaveRecord,
      hrOrders,      addHrOrder,        deleteHrOrder,
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
