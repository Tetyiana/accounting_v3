export const calculateRunningBalance = (transactions) => {
  let balance = 0;
  return transactions.map(t => {
    const amount = parseFloat(t.amount) || 0;
    balance += t.type === 'income' ? amount : -amount;
    return { ...t, balance: parseFloat(balance.toFixed(2)) };
  });
};
