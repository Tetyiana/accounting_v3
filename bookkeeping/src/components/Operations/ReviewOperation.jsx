import React, { useState } from 'react';

/**
 * Перевірка та редагування рядків, розпізнаних з файлу, перед збереженням у журнал.
 * props: rows, onSave(rows), onCancel(), isBankImport
 */
const ReviewOperation = ({ rows, onSave, onCancel, isBankImport = false }) => {
  const [editable, setEditable] = useState(rows);

  const handleChange = (idx, field, value) => {
    setEditable(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const removeRow = (idx) => setEditable(prev => prev.filter((_, i) => i !== idx));

  const valid = editable.length > 0 && editable.every(r => r.date && r.counterparty && (+r.amount > 0));

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
              <tr key={idx}>
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
      {!valid && <div className="form-error">Перевірте, чи в кожному рядку заповнені дата, контрагент і сума більша за нуль</div>}
      <div className="form-actions">
        <button className="btn btn--primary" disabled={!valid} onClick={() => onSave(editable)}>
          Підтвердити та додати в журнал ({editable.length})
        </button>
        <button className="btn btn--ghost" onClick={onCancel}>Назад</button>
      </div>
    </div>
  );
};

export default ReviewOperation;
