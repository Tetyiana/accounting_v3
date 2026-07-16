// Одноразове перенесення даних зі старого localStorage-сховища в Supabase.
// Викликається з Налаштувань. Знаходить всіх ФОПів усіх локальних
// користувачів цього браузера і переносить під поточний обліковий запис.
import { supabase } from '../lib/supabase';
import { toRow, newId } from '../lib/db';

const parse = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };

export const findLocalFops = () => {
  const fops = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('fop_list_')) {
      const list = parse(key);
      if (Array.isArray(list)) fops.push(...list);
    }
  }
  return fops;
};

const T = (suffix, fopId) => parse(`fop_${suffix}_${fopId}`) || [];

export const migrateLocalToSupabase = async (userId) => {
  const localFops = findLocalFops();
  if (!localFops.length) return { ok: false, error: 'Локальних даних не знайдено' };

  let counts = { fops: 0, records: 0 };

  for (const oldFop of localFops) {
    const oldId = oldFop.id;
    const fopId = newId();
    const { id: _i, createdAt: _c, ...fopData } = oldFop;
    const { error: fe } = await supabase.from('fops').insert(toRow({ ...fopData, id: fopId, userId }));
    if (fe) { console.error('fop insert:', fe.message); continue; }
    counts.fops++;

    const remapInv = {}, remapEmp = {};
    const bulk = async (table, rows) => {
      if (!rows.length) return;
      const { error } = await supabase.from(table).insert(rows.map(toRow));
      if (error) console.error(`${table}:`, error.message);
      else counts.records += rows.length;
    };

    const invoices = T('inv', oldId).map(r => { const nid = newId(); remapInv[r.id] = nid;
      const { id, createdAt, ...x } = r; return { ...x, id: nid, fopId }; });
    const employees = T('emp', oldId).map(r => { const nid = newId(); remapEmp[r.id] = nid;
      const { id, createdAt, ...x } = r; return { ...x, id: nid, fopId }; });

    await bulk('invoices', invoices);
    await bulk('employees', employees);
    await bulk('transactions', T('tx', oldId).map(r => {
      const { id, createdAt, invoicePaymentId, ...x } = r; return { ...x, id: newId(), fopId }; }));
    await bulk('acts', T('acts', oldId).map(r => {
      const { id, createdAt, type, invoiceId, ...x } = r;
      return { ...x, actType: type, invoiceId: remapInv[invoiceId] || null, id: newId(), fopId }; }));
    await bulk('payments', T('pay', oldId).map(r => {
      const { id, createdAt, invoiceId, ...x } = r;
      return { ...x, invoiceId: remapInv[invoiceId] || null, id: newId(), fopId }; }));
    await bulk('payroll_records', T('payroll', oldId).map(r => {
      const { id, createdAt, fopId: _f, employeeId, period, status, ...rest } = r;
      return { id: newId(), fopId, employeeId: remapEmp[employeeId] || null, period, status, data: rest }; }));
    await bulk('leave_records', T('leave', oldId).map(r => {
      const { id, createdAt, employeeId, ...x } = r;
      return { ...x, employeeId: remapEmp[employeeId] || null, id: newId(), fopId }; }));
    await bulk('movements',    T('mv', oldId).map(r => { const { id, createdAt, ...x } = r; return { ...x, id: newId(), fopId }; }));
    await bulk('debts',        T('debts', oldId).map(r => { const { id, createdAt, ...x } = r; return { ...x, id: newId(), fopId }; }));
    await bulk('vat_invoices', T('vat', oldId).map(r => { const { id, createdAt, ...x } = r; return { ...x, id: newId(), fopId }; }));
    await bulk('clients',      T('clients', oldId).map(r => { const { id, createdAt, vatCertificate, ...x } = r; return { ...x, id: newId(), fopId }; }));
    await bulk('products',     T('products', oldId).map(r => { const { id, createdAt, ...x } = r; return { ...x, id: newId(), fopId }; }));
  }

  return { ok: true, ...counts };
};
