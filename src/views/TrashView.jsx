import React from 'react';
import { useData } from '../context/DataContext';

const KIND_LABEL = {
  transaction:   'Операція (журнал)',
  movement:      'Рух (склад)',
  debt:          'Дебітор/кредитор',
  vatInvoice:    'Податкова накладна',
  invoice:       'Рахунок',
  act:           'Акт',
  payment:       'Оплата',
  employee:      'Працівник',
  payrollRecord: 'Нарахування зарплати',
  client:        'Контрагент',
  product:       'Номенклатура',
  contract:      'Договір',
};

const describe = (item) => {
  const d = item.data || {};
  const parts = {
    transaction:   [d.date, d.counterparty, d.amount && `${d.amount} грн`],
    movement:      [d.date, d.itemName, d.qty],
    debt:          [d.date, d.counterparty, d.amount && `${d.amount} грн`],
    vatInvoice:    [d.date, d.number && `№${d.number}`, d.counterparty],
    invoice:       [d.date, d.number && `№${d.number}`, d.clientName, d.total && `${d.total} грн`],
    act:           [d.date, d.number && `№${d.number}`, d.clientName],
    payment:       [d.date, d.amount && `${d.amount} грн`, d.counterparty],
    employee:      [d.fullName, d.position],
    payrollRecord: [d.period, d.netPay && `${d.netPay} грн`],
    client:        [d.name, d.ipn],
    product:       [d.name, d.unit],
    contract:      [d.date, d.number && `№${d.number}`, d.clientName],
  }[item.kind];

  const text = (parts || []).filter(Boolean).join(' · ');
  return text || '—';
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
