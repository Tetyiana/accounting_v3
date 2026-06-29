export const calculateWarehouseStock = (movements) => {
  const stocks = {};
  return movements.map(m => {
    const qty = parseFloat(m.qty) || 0;
    const key = m.itemName;
    stocks[key] = (stocks[key] || 0) + (m.operation === 'in' ? qty : -qty);
    return { ...m, balance: parseFloat(stocks[key].toFixed(4)) };
  });
};
