import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { useFop } from '../../context/FopContext';
import { openPrintWindow } from '../../utils/printWindow';
import { fmtMoney } from '../../utils/documentLogic';

const ORDER_TYPES = [
  { id: 'hire',     label: 'Про прийняття на роботу' },
  { id: 'transfer', label: 'Про переведення (посада/оклад)' },
  { id: 'leave',    label: 'Про надання щорічної відпустки' },
  { id: 'unpaid_leave', label: 'Про надання відпустки без збереження зарплати' },
  { id: 'bonus',    label: 'Про преміювання' },
  { id: 'dismiss',  label: 'Про звільнення' },
];

const buildOrderHtml = (order, emp, fop) => {
  const t = ORDER_TYPES.find(x => x.id === order.orderType)?.label || 'Наказ';
  const d = order.details || {};
  let body = '';
  if (order.orderType === 'hire') body = `
<p>ПРИЙНЯТИ:</p>
<p><b>${emp?.fullName || ''}</b> (РНОКПП ${emp?.rnokpp || '—'}) на посаду
<b>${d.position || emp?.position || '—'}</b> з ${order.effectiveDate || order.orderDate}
з окладом <b>${fmtMoney(d.salary ?? emp?.salary ?? 0)} грн</b> на місяць.</p>
<p>Підстава: заява працівника від ${d.basis || '___________'}.</p>`;
  if (order.orderType === 'transfer') body = `
<p>ПЕРЕВЕСТИ:</p>
<p><b>${emp?.fullName || ''}</b> з посади <b>${d.fromPosition || '—'}</b>
(оклад ${fmtMoney(d.fromSalary || 0)} грн) на посаду <b>${d.position || '—'}</b>
з окладом <b>${fmtMoney(d.salary || 0)} грн</b> з ${order.effectiveDate || order.orderDate}.</p>
<p>Підстава: ${d.basis || 'заява працівника'}.</p>`;
  if (order.orderType === 'leave') body = `
<p>НАДАТИ:</p>
<p><b>${emp?.fullName || ''}</b> (${emp?.position || '—'}) щорічну основну відпустку
тривалістю <b>${d.days || '—'}</b> календарних днів з <b>${d.startDate || '—'}</b> по <b>${d.endDate || '—'}</b>
${d.workYear ? `за робочий рік ${d.workYear}` : ''}.</p>
<p>Підстава: ${d.basis || 'заява працівника, графік відпусток'}.</p>`;
  if (order.orderType === 'unpaid_leave') body = `
<p>НАДАТИ:</p>
<p><b>${emp?.fullName || ''}</b> (${emp?.position || '—'}) відпустку без збереження заробітної плати
тривалістю <b>${d.days || '—'}</b> календарних днів з <b>${d.startDate || '—'}</b> по <b>${d.endDate || '—'}</b>
(${d.article || 'ст. 26 Закону України «Про відпустки»'}).</p>
<p>Підстава: ${d.basis || 'заява працівника'}.</p>`;
  if (order.orderType === 'bonus') body = `
<p>ПРЕМІЮВАТИ:</p>
<p><b>${emp?.fullName || ''}</b> (${emp?.position || '—'}) премією у розмірі
<b>${fmtMoney(d.amount || 0)} грн</b> ${d.period ? `за ${d.period}` : ''}.</p>
<p>Підстава: ${d.basis || 'подання керівника'}.</p>
<p>Премію включити до нарахування за відповідний період (поле «Інші нарахування»).</p>`;
  if (order.orderType === 'dismiss') body = `
<p>ЗВІЛЬНИТИ:</p>
<p><b>${emp?.fullName || ''}</b> з посади <b>${emp?.position || '—'}</b>
${order.effectiveDate || order.orderDate} р. ${d.basis ? `(${d.basis})` : '(ст. 38 КЗпП України, за власним бажанням)'}.</p>
<p>Бухгалтерії провести повний розрахунок, включно з компенсацією за
невикористану відпустку.</p>`;

  return `<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8"><title>Наказ №${order.orderNumber}</title>
<style>body{font-family:Arial,sans-serif;font-size:13px;margin:40px;color:#111;line-height:1.5}
h2,h3{text-align:center;margin:4px 0}.center{text-align:center}
.sig{margin-top:50px;display:flex;justify-content:space-between}
@media print{body{margin:20mm}}</style></head><body>
<h3>ФОП ${fop?.fullName || ''}</h3>
<p class="center">РНОКПП ${fop?.rnokpp || ''}${fop?.legalAddress ? ' · ' + fop.legalAddress : ''}</p>
<h2 style="margin-top:24px">НАКАЗ № ${order.orderNumber}</h2>
<p class="center">від ${order.orderDate} р.</p>
<p class="center"><b>${t}</b></p>
${body}
<div class="sig">
  <div>ФОП ${fop?.fullName || ''}<br><br>___________________<br><small>(підпис)</small></div>
  <div>З наказом ознайомлений(а):<br><br>___________________<br><small>(підпис працівника)</small></div>
</div>
</body></html>`;
};

const HrOrders = ({ employees }) => {
  const { hrOrders, addHrOrder, deleteHrOrder, updateEmployee, addLeaveRecord } = useData();
  const { activeFop } = useFop();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({
    employeeId: '', orderType: 'transfer', orderNumber: '',
    orderDate: new Date().toISOString().slice(0, 10), effectiveDate: '',
    position: '', salary: '', amount: '', period: '', basis: '',
    startDate: '', days: '', workYear: '',
  });
  const set = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const nextNumber = useMemo(() => {
    const year = new Date().getFullYear();
    const inYear = hrOrders.filter(o => (o.orderDate || '').startsWith(String(year)));
    return `${inYear.length + 1}-К/${year}`;
  }, [hrOrders]);

  const handleSave = () => {
    const emp = employees.find(e => e.id === form.employeeId);
    if (!emp) { alert('Оберіть працівника'); return; }
    const isLeave = form.orderType === 'leave' || form.orderType === 'unpaid_leave';
    let endDate = '';
    if (isLeave) {
      if (!form.startDate || !(+form.days > 0)) { alert('Вкажіть дату початку і кількість календарних днів відпустки'); return; }
      // Святкові дні тривалість не подовжують: у воєнний час ст. 73 КЗпП не застосовується
      // (ч. 6 ст. 6 Закону № 2136-IX).
      const [y, m, d0] = form.startDate.split('-').map(Number);
      const e = new Date(y, m - 1, d0 + Math.round(+form.days) - 1);
      endDate = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`;
    }
    const details = {
      basis: form.basis,
      ...(isLeave && { startDate: form.startDate, endDate, days: Math.round(+form.days), workYear: form.workYear }),
      ...(form.orderType === 'hire'     && { position: form.position || emp.position, salary: +form.salary || +emp.salary }),
      ...(form.orderType === 'transfer' && { fromPosition: emp.position, fromSalary: +emp.salary, position: form.position, salary: +form.salary }),
      ...(form.orderType === 'bonus'    && { amount: +form.amount, period: form.period }),
    };
    const order = addHrOrder({
      employeeId: emp.id, orderType: form.orderType,
      orderNumber: form.orderNumber || nextNumber,
      orderDate: form.orderDate,
      effectiveDate: isLeave ? form.startDate : (form.effectiveDate || form.orderDate),
      details,
    });
    // Відпустка з наказу одразу потрапляє в облік відпусток — звідти її беруть табель і нарахування
    if (isLeave) {
      addLeaveRecord({
        type: form.orderType === 'leave' ? 'annual' : 'unpaid', employeeId: emp.id,
        startDate: form.startDate, endDate, days: Math.round(+form.days),
        notes: `Наказ № ${order.orderNumber}`,
      });
    }
    if (form.orderType === 'transfer') {
      const eff = form.effectiveDate || form.orderDate;
      // Підвищення окладу: місяць підвищення стає базовим для індексації (п. 5 Порядку № 1078)
      const raised = +form.salary > +emp.salary;
      updateEmployee(emp.id, {
        position: form.position || emp.position, salary: +form.salary || +emp.salary,
        ...(raised && { indexBaseMonth: eff.slice(0, 7) }),
      });
    }
    if (form.orderType === 'dismiss')  updateEmployee(emp.id, { isActive: false, fireDate: form.effectiveDate || form.orderDate });
    openPrintWindow(buildOrderHtml(order, emp, activeFop), { fop: activeFop });
    setShow(false);
  };

  return (
    <div style={{ marginTop: 20 }}>
      <div className="view-toolbar" style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Кадрові накази</h3>
        <button className="btn btn--primary btn--sm" onClick={() => { setForm(p => ({ ...p, orderNumber: nextNumber })); setShow(v => !v); }}>+ Наказ</button>
      </div>

      {show && (
        <div className="inline-form">
          <div className="form-row-4">
            <div className="field"><label>Працівник</label>
              <select name="employeeId" value={form.employeeId} onChange={set}>
                <option value="">— оберіть —</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
              </select></div>
            <div className="field"><label>Тип наказу</label>
              <select name="orderType" value={form.orderType} onChange={set}>
                {ORDER_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select></div>
            <div className="field"><label>№ наказу</label>
              <input name="orderNumber" value={form.orderNumber} onChange={set} /></div>
            <div className="field"><label>Дата наказу</label>
              <input type="date" name="orderDate" value={form.orderDate} onChange={set} /></div>
          </div>
          <div className="form-row-4">
            {(form.orderType === 'leave' || form.orderType === 'unpaid_leave') ? (<>
              <div className="field"><label>Початок відпустки</label>
                <input type="date" name="startDate" value={form.startDate} onChange={set} /></div>
              <div className="field"><label>Календарних днів</label>
                <input type="number" name="days" value={form.days} onChange={set} min="1" /></div>
              {form.orderType === 'leave' && (
                <div className="field"><label>За робочий рік</label>
                  <input name="workYear" value={form.workYear} onChange={set} placeholder="10.01.2026 – 09.01.2027" /></div>
              )}
            </>) : (
              <div className="field"><label>Дата набуття чинності</label>
                <input type="date" name="effectiveDate" value={form.effectiveDate} onChange={set} /></div>
            )}
            {(form.orderType === 'hire' || form.orderType === 'transfer') && (<>
              <div className="field"><label>Нова посада</label>
                <input name="position" value={form.position} onChange={set} /></div>
              <div className="field"><label>Новий оклад, грн</label>
                <input type="number" name="salary" value={form.salary} onChange={set} min="0" /></div>
            </>)}
            {form.orderType === 'bonus' && (<>
              <div className="field"><label>Сума премії, грн</label>
                <input type="number" name="amount" value={form.amount} onChange={set} min="0" /></div>
              <div className="field"><label>За період</label>
                <input name="period" value={form.period} onChange={set} placeholder="червень 2026" /></div>
            </>)}
            <div className="field"><label>Підстава</label>
              <input name="basis" value={form.basis} onChange={set} placeholder="заява від ..." /></div>
          </div>
          <div className="form-actions">
            <button className="btn btn--primary" onClick={handleSave}>Зберегти і надрукувати</button>
            <button className="btn btn--ghost" onClick={() => setShow(false)}>Скасувати</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>№</th><th>Дата</th><th>Тип</th><th>Працівник</th><th></th></tr></thead>
          <tbody>
            {hrOrders.length === 0 ? (
              <tr><td colSpan={5} className="table-empty">Наказів немає</td></tr>
            ) : [...hrOrders].sort((a, b) => (b.orderDate || '').localeCompare(a.orderDate || '')).map(o => {
              const emp = employees.find(e => e.id === o.employeeId);
              return (
                <tr key={o.id}>
                  <td>{o.orderNumber}</td>
                  <td>{o.orderDate}</td>
                  <td>{ORDER_TYPES.find(t => t.id === o.orderType)?.label || o.orderType}</td>
                  <td>{emp?.fullName || '—'}</td>
                  <td><div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn--ghost btn--sm" onClick={() => openPrintWindow(buildOrderHtml(o, emp, activeFop), { fop: activeFop })}>🖨</button>
                    <button className="btn-icon btn-icon--del" onClick={() => window.confirm('Видалити наказ?') && deleteHrOrder(o.id)}>✕</button>
                  </div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HrOrders;
