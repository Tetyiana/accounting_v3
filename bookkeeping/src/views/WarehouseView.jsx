import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { calculateWarehouseStock } from '../utils/warehouseLogic';
import { TABLE_CONFIGS } from '../constants/tableConfigs';
import DynamicTable from '../components/common/DynamicTable';

const EMPTY = { date: new Date().toISOString().slice(0,10), itemName: '', batch: '', sku: '', qty: '', price: '', description: '' };
const fmt = n => (+n || 0).toLocaleString('uk-UA');

const WarehouseView = () => {
  const { movements, addMovement, deleteMovement } = useData();
  const [showForm, setShowForm]   = useState(false);
  const [opType, setOpType]       = useState('in');
  const [form, setForm]           = useState(EMPTY);
  const [filter, setFilter]       = useState({ itemName: '', dateStart: '', dateEnd: '' });
  const [err, setErr]             = useState('');

  const set  = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  const setF = e => setFilter(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const openForm = (type) => { setOpType(type); setForm(EMPTY); setErr(''); setShowForm(true); };

  const handleSave = () => {
    if (!form.itemName || !form.qty || !form.date) { setErr('Заповніть обов\'язкові поля'); return; }
    if (isNaN(+form.qty) || +form.qty <= 0) { setErr('Некоректна кількість'); return; }
    addMovement({ ...form, operation: opType });
    setShowForm(false);
    setErr('');
  };

  const filtered = useMemo(() => {
    return movements.filter(m =>
      (!filter.itemName  || m.itemName.toLowerCase().includes(filter.itemName.toLowerCase())) &&
      (!filter.dateStart || m.date >= filter.dateStart) &&
      (!filter.dateEnd   || m.date <= filter.dateEnd)
    );
  }, [movements, filter]);

  const rows = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => a.date.localeCompare(b.date));
    return calculateWarehouseStock(sorted);
  }, [filtered]);

  const renderCell = (row, col) => {
    if (col.key === 'operation') {
      return (
        <span className={`badge badge--${row.operation === 'in' ? 'success' : 'danger'}`}>
          {row.operation === 'in' ? 'Прихід' : 'Видаток'}
        </span>
      );
    }
    if (col.key === 'qty')     return fmt(row.qty);
    if (col.key === 'price')   return row.price ? fmt(row.price) + ' грн' : '—';
    if (col.key === 'balance') return <span style={{fontWeight:600}}>{fmt(row.balance)}</span>;
    if (col.key === 'batch' || col.key === 'sku') return row[col.key] || '—';
    return row[col.key] ?? '—';
  };

  return (
    <div className="view-warehouse">
      <div className="view-toolbar">
        <h2 className="view-title">Складський облік</h2>
        <div className="toolbar-actions">
          <button className="btn btn--success" onClick={() => openForm('in')}>+ Прихід товару</button>
          <button className="btn btn--danger"  onClick={() => openForm('out')}>− Видаток товару</button>
        </div>
      </div>

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
              <label>Найменування <span className="req">*</span></label>
              <input name="itemName" value={form.itemName} onChange={set} placeholder="Назва товару" />
            </div>
            <div className="field">
              <label>Кількість <span className="req">*</span></label>
              <input type="number" name="qty" value={form.qty} onChange={set} placeholder="0" min="0.001" step="any" />
            </div>
            <div className="field">
              <label>Ціна, грн</label>
              <input type="number" name="price" value={form.price} onChange={set} placeholder="0.00" min="0" step="0.01" />
            </div>
          </div>
          <div className="form-row-3">
            <div className="field">
              <label>Партія (batch)</label>
              <input name="batch" value={form.batch} onChange={set} placeholder="напр. L-240618" />
            </div>
            <div className="field">
              <label>Артикул (SKU)</label>
              <input name="sku" value={form.sku} onChange={set} placeholder="напр. SFS-EYE-15" />
            </div>
            <div className="field">
              <label>Примітка</label>
              <input name="description" value={form.description} onChange={set} placeholder="Опис" />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn--primary" onClick={handleSave}>Зберегти</button>
            <button className="btn btn--ghost"   onClick={() => setShowForm(false)}>Скасувати</button>
          </div>
        </div>
      )}

      <div className="filters-bar">
        <input name="itemName"  value={filter.itemName}  onChange={setF} placeholder="Пошук по найменуванню" />
        <input type="date" name="dateStart" value={filter.dateStart} onChange={setF} title="Дата з" />
        <input type="date" name="dateEnd"   value={filter.dateEnd}   onChange={setF} title="Дата по" />
      </div>

      <DynamicTable
        config={TABLE_CONFIGS.WAREHOUSE}
        data={rows}
        renderCell={renderCell}
        rowClassName={row => row.operation === 'in' ? 'row-income' : 'row-expense'}
        onDelete={(row) => window.confirm('Перемістити запис у кошик?') && deleteMovement(row.id)}
        emptyText="Рухів немає"
      />
    </div>
  );
};

export default WarehouseView;
