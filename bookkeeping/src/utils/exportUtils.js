// Прості, без зайвих залежностей, функції експорту — для подачі звітів у
// кабінет платника податків чи передачі бухгалтеру.

const downloadBlob = (content, filename, type) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const exportJSON = (data, filename) => {
  downloadBlob(JSON.stringify(data, null, 2), filename, 'application/json');
};

const csvCell = (value) => {
  const s = String(value ?? '');
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const exportCSV = (rows, columns, filename) => {
  // columns: [{ key, label }]
  const header = columns.map(c => csvCell(c.label)).join(';');
  const lines = rows.map(r => columns.map(c => csvCell(r[c.key])).join(';'));
  const csv = '\uFEFF' + [header, ...lines].join('\n'); // BOM — щоб Excel коректно показував кирилицю
  downloadBlob(csv, filename, 'text/csv;charset=utf-8');
};
