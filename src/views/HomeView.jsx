import React, { useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { useFop } from '../context/FopContext';
import { TAX_GROUPS } from '../constants/taxOptions';
import { calculateWarehouseStock } from '../utils/warehouseLogic';
import { calcInvoiceStatus, calcInvoicePaid, fmtMoney } from '../utils/documentLogic';
import { toVocative } from '../utils/vocativeUtils';
import { buildDeadlines } from '../utils/deadlines';

const Stat = ({ label, value, accent, color, onClick }) => (
  <div className={`stat-card${accent?' stat-card--accent':''}`}
    onClick={onClick} style={onClick?{cursor:'pointer'}:undefined}>
    <div className="stat-label">{label}</div>
    <div className="stat-value" style={color?{color}:undefined}>{value}</div>
  </div>
);

const HomeView = ({ setActiveTab }) => {
  const { user }                                                        = useAuth();
  const { transactions, movements, vatInvoices, invoices, payments }   = useData();
  const { settings }                                                    = useSettings();
  const { activeFop }                                                   = useFop();

  const balance = useMemo(() => {
    const income  = transactions.filter(t=>t.type==='income').reduce((s,t)=>s+(+t.amount||0),0);
    const expense = transactions.filter(t=>t.type==='expense').reduce((s,t)=>s+(+t.amount||0),0);
    return { income, expense, net: income-expense, count: transactions.length };
  }, [transactions]);

  const unpaid = useMemo(() =>
    invoices.filter(i=>i.direction==='outgoing'&&i.status!=='cancelled')
      .filter(i=>{ const s=calcInvoiceStatus(i,payments); return s!=='paid'&&s!=='cancelled'; })
      .reduce((s,i)=>s+Math.max(0,(+i.total||0)-calcInvoicePaid(i.id,payments)),0),
    [invoices, payments]
  );

  const unpaidCreditor = useMemo(() =>
    invoices.filter(i=>i.direction==='incoming'&&i.status!=='cancelled')
      .reduce((s,i)=>s+Math.max(0,(+i.total||0)-calcInvoicePaid(i.id,payments)),0),
    [invoices, payments]
  );

  const warehouseStats = useMemo(() => {
    if (!settings.useWarehouse) return null;
    const sorted = [...movements].sort((a,b)=>a.date.localeCompare(b.date));
    const withBalance = calculateWarehouseStock(sorted);
    const lastByItem = {};
    withBalance.forEach(m => { lastByItem[m.itemName] = m.balance; });
    return { positions: Object.keys(lastByItem).length };
  }, [movements, settings.useWarehouse]);

  const vatStats = useMemo(() => {
    if (!settings.isVatPayer) return null;
    const out = vatInvoices.filter(v=>v.direction==='outgoing').reduce((s,v)=>s+(+v.amount||0)*0.2,0);
    const inc = vatInvoices.filter(v=>v.direction==='incoming').reduce((s,v)=>s+(+v.amount||0)*0.2,0);
    return { toPay: Math.max(0, out-inc) };
  }, [vatInvoices, settings.isVatPayer]);

  const group = TAX_GROUPS.find(g => g.id === settings.taxGroup);

  const deadlines = useMemo(() => buildDeadlines({
    taxGroup: settings.taxGroup,
    isVatPayer: settings.isVatPayer,
    payrollRecords, employees,
  }).slice(0, 8), [settings.taxGroup, settings.isVatPayer, payrollRecords, employees]);
  const today = new Date();
  const greeting = today.getHours() < 12 ? 'Доброго ранку' :
                   today.getHours() < 17 ? 'Добрий день' : 'Добрий вечір';

  // Кличний відмінок: ПІБ "Прізвище Ім'я По-батькові" → беремо ім'я (2-е слово)
  const nameParts    = (user?.name || '').trim().split(/\s+/);
  const firstNameRaw = nameParts.length >= 2 ? nameParts[1] : nameParts[0];
  const vocativeName = toVocative(firstNameRaw) || 'ФОП';

  return (
    <div className="view-home">
      <div className="home-greeting">
        <h2>{greeting}, {vocativeName}!</h2>
        <p>
          {activeFop?.fullName} · {group?.label}
          {settings.isVatPayer ? ' · ПДВ' : ''}
          {settings.useWarehouse ? ' · Склад' : ''}
          {settings.useRRO ? ' · РРО' : ''}
        </p>
      </div>

      {deadlines.length > 0 && (
        <div className="settings-section" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Найближчі терміни</h3>
          {deadlines.map((d, i) => {
            const overdue = d.daysTo < 0;
            const urgent  = d.daysTo >= 0 && d.daysTo <= 3;
            return (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline',
                padding: '5px 0', borderBottom: '1px solid var(--border-light)', fontSize: '.9rem' }}>
                <span style={{ minWidth: 88, fontWeight: 600,
                  color: overdue ? 'var(--error)' : urgent ? 'var(--warning)' : 'var(--text)' }}>
                  {d.date}
                </span>
                <span style={{ flex: 1 }}>{d.title}</span>
                <span className={`badge badge--${overdue ? 'danger' : urgent ? 'warning' : 'muted'}`}>
                  {overdue ? `прострочено ${-d.daysTo} дн.` : d.daysTo === 0 ? 'сьогодні' : `через ${d.daysTo} дн.`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="stats-grid">
        <Stat label="Доходи"  value={`${fmtMoney(balance.income)} грн`}  color="var(--success)" />
        <Stat label="Витрати" value={`${fmtMoney(balance.expense)} грн`} color="var(--error)" />
        <Stat label="Баланс"  value={`${fmtMoney(balance.net)} грн`}     accent />
        <Stat label="Операцій" value={balance.count} />
        {unpaid > 0 && (
          <Stat label="Дебіторка (не оплачено)" value={`${fmtMoney(unpaid)} грн`}
            color="var(--warning)" onClick={() => setActiveTab('debtors')} />
        )}
        {unpaidCreditor > 0 && (
          <Stat label="Кредиторка (ми винні)" value={`${fmtMoney(unpaidCreditor)} грн`}
            color="var(--error)" onClick={() => setActiveTab('debtors')} />
        )}
        {warehouseStats && (
          <Stat label="Залишки на складі" value={`${warehouseStats.positions} позицій`}
            onClick={() => setActiveTab('warehouse')} />
        )}
        {vatStats && (
          <Stat label="ПДВ до сплати" value={`${fmtMoney(vatStats.toPay)} грн`}
            onClick={() => setActiveTab('vat')} />
        )}
      </div>

      <div className="home-shortcuts">
        <h3>Швидкий доступ</h3>
        <div className="shortcuts-grid">
          {[
            { tab: 'sales',       label: 'Продажі / Закупівлі', desc: 'Рахунки, акти, оплати' },
            { tab: 'journal',     label: 'Банк / Каса',          desc: 'Надходження та видатки' },
            { tab: 'kdv',         label: 'Книга доходів',        desc: `КДВ · ${group?.label || ''}` },
            { tab: 'debtors',     label: 'Дебітори / Кредитори', desc: 'Хто винен, кому ми винні' },
            { tab: 'directories', label: 'Довідники',            desc: 'Контрагенти, номенклатура' },
            ...(settings.useWarehouse ? [{ tab:'warehouse', label:'Склад', desc:'Рух і залишки' }] : []),
          ].map(s => (
            <button key={s.tab} className="shortcut-card" onClick={() => setActiveTab(s.tab)}>
              <div className="shortcut-title">{s.label}</div>
              <div className="shortcut-desc">{s.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HomeView;
