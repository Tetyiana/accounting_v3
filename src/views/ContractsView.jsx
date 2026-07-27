import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useFop } from '../context/FopContext';
import { fmtMoney } from '../utils/documentLogic';
import AttachmentsList from '../components/common/AttachmentsList';
import { openPrintWindow } from '../utils/printWindow';

// Договори з контрагентами: CRUD, друк, прикріплення сканів, факсиміле.
// Один договір може закриватися багатьма рахунками (invoices.contract_id).

const EMPTY = {
  id: null, counterpartyId: null, counterpartyName: '',
  number: '', date: new Date().toISOString().slice(0, 10),
  validUntil: '', subject: '',
  totalAmount: 0, status: 'active', notes: '',
};

const STATUSES = [
  ['active',    'Діє'],
  ['completed', 'Виконано'],
  ['paused',    'Призупинено'],
  ['cancelled', 'Скасовано'],
];
const stLabel = Object.fromEntries(STATUSES);
const stBadge = (s) => s === 'active' ? 'badge--success' : s === 'completed' ? 'badge--info' : s === 'paused' ? 'badge--warning' : 'badge--danger';

const buildContractHtml = (c, fop, client) => `<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8">
<title>Договір №${c.number}</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;margin:24mm;line-height:1.5}
h2{font-size:14px;text-align:center;margin:0 0 12px}
h3{font-size:12px;margin:12px 0 6px;background:#e8e8e8;padding:4px 6px;border:1px solid #333}
.nb td{border:none;padding:2px 4px}
table{width:100%;border-collapse:collapse;margin:6px 0}td,th{border:1px solid #333;padding:5px 8px}
@media print{body{margin:12mm}}</style></head><body>
<h2>ДОГОВІР № ${c.number}</h2>
<p class="nb" style="display:flex;justify-content:space-between;margin:0"><span>м. ${fop?.legalAddressCity || '_______'}</span><span>${c.date}</span></p>

<p><b>ФОП ${fop?.fullName || ''}</b>${fop?.rnokpp ? ` (РНОКПП ${fop.rnokpp})` : ''}, надалі — «Виконавець», з однієї сторони,
та <b>${c.counterpartyName || client?.name || ''}</b>${client?.ipn ? ` (ЄДРПОУ/РНОКПП ${client.ipn})` : ''}, надалі — «Замовник», з іншої сторони,
уклали цей Договір про таке:</p>

<h3>1. Предмет договору</h3>
<p>${c.subject || '—'}</p>

<h3>2. Ціна договору і порядок оплати</h3>
<p>2.1. ${c.totalAmount > 0 ? `Загальна сума договору становить <b>${fmtMoney(c.totalAmount)} грн</b>` : 'Сума договору визначається в рахунках/актах, що складаються в межах цього Договору'}.</p>
<p>2.2. Оплата здійснюється у безготівковій формі на поточний рахунок Виконавця протягом 5 (п'яти) банківських днів з дати виставлення рахунку.</p>

<h3>3. Строк дії</h3>
<p>3.1. Договір набирає чинності з ${c.date} і діє до ${c.validUntil || 'повного виконання зобов\'язань'}.</p>

<h3>4. Реквізити сторін</h3>
<table><tr>
<td width="50%" valign="top"><b>Виконавець:</b><br>
ФОП ${fop?.fullName || ''}<br>
РНОКПП: ${fop?.rnokpp || ''}<br>
Адреса: ${fop?.legalAddress || ''}<br>
${fop?.phone ? `Тел.: ${fop.phone}` : ''}
</td>
<td width="50%" valign="top"><b>Замовник:</b><br>
${c.counterpartyName || client?.name || ''}<br>
${client?.ipn ? `ЄДРПОУ/РНОКПП: ${client.ipn}<br>` : ''}
${client?.address ? `Адреса: ${client.address}<br>` : ''}
${client?.phone ? `Тел.: ${client.phone}` : ''}
</td></tr></table>

<div style="margin-top:32px;display:flex;justify-content:space-between">
  <div><b>Виконавець:</b><br>ФОП ${fop?.fullName || ''}<br><div id="fax-slot"></div>___________________________<br><small>(підпис) М.П.</small></div>
  <div><b>Замовник:</b><br>${c.counterpartyName || client?.name || ''}<br><br><br>___________________________<br><small>(підпис) М.П.</small></div>
</div>
</body></html>`;

const ContractsView = () => {
  const { contracts, clients, invoices, addContract, updateContract, deleteContract } = useData();
  const { activeFop } = useFop();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [filter, setFilter] = useState('');

  const set = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const list = useMemo(() =>
    [...contracts]
      .filter(c => !filter || (c.number + c.counterpartyName + c.subject).toLowerCase().includes(filter.toLowerCase()))
      .sort((a, b) => (b.date || '').localeCompare(a.date || '')),
  [contracts, filter]);

  const invoicesByContract = useMemo(() => {
    const map = {};
    invoices.forEach(i => {
      if (i.contractId) { (map[i.contractId] = map[i.contractId] || []).push(i); }
    });
    return map;
  }, [invoices]);

  const startEdit = (c) => {
    setForm({ ...EMPTY, ...c });
    setShowForm(true);
  };

  const startNew = () => {
    setForm({ ...EMPTY, number: `Д-${String(contracts.length + 1).padStart(3, '0')}` });
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.counterpartyName.trim()) { alert('Вкажіть контрагента'); return; }
    if (!form.number.trim()) { alert('Вкажіть номер договору'); return; }
    const payload = {
      ...form,
      totalAmount: +form.totalAmount || 0,
      validUntil: form.validUntil || null,
    };
    if (form.id) {
      const { id, ...patch } = payload;
      updateContract(id, patch);
    } else {
      addContract(payload);
    }
    setShowForm(false); setForm(EMPTY);
  };

  const handleDelete = (c) => {
    if (invoicesByContract[c.id]?.length) {
      if (!window.confirm(`До договору прив'язано ${invoicesByContract[c.id].length} рахунків. Все одно видалити?`)) return;
    } else {
      if (!window.confirm(`Видалити договір №${c.number}?`)) return;
    }
    deleteContract(c.id);
  };

  const handlePrint = (c) => {
    const client = clients.find(cl => cl.id === c.counterpartyId || cl.name === c.counterpartyName);
    openPrintWindow(buildContractHtml(c, activeFop, client), { fop: activeFop });
  };

  return (
    <div className="view-contracts">
      <div className="view-toolbar">
        <h2 className="view-title">Договори</h2>
        <button className="btn btn--primary" onClick={startNew}>+ Новий договір</button>
      </div>

      <div className="filters-bar">
        <input placeholder="Пошук по номеру, контрагенту, предмету" value={filter} onChange={e => setFilter(e.target.value)} style={{ maxWidth: 320 }} />
      </div>

      {showForm && (
        <div className="inline-form">
          <div className="inline-form-header">
            <span>{form.id ? `Редагування договору №${form.number}` : 'Новий договір'}</span>
            <button className="btn-close" onClick={() => setShowForm(false)}>✕</button>
          </div>
          <div className="form-row-4">
            <div className="field">
              <label>Номер <span className="req">*</span></label>
              <input name="number" value={form.number} onChange={set} />
            </div>
            <div className="field">
              <label>Дата укладення</label>
              <input type="date" name="date" value={form.date} onChange={set} />
            </div>
            <div className="field">
              <label>Діє до</label>
              <input type="date" name="validUntil" value={form.validUntil || ''} onChange={set} />
            </div>
            <div className="field">
              <label>Статус</label>
              <select name="status" value={form.status} onChange={set}>
                {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row-2" style={{ marginTop: 8 }}>
            <div className="field">
              <label>Контрагент <span className="req">*</span></label>
              <select name="counterpartyId"
                value={form.counterpartyId || ''}
                onChange={e => {
                  const cid = e.target.value || null;
                  const cl = clients.find(c => c.id === cid);
                  setForm(p => ({ ...p, counterpartyId: cid, counterpartyName: cl ? cl.name : p.counterpartyName }));
                }}>
                <option value="">— оберіть з довідника —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {!form.counterpartyId && (
                <input name="counterpartyName" value={form.counterpartyName} onChange={set}
                  placeholder="Або впишіть назву вручну" style={{ marginTop: 4 }} />
              )}
            </div>
            <div className="field">
              <label>Загальна сума, грн (0 = без ліміту)</label>
              <input type="number" name="totalAmount" value={form.totalAmount} onChange={set} step="0.01" />
            </div>
          </div>
          <div className="field" style={{ marginTop: 8 }}>
            <label>Предмет договору</label>
            <textarea name="subject" value={form.subject} onChange={set} rows={3}
              placeholder="Напр.: поставка косметичної продукції згідно з заявками покупця" />
          </div>
          <div className="field" style={{ marginTop: 8 }}>
            <label>Внутрішні примітки</label>
            <input name="notes" value={form.notes} onChange={set} />
          </div>

          {form.id && activeFop && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: '.85rem', fontWeight: 500, marginBottom: 6 }}>Скани, додатки, специфікації</div>
              <AttachmentsList fopId={activeFop.id} entityType="contract" entityId={form.id} />
            </div>
          )}

          <div className="form-actions" style={{ marginTop: 12 }}>
            <button className="btn btn--primary" onClick={handleSave}>Зберегти</button>
            {form.id && <button className="btn btn--ghost" onClick={() => handlePrint(form)}>🖨 Друк</button>}
            <button className="btn btn--ghost" onClick={() => setShowForm(false)}>Скасувати</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>№</th><th>Дата</th><th>Контрагент</th><th>Предмет</th>
              <th style={{ textAlign: 'right' }}>Сума, грн</th>
              <th style={{ textAlign: 'right' }}>Використано</th>
              <th>Статус</th><th>Діє до</th><th></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={9} className="cell-muted" style={{ padding: 20, textAlign: 'center' }}>
                Договорів немає. Створіть перший.
              </td></tr>
            )}
            {list.map(c => {
              const linkedInvoices = invoicesByContract[c.id] || [];
              const used = linkedInvoices.reduce((s, i) => s + (+i.total || 0), 0);
              return (
                <tr key={c.id}>
                  <td>{c.number}</td>
                  <td>{c.date}</td>
                  <td>{c.counterpartyName}</td>
                  <td className="cell-muted" style={{ fontSize: '.82rem', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.subject}</td>
                  <td style={{ textAlign: 'right' }}>{c.totalAmount > 0 ? fmtMoney(c.totalAmount) : '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    {fmtMoney(used)}
                    {linkedInvoices.length > 0 && (
                      <div className="cell-muted" style={{ fontSize: '.75rem' }}>у {linkedInvoices.length} рах.</div>
                    )}
                  </td>
                  <td><span className={`badge ${stBadge(c.status)}`}>{stLabel[c.status]}</span></td>
                  <td>{c.validUntil || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn--ghost btn--sm" onClick={() => handlePrint(c)} title="Друк">🖨</button>
                    <button className="btn btn--ghost btn--sm" onClick={() => startEdit(c)}>ред.</button>
                    <button className="btn-icon btn-icon--del" onClick={() => handleDelete(c)}>✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ContractsView;
