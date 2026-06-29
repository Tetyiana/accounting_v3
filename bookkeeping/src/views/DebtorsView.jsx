import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useSettings } from '../context/SettingsContext';
import { TABLE_CONFIGS, DEBT_TYPES, DEBT_STATUSES } from '../constants/tableConfigs';
import DynamicTable from '../components/common/DynamicTable';
import { computeAutoDebts, fmtMoney } from '../utils/documentLogic';

const EMPTY = { date: new Date().toISOString().slice(0,10), type: 'debtor', counterparty: '', amount: '', dueDate: '', status: 'pending' };

const DebtorsView = () => {
  const { debts, addDebt, updateDebt, deleteDebt, invoices, acts, payments } = useData();
  const { settings } = useSettings();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(EMPTY);
  const [err, setErr]           = useState('');
  const [tab, setTab]           = useState('debtor');

  const set = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  // Авто-сформовані борги з документообігу
  const autoDebts = useMemo(() =>
    computeAutoDebts({ invoices, acts, payments }),
    [invoices, acts, payments]
  );

  // Об'єднуємо ручні + авто
  const allDebts = useMemo(() => {
    const manual = debts.map(d => ({ ...d, isAuto: false }));
    return [...manual, ...autoDebts];
  }, [debts, autoDebts]);

  const openForm = (type) => { setForm({ ...EMPTY, type }); setErr(''); setShowForm(true); };

  const handleSave = () => {
    if (!form.counterparty || !form.amount || !form.date) { setErr('Заповніть обов\'язкові поля'); return; }
    if (isNaN(+form.amount) || +form.amount <= 0) { setErr('Некоректна сума'); return; }
    addDebt(form);
    setShowForm(false);
    setErr('');
  };

  const rows = useMemo(() =>
    allDebts
      .filter(d => d.type === tab)
      .sort((a, b) => a.date.localeCompare(b.date)),
    [allDebts, tab]
  );

  const totals = useMemo(() => {
    const debtorTotal   = allDebts.filter(d => d.type === 'debtor'   && d.status !== 'paid').reduce((s,d)=>s+(+d.amount||0),0);
    const creditorTotal = allDebts.filter(d => d.type === 'creditor' && d.status !== 'paid').reduce((s,d)=>s+(+d.amount||0),0);
    return { debtorTotal, creditorTotal };
  }, [allDebts]);

  const renderCell = (row, col) => {
    if (col.key === 'type')   return DEBT_TYPES.find(t => t.id === row.type)?.label || row.type;
    if (col.key === 'amount') return (
      <span style={{ fontWeight: 600 }}>
        {fmtMoney(row.amount)}
        {row.isAuto && <span className="badge badge--info" style={{ marginLeft: 6, fontSize: '.68rem' }}>авто</span>}
      </span>
    );
    if (col.key === 'status') {
      if (row.isAuto) {
        return (
          <span className={`badge badge--${row.status === 'paid' ? 'success' : row.status === 'advance' ? 'warning' : 'muted'}`}>
            {row.status === 'advance' ? 'Аванс' : row.status === 'paid' ? 'Погашено' : 'Очікує'}
          </span>
        );
      }
      return (
        <select className="status-select" value={row.status}
          onChange={e => updateDebt(row.id, { status: e.target.value })}>
          {DEBT_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      );
    }
    if (col.key === 'counterparty' && row.note) {
      return <span title={row.note}>{row.counterparty} <span className="cell-muted" style={{fontSize:'.8rem'}}>({row.note})</span></span>;
    }
    return row[col.key] || '—';
  };

  return (
    <div className="view-debtors">
      <div className="view-toolbar">
        <h2 className="view-title">Дебітори / Кредитори</h2>
        <div className="toolbar-actions">
          <button className="btn btn--success" onClick={() => openForm('debtor')}>+ Дебітор (ручний)</button>
          <button className="btn btn--danger"  onClick={() => openForm('creditor')}>+ Кредитор (ручний)</button>
        </div>
      </div>

      <p className="cell-muted" style={{ marginBottom: 12, fontSize: '.83rem' }}>
        Авто-записи формуються з рахунків/актів/платежів у розділі «Продажі/Закупівлі».
        Ручне введення — тільки для введення залишків або позарахункових операцій.
      </p>

      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-label">Нам повинні (дебітори, непогашено)</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{fmtMoney(totals.debtorTotal)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Ми повинні (кредитори, непогашено)</div>
          <div className="stat-value" style={{ color: 'var(--error)' }}>{fmtMoney(totals.creditorTotal)}</div>
        </div>
      </div>

      {showForm && (
        <div className="inline-form">
          <div className="inline-form-header">
            <span>{form.type === 'debtor' ? 'Новий дебітор' : 'Новий кредитор'} (ручний запис / залишок)</span>
            <button className="btn-close" onClick={() => setShowForm(false)}>✕</button>
          </div>
          {err && <div className="form-error">{err}</div>}
          <div className="form-row-4">
            <div className="field">
              <label>Дата <span className="req">*</span></label>
              <input type="date" name="date" value={form.date} onChange={set} />
            </div>
            <div className="field">
              <label>Контрагент <span className="req">*</span></label>
              <input name="counterparty" value={form.counterparty} onChange={set} placeholder="Назва або ПІБ" />
            </div>
            <div className="field">
              <label>Сума, грн <span className="req">*</span></label>
              <input type="number" name="amount" value={form.amount} onChange={set} min="0" step="0.01" />
            </div>
            <div className="field">
              <label>Термін оплати</label>
              <input type="date" name="dueDate" value={form.dueDate} onChange={set} />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn--primary" onClick={handleSave}>Зберегти</button>
            <button className="btn btn--ghost" onClick={() => setShowForm(false)}>Скасувати</button>
          </div>
        </div>
      )}

      <div className="tabs-bar">
        <button className={`tab-pill${tab==='debtor'?  ' tab-pill--active':''}`} onClick={() => setTab('debtor')}>Дебітори</button>
        <button className={`tab-pill${tab==='creditor'?' tab-pill--active':''}`} onClick={() => setTab('creditor')}>Кредитори</button>
      </div>

      <DynamicTable
        config={TABLE_CONFIGS.DEBTS}
        data={rows.map(r => ({ ...r, status: r.status || 'pending' }))}
        renderCell={renderCell}
        onDelete={(row) => !row.isAuto && window.confirm('Перемістити запис у кошик?') && deleteDebt(row.id)}
        emptyText="Записів немає"
      />
    </div>
  );
};

export default DebtorsView;
