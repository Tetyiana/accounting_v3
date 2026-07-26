import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { ACT_TYPES, INVOICE_STATUSES } from '../constants/documentTypes';
import { fmtMoney } from '../utils/documentLogic';

// Книга обліку господарських операцій (КОГО): усі документи всіх типів в одному журналі
// з фільтрами (тип, дата, контрагент, сума) і підсумками.

const DOC_TYPES = [
  { id: 'invoice_out', label: 'Рахунок (вих.)' },
  { id: 'invoice_in',  label: 'Рахунок (вх.)' },
  { id: 'act',         label: 'Акт' },
  { id: 'delivery_note', label: 'Видаткова накладна' },
  { id: 'payment',     label: 'Оплата' },
  { id: 'vat_invoice', label: 'Податкова накладна' },
];

const RegistryView = () => {
  const { invoices, acts, payments, vatInvoices } = useData();
  const [f, setF] = useState({ type: '', dateStart: '', dateEnd: '', q: '', counterparty: '', status: '', amountMin: '', amountMax: '' });
  const set = e => setF(p => ({ ...p, [e.target.name]: e.target.value }));

  const allDocs = useMemo(() => {
    const rows = [];
    invoices.forEach(i => rows.push({
      id: i.id, kind: i.direction === 'outgoing' ? 'invoice_out' : 'invoice_in',
      kindLabel: i.direction === 'outgoing' ? 'Рахунок (вих.)' : 'Рахунок (вх.)',
      number: i.number, date: i.date, counterparty: i.clientName || '',
      amount: +i.total || 0,
      status: INVOICE_STATUSES[i.status]?.label || i.status || '',
    }));
    acts.forEach(a => rows.push({
      id: a.id, kind: a.type === 'delivery_note' ? 'delivery_note' : 'act',
      kindLabel: ACT_TYPES.find(t => t.id === a.type)?.label || 'Акт',
      number: a.number, date: a.date, counterparty: a.clientName || '',
      amount: +a.total || 0, status: a.status === 'signed' ? 'Підписано' : 'Чернетка',
    }));
    payments.forEach(p => rows.push({
      id: p.id, kind: 'payment', kindLabel: 'Оплата',
      number: '', date: p.date, counterparty: p.counterparty || '',
      amount: +p.amount || 0,
      status: p.direction === 'outgoing' ? 'Отримано' : 'Сплачено',
    }));
    vatInvoices.forEach(v => rows.push({
      id: v.id, kind: 'vat_invoice', kindLabel: 'ПН',
      number: v.number, date: v.date, counterparty: v.counterparty || '',
      amount: +v.amount || 0, status: v.direction === 'outgoing' ? 'Видана' : 'Отримана',
    }));
    return rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [invoices, acts, payments, vatInvoices]);

  const counterparties = useMemo(() =>
    [...new Set(allDocs.map(d => d.counterparty).filter(Boolean))].sort(), [allDocs]);
  const statuses = useMemo(() =>
    [...new Set(allDocs.map(d => d.status).filter(Boolean))].sort(), [allDocs]);

  const docs = useMemo(() => allDocs
    .filter(r => !f.type || r.kind === f.type)
    .filter(r => !f.dateStart || (r.date || '') >= f.dateStart)
    .filter(r => !f.dateEnd   || (r.date || '') <= f.dateEnd)
    .filter(r => !f.q || (r.counterparty + ' ' + r.number).toLowerCase().includes(f.q.toLowerCase()))
    .filter(r => !f.counterparty || r.counterparty === f.counterparty)
    .filter(r => !f.status || r.status === f.status)
    .filter(r => !f.amountMin || r.amount >= +f.amountMin)
    .filter(r => !f.amountMax || r.amount <= +f.amountMax),
  [allDocs, f]);

  const total = useMemo(() => docs.reduce((s, d) => s + d.amount, 0), [docs]);

  return (
    <div className="view-registry">
      <div className="view-toolbar">
        <h2 className="view-title">Книга обліку господарських операцій</h2>
        <div className="cell-muted">Документів: {docs.length} · Разом: <b>{fmtMoney(total)} грн</b></div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Дата</th><th>Тип</th><th>№</th><th>Контрагент</th>
              <th style={{ textAlign: 'right' }}>Сума, грн</th><th>Статус</th>
            </tr>
            <tr className="filter-row">
              <th>
                <input type="date" name="dateStart" value={f.dateStart} onChange={set} title="з" />
                <input type="date" name="dateEnd" value={f.dateEnd} onChange={set} title="по" />
              </th>
              <th>
                <select name="type" value={f.type} onChange={set} >
                  <option value="">Всі</option>
                  {DOC_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </th>
              <th>
                <input name="q" value={f.q} onChange={set} placeholder="№..." />
              </th>
              <th>
                <select name="counterparty" value={f.counterparty} onChange={set} >
                  <option value="">Всі</option>
                  {counterparties.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </th>
              <th>
                <input type="number" name="amountMin" value={f.amountMin} onChange={set} placeholder="від" />
                <input type="number" name="amountMax" value={f.amountMax} onChange={set} placeholder="до" />
              </th>
              <th>
                <select name="status" value={f.status} onChange={set} >
                  <option value="">Всі</option>
                  {statuses.map(st => <option key={st} value={st}>{st}</option>)}
                </select>
              </th>
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 ? (
              <tr><td colSpan={6} className="table-empty">Документів немає</td></tr>
            ) : docs.map(d => (
              <tr key={d.kind + d.id}>
                <td>{d.date}</td>
                <td>{d.kindLabel}</td>
                <td>{d.number || '—'}</td>
                <td>{d.counterparty || '—'}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(d.amount)}</td>
                <td className="cell-muted">{d.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RegistryView;
