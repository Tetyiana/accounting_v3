import React from 'react';

/**
 * Універсальна таблиця, що рендериться з config.columns (constants/tableConfigs.js).
 * Щоб додати колонку — додаєш рядок у конфіг, цей компонент не міняється.
 *
 * props:
 *  - config:    { columns: [{ key, label, align }] }
 *  - data:      масив рядків
 *  - renderCell(row, col): необов'язкове перевизначення відображення клітинки
 *  - rowClassName(row): необов'язковий клас рядка (напр. прихід/видаток)
 *  - onDelete(row): якщо передано — додає колонку з кнопкою видалення
 *  - emptyText: текст для порожньої таблиці
 */
const DynamicTable = ({ config, data, renderCell, rowClassName, onDelete, emptyText = 'Записів немає' }) => {
  const columns = config?.columns || [];

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} style={{ textAlign: col.align || 'left' }}>{col.label}</th>
            ))}
            {onDelete && <th style={{ width: 32 }}></th>}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr><td colSpan={columns.length + (onDelete ? 1 : 0)} className="table-empty">{emptyText}</td></tr>
          ) : (
            data.map((row, idx) => (
              <tr key={row.id ?? idx} className={rowClassName ? rowClassName(row) : undefined}>
                {columns.map(col => (
                  <td key={col.key} style={{ textAlign: col.align || 'left' }}>
                    {renderCell ? renderCell(row, col) : (row[col.key] ?? '—')}
                  </td>
                ))}
                {onDelete && (
                  <td>
                    <button
                      className="btn-icon btn-icon--del"
                      title="Видалити (потрапить у кошик)"
                      onClick={() => onDelete(row)}
                    >✕</button>
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default DynamicTable;
