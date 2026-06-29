import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { TABLE_CONFIGS } from '../constants/tableConfigs';
import DynamicTable from '../components/common/DynamicTable';

const EMPTY = { date: new Date().toISOString().slice(0,10), number: '', direction: 'outgoing', counterparty: '', amount: '' };
const fmt = n => (+n || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2 });
const VAT_RATE = 0.20;

const VatView = () => {
  const { vatInvoices, addVatInvoice, deleteVatInvoice } = useData();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(EMPTY);
  const [err, setErr]           = useState('');

  const set = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSave = () => {
    if (!form.number || !form.counterparty || !form.amount || !form.date) { setErr('Заповніть обов\'язкові поля'); return; }
    if (isNaN(+form.amount) || +form.amount <= 0) { setErr('Некоректна сума'); return; }
    addVatInvoice(form);
    setShowForm(false);
    setForm(EMPTY);
    setErr('');
  };

  const rows = useMemo(() => {
    return [...vatInvoices]
      .sort((a,b) => a.date.localeCompare(b.date))
      .map(v => {
        const amount = +v.amount || 0;
        const vatAmount = amount * VAT_RATE;
        return { ...v, amount, vatAmount, total: amount + vatAmount };
      });
  }, [vatInvoices]);

  const totals = useMemo(() => {
    const outgoing = rows.filter(r => r.direction === 'outgoing').reduce((s,r)=>s+r.vatAmount,0); // ПДВ зобов'язання
    const incoming = rows.filter(r => r.direction === 'incoming').reduce((s,r)=>s+r.vatAmount,0); // податковий кредит
    return { outgoing, incoming, toPay: Math.max(0, outgoing - incoming) };
  }, [rows]);

  const renderCell = (row, col) => {
    if (col.key === 'direction') {
      return (
        <span className={`badge badge--${row.direction === 'outgoing' ? 'success' : 'warning'}`}>
          {row.direction === 'outgoing' ? 'Видана' : 'Отримана'}
        </span>
      );
    }
    if (['amount','vatAmount','total'].includes(col.key)) return fmt(row[col.key]);
    return row[col.key] || '—';
  };

  return (
    <div className="view-vat">
      <div className="view-toolbar">
        <h2 className="view-title">ПДВ — Податкові накладні</h2>
        <div className="toolbar-actions">
          <button className="btn btn--primary" onClick={() => setShowForm(true)}>+ Накладна</button>
        </div>
      </div>

      <div className="stats-grid" style={{marginBottom: 16}}>
        <div className="stat-card">
          <div className="stat-label">ПДВ-зобов'язання (видані)</div>
          <div className="stat-value">{fmt(totals.outgoing)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Податковий кредит (отримані)</div>
          <div className="stat-value">{fmt(totals.incoming)}</div>
        </div>
        <div className="stat-card stat-card--accent">
          <div className="stat-label">До сплати</div>
          <div className="stat-value">{fmt(totals.toPay)}</div>
        </div>
      </div>

      {showForm && (
        <div className="inline-form">
          <div className="inline-form-header">
            <span>Нова податкова накладна</span>
            <button className="btn-close" onClick={() => setShowForm(false)}>✕</button>
          </div>
          {err && <div className="form-error">{err}</div>}
          <div className="form-row-4">
            <div className="field">
              <label>Дата <span className="req">*</span></label>
              <input type="date" name="date" value={form.date} onChange={set} />
            </div>
            <div className="field">
              <label>№ накладної <span className="req">*</span></label>
              <input name="number" value={form.number} onChange={set} placeholder="напр. 0000123" />
            </div>
            <div className="field">
              <label>Напрямок</label>
              <select name="direction" value={form.direction} onChange={set}>
                <option value="outgoing">Видана (продаж)</option>
                <option value="incoming">Отримана (закупівля)</option>
              </select>
            </div>
            <div className="field">
              <label>Контрагент <span className="req">*</span></label>
              <input name="counterparty" value={form.counterparty} onChange={set} placeholder="Назва" />
            </div>
          </div>
          <div className="field" style={{maxWidth: 240}}>
            <label>Сума без ПДВ, грн <span className="req">*</span></label>
            <input type="number" name="amount" value={form.amount} onChange={set} placeholder="0.00" min="0" step="0.01" />
          </div>
          <div className="form-actions">
            <button className="btn btn--primary" onClick={handleSave}>Зберегти</button>
            <button className="btn btn--ghost"   onClick={() => setShowForm(false)}>Скасувати</button>
          </div>
        </div>
      )}

      <DynamicTable
        config={TABLE_CONFIGS.VAT_INVOICES}
        data={rows}
        renderCell={renderCell}
        onDelete={(row) => window.confirm('Перемістити накладну в кошик?') && deleteVatInvoice(row.id)}
        emptyText="Накладних ще немає"
      />
    </div>
  );
};

export default VatView;
