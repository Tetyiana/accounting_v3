import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useFop } from '../context/FopContext';
import {
  buildWarehouseMovements, calcWarehouse, MOVEMENT_KINDS, kindLabel, itemKey,
} from '../utils/warehouseLogic';
import { UNITS } from '../constants/documentTypes';
import { openPrintWindow } from '../utils/printWindow';

// Склад: залишки за середньозваженою собівартістю і журнал руху.
// Накладні з «Продажі / Закупівлі» потрапляють сюди автоматично; вручну вносяться
// початкові залишки, виробництво, списання та інвентаризаційні різниці.

const today = () => new Date().toISOString().slice(0, 10);
const yearStart = () => `${new Date().getFullYear()}-01-01`;
const EMPTY = { date: today(), itemName: '', sku: '', batch: '', unit: 'шт', qty: '', price: '', counterparty: '', description: '', kind: '' };
const fmtQty = n => (+n || 0).toLocaleString('uk-UA', { maximumFractionDigits: 3 });
const fmtMoney = n => (+n || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const R = { textAlign: 'right' };

const WarehouseView = () => {
  const { movements, addMovement, deleteMovement, acts, invoices, products } = useData();
  const { activeFop } = useFop();
  const [tab, setTab]           = useState('stock');
  const [showForm, setShowForm] = useState(false);
  const [opType, setOpType]     = useState('in');
  const [form, setForm]         = useState(EMPTY);
  const [filter, setFilter]     = useState({ itemName: '', dateStart: yearStart(), dateEnd: today() });
  const [err, setErr]           = useState('');

  const set  = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  const setF = e => setFilter(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const all = useMemo(
    () => buildWarehouseMovements({ movements, acts, invoices, products }),
    [movements, acts, invoices, products]);

  const { rows, items } = useMemo(
    () => calcWarehouse(all, { dateStart: filter.dateStart, dateEnd: filter.dateEnd }),
    [all, filter.dateStart, filter.dateEnd]);

  const q = filter.itemName.trim().toLowerCase();
  const match = (x) => !q || (x.itemName || '').toLowerCase().includes(q) || (x.sku || '').toLowerCase().includes(q);
  const shownItems = useMemo(() => items.filter(match), [items, q]);          // eslint-disable-line react-hooks/exhaustive-deps
  const shownRows  = useMemo(() => rows.filter(match).reverse(), [rows, q]);   // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => shownItems.reduce((t, it) => ({
    openValue: t.openValue + it.openValue, inValue: t.inValue + it.inValue,
    outValue: t.outValue + it.outValue, value: t.value + it.value,
  }), { openValue: 0, inValue: 0, outValue: 0, value: 0 }), [shownItems]);

  // Підказки назв: довідник товарів + позиції, що вже є на складі
  const nameOptions = useMemo(() => {
    const names = new Set(items.map(i => i.itemName));
    (products || []).forEach(p => p.name && names.add(p.name));
    return [...names].sort((a, b) => a.localeCompare(b, 'uk'));
  }, [items, products]);

  const openForm = (type) => {
    setOpType(type);
    setForm({ ...EMPTY, kind: MOVEMENT_KINDS[type][0].id });
    setErr(''); setShowForm(true);
  };

  // Вибрано відому позицію — підставляємо її артикул, одиницю і ціну
  const onNameChange = (e) => {
    const name = e.target.value;
    const known = items.find(i => i.itemName === name);
    const product = (products || []).find(p => p.name === name);
    setForm(prev => ({
      ...prev, itemName: name,
      sku: prev.sku || known?.sku || '',
      unit: known?.unit || product?.unit || prev.unit,
      price: prev.price || (opType === 'out' ? '' : product?.price || ''),
    }));
  };

  const currentStock = useMemo(() => {
    if (!form.itemName) return null;
    const key = itemKey(form);
    return calcWarehouse(all, {}).items.find(i => i.key === key) || null;
  }, [all, form.itemName, form.sku]);   // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = () => {
    if (!form.itemName.trim() || !form.qty || !form.date) { setErr('Заповніть дату, найменування і кількість'); return; }
    if (isNaN(+form.qty) || +form.qty <= 0) { setErr('Некоректна кількість'); return; }
    if (opType === 'in' && form.kind !== 'return_in' && form.kind !== 'surplus' && !(+form.price > 0)) {
      setErr('Вкажіть ціну приходу — з неї рахується собівартість'); return;
    }
    if (opType === 'out' && currentStock && +form.qty > currentStock.qty &&
        !window.confirm(`На складі ${fmtQty(currentStock.qty)} ${currentStock.unit || ''}, а списується ${fmtQty(+form.qty)}. Залишок стане від'ємним. Зберегти?`)) return;
    addMovement({
      date: form.date, itemName: form.itemName.trim(), sku: form.sku.trim(), batch: form.batch.trim(),
      unit: form.unit || 'шт', qty: +form.qty, price: +form.price || 0,
      counterparty: form.counterparty.trim(), description: form.description.trim(),
      operation: opType, kind: form.kind,
      movementType: opType,   // стара обов'язкова колонка таблиці
    });
    setShowForm(false); setErr('');
  };

  const printStock = () => {
    const td = (v) => `<td style="text-align:right">${v}</td>`;
    const html = `<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8"><title>Оборотна відомість</title>
<style>body{font-family:Arial,sans-serif;font-size:10.5px;margin:24px}h2{font-size:14px;text-align:center;margin-bottom:4px}
table{border-collapse:collapse;width:100%;margin-top:8px}td,th{border:1px solid #333;padding:3px 5px}th{background:#f0f0f0}
@media print{body{margin:10mm}@page{size:A4 landscape}}</style></head><body>
<h2>Оборотна відомість по складу</h2>
<p style="text-align:center;margin-top:0">ФОП ${activeFop?.fullName || ''} · ${filter.dateStart || 'з початку'} — ${filter.dateEnd || today()}</p>
<table><thead>
<tr><th rowspan="2">Найменування</th><th rowspan="2">Артикул</th><th rowspan="2">Од.</th>
<th colspan="2">Залишок на початок</th><th colspan="2">Прихід</th><th colspan="2">Видаток</th><th colspan="2">Залишок на кінець</th><th rowspan="2">Собівартість од.</th></tr>
<tr><th>к-сть</th><th>сума</th><th>к-сть</th><th>сума</th><th>к-сть</th><th>сума</th><th>к-сть</th><th>сума</th></tr></thead><tbody>
${shownItems.map(it => `<tr><td>${it.itemName}</td><td>${it.sku || ''}</td><td>${it.unit || ''}</td>
${td(fmtQty(it.openQty))}${td(fmtMoney(it.openValue))}${td(fmtQty(it.inQty))}${td(fmtMoney(it.inValue))}
${td(fmtQty(it.outQty))}${td(fmtMoney(it.outValue))}${td(fmtQty(it.qty))}${td(fmtMoney(it.value))}${td(fmtMoney(it.avgCost))}</tr>`).join('')}
<tr style="font-weight:bold"><td colspan="3">Разом</td><td></td>${td(fmtMoney(totals.openValue))}<td></td>${td(fmtMoney(totals.inValue))}
<td></td>${td(fmtMoney(totals.outValue))}<td></td>${td(fmtMoney(totals.value))}<td></td></tr>
</tbody></table>
<p>Оцінка вибуття — за середньозваженою собівартістю.</p></body></html>`;
    openPrintWindow(html, { fop: activeFop });
  };

  const negativeItems = shownItems.filter(i => i.qty < 0 || i.negative);

  return (
    <div className="view-warehouse">
      <div className="view-toolbar">
        <h2 className="view-title">Складський облік</h2>
        <div className="toolbar-actions">
          <button className="btn btn--success" onClick={() => openForm('in')}>+ Прихід</button>
          <button className="btn btn--danger"  onClick={() => openForm('out')}>− Видаток</button>
          <button className="btn btn--ghost"   onClick={printStock}>🖨 Відомість</button>
        </div>
      </div>

      <p className="cell-muted" style={{ marginBottom: 12, fontSize: '.83rem' }}>
        Накладні на товар із «Продажі / Закупівлі» проводяться по складу автоматично (позначка «авто»).
        Вручну вносьте початкові залишки, виробництво, списання та різниці інвентаризації.
        Вибуття оцінюється за середньозваженою собівартістю.
      </p>

      {showForm && (
        <div className="inline-form">
          <div className="inline-form-header">
            <span>{opType === 'in' ? 'Прихід на склад' : 'Видаток зі складу'}</span>
            <button className="btn-close" onClick={() => setShowForm(false)}>✕</button>
          </div>
          {err && <div className="form-error">{err}</div>}
          <div className="form-row-4">
            <div className="field">
              <label>Дата <span className="req">*</span></label>
              <input type="date" name="date" value={form.date} onChange={set} />
            </div>
            <div className="field">
              <label>Вид операції</label>
              <select name="kind" value={form.kind} onChange={set}>
                {MOVEMENT_KINDS[opType].map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Найменування <span className="req">*</span></label>
              <input name="itemName" list="wh-items" value={form.itemName} onChange={onNameChange} placeholder="Назва товару" />
              <datalist id="wh-items">{nameOptions.map(n => <option key={n} value={n} />)}</datalist>
              {currentStock && (
                <span className="cell-muted" style={{ fontSize: '.76rem' }}>
                  На складі: {fmtQty(currentStock.qty)} {currentStock.unit}, собівартість {fmtMoney(currentStock.avgCost)} грн
                </span>
              )}
            </div>
            <div className="field">
              <label>Артикул (SKU)</label>
              <input name="sku" value={form.sku} onChange={set} placeholder="напр. SFS-EYE-15" />
            </div>
          </div>
          <div className="form-row-4">
            <div className="field">
              <label>Кількість <span className="req">*</span></label>
              <input type="number" name="qty" value={form.qty} onChange={set} placeholder="0" min="0.001" step="any" />
            </div>
            <div className="field">
              <label>Одиниця</label>
              <input name="unit" list="wh-units" value={form.unit} onChange={set} />
              <datalist id="wh-units">{UNITS.map(u => <option key={u} value={u} />)}</datalist>
            </div>
            <div className="field">
              <label>{opType === 'in' ? 'Ціна приходу (собівартість), грн' : 'Ціна продажу, грн'}</label>
              <input type="number" name="price" value={form.price} onChange={set} placeholder="0.00" min="0" step="0.01" />
            </div>
            <div className="field">
              <label>Партія</label>
              <input name="batch" value={form.batch} onChange={set} placeholder="напр. L-240618" />
            </div>
          </div>
          <div className="form-row-2">
            <div className="field">
              <label>Контрагент</label>
              <input name="counterparty" value={form.counterparty} onChange={set} placeholder="Постачальник або покупець" />
            </div>
            <div className="field">
              <label>Примітка</label>
              <input name="description" value={form.description} onChange={set} placeholder="Документ, підстава" />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn--primary" onClick={handleSave}>Зберегти</button>
            <button className="btn btn--ghost"   onClick={() => setShowForm(false)}>Скасувати</button>
          </div>
        </div>
      )}

      <div className="tabs-bar" style={{ marginBottom: 12 }}>
        <button className={`tab-pill${tab === 'stock' ? ' tab-pill--active' : ''}`} onClick={() => setTab('stock')}>Залишки й обороти</button>
        <button className={`tab-pill${tab === 'moves' ? ' tab-pill--active' : ''}`} onClick={() => setTab('moves')}>Рух товарів</button>
      </div>

      <div className="filters-bar">
        <input name="itemName" value={filter.itemName} onChange={setF} placeholder="Пошук по назві або артикулу" />
        <input type="date" name="dateStart" value={filter.dateStart} onChange={setF} title="Період з" />
        <input type="date" name="dateEnd"   value={filter.dateEnd}   onChange={setF} title="Період по" />
      </div>

      {negativeItems.length > 0 && (
        <div className="settings-msg settings-msg--error" style={{ marginBottom: 12 }}>
          ⚠ Від&apos;ємний залишок: {negativeItems.map(i => i.itemName).join(', ')}.
          Видаток проведено раніше або більше, ніж прихід — перевірте дати й кількість, внесіть початковий залишок.
        </div>
      )}

      {tab === 'stock' && (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr>
              <th>Найменування</th><th>Артикул</th><th>Од.</th>
              <th style={R}>На початок</th><th style={R}>Прихід</th><th style={R}>Видаток</th>
              <th style={R}>Залишок</th><th style={R}>Собівартість од.</th><th style={R}>Вартість залишку</th>
              <th style={R}>Продано на суму</th>
            </tr></thead>
            <tbody>
              {shownItems.length === 0 ? (
                <tr><td colSpan={10} className="table-empty">Позицій немає</td></tr>
              ) : shownItems.map(it => (
                <tr key={it.key}>
                  <td>{it.itemName}</td>
                  <td className="cell-muted">{it.sku || '—'}</td>
                  <td className="cell-muted">{it.unit || '—'}</td>
                  <td style={R}>{fmtQty(it.openQty)}</td>
                  <td style={R}>{it.inQty ? fmtQty(it.inQty) : '—'}</td>
                  <td style={R}>{it.outQty ? fmtQty(it.outQty) : '—'}</td>
                  <td style={{ ...R, fontWeight: 600, color: it.qty < 0 ? 'var(--error)' : undefined }}>{fmtQty(it.qty)}</td>
                  <td style={R}>{fmtMoney(it.avgCost)}</td>
                  <td style={R}>{fmtMoney(it.value)}</td>
                  <td style={R}>{it.saleAmount ? fmtMoney(it.saleAmount) : '—'}</td>
                </tr>
              ))}
              {shownItems.length > 0 && (
                <tr style={{ fontWeight: 700 }}>
                  <td colSpan={8} style={R}>Вартість залишків разом:</td>
                  <td style={R}>{fmtMoney(totals.value)}</td><td></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'moves' && (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr>
              <th>Дата</th><th>Операція</th><th>Найменування</th><th>Контрагент / документ</th>
              <th style={R}>Кількість</th><th style={R}>Ціна</th><th style={R}>Собівартість</th>
              <th style={R}>Залишок</th><th></th>
            </tr></thead>
            <tbody>
              {shownRows.length === 0 ? (
                <tr><td colSpan={9} className="table-empty">Рухів за період немає</td></tr>
              ) : shownRows.map(m => (
                <tr key={m.id} className={m.operation === 'in' ? 'row-income' : 'row-expense'}>
                  <td>{m.date}</td>
                  <td>
                    <span className={`badge badge--${m.operation === 'in' ? 'success' : 'danger'}`}>{kindLabel(m.operation, m.kind)}</span>
                    {m.auto && <span className="badge badge--info" style={{ marginLeft: 6, fontSize: '.68rem' }}>авто</span>}
                  </td>
                  <td>{m.itemName}{m.batch ? <span className="cell-muted"> · партія {m.batch}</span> : null}</td>
                  <td className="cell-muted">{[m.counterparty, m.description].filter(Boolean).join(' · ') || '—'}</td>
                  <td style={R}>{m.operation === 'in' ? '+' : '−'}{fmtQty(m.qty)} {m.unit || ''}</td>
                  <td style={R}>{m.price ? fmtMoney(m.price) : '—'}</td>
                  <td style={R}>{fmtMoney(m.costAmount)}</td>
                  <td style={{ ...R, fontWeight: 600, color: m.balance < 0 ? 'var(--error)' : undefined }}>{fmtQty(m.balance)}</td>
                  <td>
                    {!m.auto && (
                      <button className="btn-icon btn-icon--del" title="У кошик"
                        onClick={() => window.confirm('Перемістити запис у кошик?') && deleteMovement(m.id)}>✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default WarehouseView;
