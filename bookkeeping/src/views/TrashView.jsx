import React from 'react';
import { useData } from '../context/DataContext';

const KIND_LABEL = {
  transaction: 'Операція (журнал)',
  movement:    'Рух (склад)',
  debt:        'Дебітор/кредитор',
  vatInvoice:  'Податкова накладна',
};

const describe = (item) => {
  const d = item.data || {};
  if (item.kind === 'transaction') return `${d.date} · ${d.counterparty} · ${d.amount} грн`;
  if (item.kind === 'movement')    return `${d.date} · ${d.itemName} · ${d.qty}`;
  if (item.kind === 'debt')        return `${d.date} · ${d.counterparty} · ${d.amount} грн`;
  if (item.kind === 'vatInvoice')  return `${d.date} · №${d.number} · ${d.counterparty}`;
  return '—';
};

const TrashView = () => {
  const { trash, restoreFromTrash, purgeFromTrash, purgeAllTrash } = useData();
  const sorted = [...trash].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));

  return (
    <div className="view-trash">
      <div className="view-toolbar">
        <h2 className="view-title">Кошик</h2>
        {trash.length > 0 && (
          <div className="toolbar-actions">
            <button
              className="btn btn--danger-outline"
              onClick={() => window.confirm(`Остаточно видалити всі ${trash.length} записів? Цю дію не можна скасувати.`) && purgeAllTrash()}
            >
              Очистити кошик остаточно
            </button>
          </div>
        )}
      </div>

      <p className="cell-muted" style={{marginBottom: 16}}>
        Видалені записи потрапляють сюди, а не зникають одразу. Можна повернути назад або стерти остаточно.
      </p>

      {sorted.length === 0 ? (
        <div className="table-empty" style={{padding: '32px 0'}}>Кошик порожній</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Тип</th>
                <th>Запис</th>
                <th>Видалено</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(item => (
                <tr key={item.id}>
                  <td>{KIND_LABEL[item.kind] || item.kind}</td>
                  <td>{describe(item)}</td>
                  <td className="cell-muted">{new Date(item.deletedAt).toLocaleString('uk-UA')}</td>
                  <td style={{display:'flex', gap:8}}>
                    <button className="btn btn--ghost btn--sm" onClick={() => restoreFromTrash(item.id)}>Повернути</button>
                    <button
                      className="btn-icon btn-icon--del"
                      title="Видалити остаточно"
                      onClick={() => window.confirm('Видалити запис остаточно? Це не можна скасувати.') && purgeFromTrash(item.id)}
                    >✕</button>
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

export default TrashView;
