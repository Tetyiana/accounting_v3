import React, { useState } from 'react';

/**
 * Перевірка та редагування рядків, розпізнаних з файлу, перед збереженням у журнал.
 * props: rows, onSave(rows), onCancel(), isBankImport
 */
const ReviewOperation = ({ rows, onSave, onCancel, isBankImport = false }) => {
  const [editable, setEditable] = useState(rows);
  const [selected, setSelected] = useState(() => new Set(rows.map((_, i) => i)));

  const handleChange = (idx, field, value) => {
    setEditable(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const removeRow = (idx) => {
    setEditable(prev => prev.filter((_, i) => i !== idx));
    setSelected(prev => {
      const next = new Set();
      prev.forEach(i => { if (i < idx) next.add(i); else if (i > idx) next.add(i - 1); });
      return next;
    });
  };

  const toggleOne = (idx) => setSelected(prev => {
    const next = new Set(prev);
    next.has(idx) ? next.delete(idx) : next.add(idx);
    return next;
  });

  const allSelected = editable.length > 0 && selected.size === editable.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(editable.map((_, i) => i)));

  const checkedRows = editable.filter((_, i) => selected.has(i));
  const valid = checkedRows.length > 0 && checkedRows.every(r => r.date && r.counterparty && (+r.amount > 0));

  // Банківська термінологія: Надходження/Списання
  const typeOptions = isBankImport
    ? [{ value: 'incoming', label: 'Надходження' }, { value: 'outgoing', label: 'Списання' }]
    : [{ value: 'income',   label: 'Прихід'      }, { value: 'expense',  label: 'Видаток'  }];

  return (
    <div className="review-panel">
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{width:32}}><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
              <th>Дата</th>
              <th>Тип</th>
              <th>Контрагент</th>
              <th style={{textAlign:'right'}}>Сума, грн</th>
              <th>Примітка</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {editable.map((row, idx) => (
              <tr key={idx} className={selected.has(idx) ? '' : 'row-disabled'}>
                <td><input type="checkbox" checked={selected.has(idx)} onChange={() => toggleOne(idx)} /></td>
                <td><input type="date" className="table-input" value={row.date || ''} onChange={e => handleChange(idx, 'date', e.target.value)} /></td>
                <td>
                  <select className="table-input" value={row.type || (isBankImport ? 'incoming' : 'income')} onChange={e => handleChange(idx, 'type', e.target.value)}>
                    {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </td>
                <td><input className="table-input" value={row.counterparty || ''} onChange={e => handleChange(idx, 'counterparty', e.target.value)} placeholder="Контрагент" /></td>
                <td><input type="number" className="table-input table-input--right" value={row.amount || ''} onChange={e => handleChange(idx, 'amount', e.target.value)} /></td>
                <td><input className="table-input" value={row.description || ''} onChange={e => handleChange(idx, 'description', e.target.value)} placeholder="Опис" /></td>
                <td><button className="btn-icon btn-icon--del" onClick={() => removeRow(idx)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!valid && <div className="form-error">Оберіть хоча б одну операцію та перевірте, чи в позначених рядках заповнені дата, контрагент і сума більша за нуль</div>}
      <div className="form-actions">
        <button className="btn btn--primary" disabled={!valid} onClick={() => onSave(checkedRows)}>
          Підтвердити та додати в журнал ({checkedRows.length})
        </button>
        <button className="btn btn--ghost" onClick={onCancel}>Назад</button>
      </div>
    </div>
  );
};

export default ReviewOperation;
