import React, { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useSettings } from '../context/SettingsContext';
import { useFop } from '../context/FopContext';
import { VAT_RATES, UNITS } from '../constants/documentTypes';
import AttachmentsList from '../components/common/AttachmentsList';

const EMPTY_CLIENT = {
  id: null, name: '', ipn: '', phone: '', email: '',
  address: '', isVatPayer: false, vatCertificate: '', notes: '',
};
const EMPTY_PRODUCT = {
  id: null, name: '', unit: 'шт', price: '', vatRate: 'no_vat', notes: '',
};

const ClientForm = ({ initial, onSave, onCancel }) => {
  const { activeFop } = useFop();
  const [form, setForm] = useState(initial || { ...EMPTY_CLIENT });
  const [err, setErr] = useState('');
  const set = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));
  const setCheck = e => setForm(p => ({ ...p, [e.target.name]: e.target.checked }));

  return (
    <div className="inline-form">
      <div className="inline-form-header">
        <span>{form.id ? 'Редагування контрагента' : 'Новий контрагент'}</span>
        <button className="btn-close" onClick={onCancel}>✕</button>
      </div>
      {err && <div className="form-error">{err}</div>}
      <div className="form-row-3">
        <div className="field">
          <label>Назва / ПІБ <span className="req">*</span></label>
          <input name="name" value={form.name} onChange={set} placeholder="ТОВ Приклад або Іваненко І.І." />
        </div>
        <div className="field">
          <label>ЄДРПОУ (юр. особа, 8 цифр) / ІПН (фіз. особа, 10 цифр)</label>
          <input name="ipn" value={form.ipn} onChange={set} placeholder="12345678 або 1234567890" maxLength={12} />
        </div>
        <div className="field">
          <label>Телефон</label>
          <input name="phone" value={form.phone} onChange={set} placeholder="+380..." />
        </div>
      </div>
      <div className="form-row-3">
        <div className="field">
          <label>Email</label>
          <input type="email" name="email" value={form.email} onChange={set} />
        </div>
        <div className="field" style={{ gridColumn: 'span 2' }}>
          <label>Адреса</label>
          <input name="address" value={form.address} onChange={set} placeholder="Місто, вулиця, будинок" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginTop: 4 }}>
        <label className="check-label">
          <input type="checkbox" name="isVatPayer" checked={!!form.isVatPayer} onChange={setCheck} />
          Платник ПДВ (ІПН = РНОКПП/ЄДРПОУ, свідоцтво з 2014 р. скасовано)
        </label>
      </div>
      {form.id && activeFop && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '.85rem', fontWeight: 500, marginBottom: 6 }}>Прикріплені файли (договори, реквізити, скани)</div>
          <AttachmentsList fopId={activeFop.id} entityType="counterparty" entityId={form.id} />
        </div>
      )}
      <div className="form-actions" style={{ marginTop: 12 }}>
        <button className="btn btn--primary" onClick={() => {
          if (!form.name.trim()) { setErr('Назва обов\'язкова'); return; }
          onSave(form);
        }}>Зберегти</button>
        <button className="btn btn--ghost" onClick={onCancel}>Скасувати</button>
      </div>
    </div>
  );
};

const ProductForm = ({ initial, onSave, onCancel }) => {
  const [form, setForm] = useState(initial || { ...EMPTY_PRODUCT });
  const [err, setErr] = useState('');
  const set = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  return (
    <div className="inline-form">
      <div className="inline-form-header">
        <span>{form.id ? 'Редагування позиції' : 'Нова позиція номенклатури'}</span>
        <button className="btn-close" onClick={onCancel}>✕</button>
      </div>
      {err && <div className="form-error">{err}</div>}
      <div className="form-row-4">
        <div className="field" style={{ gridColumn: 'span 2' }}>
          <label>Назва товару / послуги <span className="req">*</span></label>
          <input name="name" value={form.name} onChange={set} placeholder="Консультаційні послуги" />
        </div>
        <div className="field">
          <label>Одиниця</label>
          <input name="unit" list="units-list-dir" value={form.unit} onChange={set} placeholder="шт, флакон, послуга…" />
          <datalist id="units-list-dir">
            {UNITS.map(u => <option key={u} value={u} />)}
          </datalist>
        </div>
        <div className="field">
          <label>Ціна, грн</label>
          <input type="number" name="price" value={form.price} onChange={set} min="0" step="0.01" />
        </div>
      </div>
      <div className="form-row-2">
        <div className="field">
          <label>Ставка ПДВ</label>
          <select name="vatRate" value={form.vatRate} onChange={set}>
            {VAT_RATES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Примітка</label>
          <input name="notes" value={form.notes} onChange={set} />
        </div>
      </div>
      <div className="form-actions" style={{ marginTop: 12 }}>
        <button className="btn btn--primary" onClick={() => {
          if (!form.name.trim()) { setErr('Назва обов\'язкова'); return; }
          onSave(form);
        }}>Зберегти</button>
        <button className="btn btn--ghost" onClick={onCancel}>Скасувати</button>
      </div>
    </div>
  );
};

const DirectoriesView = () => {
  const { clients, addClient, updateClient, deleteClient,
          products, addProduct, updateProduct, deleteProduct } = useData();
  const [tab, setTab] = useState('clients');
  const [editClient, setEditClient]   = useState(null); // null | 'new' | obj
  const [editProduct, setEditProduct] = useState(null);
  const [search, setSearch] = useState('');

  const filteredClients = useMemo(() =>
    clients.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.ipn?.includes(search) || c.phone?.includes(search)),
    [clients, search]
  );
  const filteredProducts = useMemo(() =>
    products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase())),
    [products, search]
  );

  const handleSaveClient = (data) => {
    if (data.id) updateClient(data.id, data);
    else addClient(data);
    setEditClient(null);
  };
  const handleSaveProduct = (data) => {
    if (data.id) updateProduct(data.id, data);
    else addProduct(data);
    setEditProduct(null);
  };

  return (
    <div className="view-directories">
      <div className="view-toolbar">
        <h2 className="view-title">Довідники</h2>
        <div className="toolbar-actions">
          {tab === 'clients'  && <button className="btn btn--primary" onClick={() => setEditClient('new')}>+ Контрагент</button>}
          {tab === 'products' && <button className="btn btn--primary" onClick={() => setEditProduct('new')}>+ Позиція</button>}
        </div>
      </div>

      <div className="tabs-bar" style={{ marginBottom: 16 }}>
        <button className={`tab-pill${tab==='clients'?' tab-pill--active':''}`} onClick={() => { setTab('clients'); setSearch(''); setEditClient(null); }}>
          Контрагенти ({clients.length})
        </button>
        <button className={`tab-pill${tab==='products'?' tab-pill--active':''}`} onClick={() => { setTab('products'); setSearch(''); setEditProduct(null); }}>
          Номенклатура ({products.length})
        </button>
      </div>

      <div className="filters-bar" style={{ marginBottom: 12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder={tab === 'clients' ? 'Пошук за назвою, ІПН, телефоном' : 'Пошук за назвою'}
          style={{ maxWidth: 340 }} />
      </div>

      {/* ─── Контрагенти ─────────────────────────────────────────── */}
      {tab === 'clients' && (
        <>
          {(editClient === 'new') && (
            <ClientForm onSave={handleSaveClient} onCancel={() => setEditClient(null)} />
          )}
          {editClient && editClient !== 'new' && (
            <ClientForm initial={editClient} onSave={handleSaveClient} onCancel={() => setEditClient(null)} />
          )}
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Назва / ПІБ</th>
                  <th>ІПН / ЄДРПОУ</th>
                  <th>Телефон</th>
                  <th>Email</th>
                  <th>ПДВ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.length === 0 ? (
                  <tr><td colSpan={6} className="table-empty">Контрагентів немає</td></tr>
                ) : filteredClients.map(c => (
                  <tr key={c.id}>
                    <td><b>{c.name}</b>{c.address && <><br/><span className="cell-muted" style={{fontSize:'.78rem'}}>{c.address}</span></>}</td>
                    <td>{c.ipn || '—'}</td>
                    <td>{c.phone || '—'}</td>
                    <td>{c.email || '—'}</td>
                    <td>{c.isVatPayer ? <span className="badge badge--warning">ПДВ</span> : '—'}</td>
                    <td>
                      <div style={{ display:'flex', gap:4 }}>
                        <button className="btn btn--ghost btn--sm" onClick={() => setEditClient(c)}>✎</button>
                        <button className="btn-icon btn-icon--del" onClick={() => window.confirm('Видалити?') && deleteClient(c.id)}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ─── Номенклатура ─────────────────────────────────────────── */}
      {tab === 'products' && (
        <>
          {(editProduct === 'new') && (
            <ProductForm onSave={handleSaveProduct} onCancel={() => setEditProduct(null)} />
          )}
          {editProduct && editProduct !== 'new' && (
            <ProductForm initial={editProduct} onSave={handleSaveProduct} onCancel={() => setEditProduct(null)} />
          )}
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Назва</th>
                  <th>Одиниця</th>
                  <th style={{ textAlign:'right' }}>Ціна, грн</th>
                  <th>ПДВ</th>
                  <th>Примітка</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 ? (
                  <tr><td colSpan={6} className="table-empty">Позицій немає</td></tr>
                ) : filteredProducts.map(p => (
                  <tr key={p.id}>
                    <td><b>{p.name}</b></td>
                    <td>{p.unit}</td>
                    <td style={{ textAlign:'right' }}>{p.price ? (+p.price).toLocaleString('uk-UA', { minimumFractionDigits: 2 }) : '—'}</td>
                    <td>{VAT_RATES.find(v=>v.id===p.vatRate)?.label || '—'}</td>
                    <td className="cell-muted">{p.notes || '—'}</td>
                    <td>
                      <div style={{ display:'flex', gap:4 }}>
                        <button className="btn btn--ghost btn--sm" onClick={() => setEditProduct(p)}>✎</button>
                        <button className="btn-icon btn-icon--del" onClick={() => window.confirm('Видалити?') && deleteProduct(p.id)}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default DirectoriesView;
