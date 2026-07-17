import React, { useState, useEffect } from 'react';
import { useFop } from '../context/FopContext';
import { useData } from '../context/DataContext';
import { fmtMoney } from '../utils/documentLogic';
import {
  cbSignIn, cbSignedIn, cbSignOut, cbCurrentShift,
  cbOpenShift, cbCloseShift, cbXReport, cbSellReceipt, receiptUrl,
} from '../utils/checkboxApi';

// ПРРО (Checkbox): зміни, фіскалізація чеків, X/Z-звіти.
// Credentials беруться з профілю ФОПа (вкладка РРО/ПРРО).

const round2 = n => Math.round((+n || 0) * 100) / 100;
const EMPTY_ITEM = () => ({ id: Date.now() + Math.random(), name: '', price: '', qty: 1 });

const RroView = () => {
  const { activeFop } = useFop();
  const { addTransaction, products } = useData();
  const licenseKey = activeFop?.checkboxLicenseKey || '';
  const [signedIn, setSignedIn] = useState(cbSignedIn());
  const [shift, setShift] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [items, setItems] = useState([EMPTY_ITEM()]);
  const [payment, setPayment] = useState('CASH');
  const [lastReceipt, setLastReceipt] = useState(null);

  const refreshShift = async () => {
    if (!cbSignedIn()) return;
    setShift(await cbCurrentShift(licenseKey));
  };
  useEffect(() => { refreshShift(); /* eslint-disable-next-line */ }, [signedIn]);

  const run = async (fn, okMsg) => {
    setBusy(true); setMsg('');
    try { const r = await fn(); if (okMsg) setMsg(okMsg); await refreshShift(); return r; }
    catch (e) { setMsg('Помилка: ' + e.message); }
    finally { setBusy(false); }
  };

  const handleSignIn = () => run(async () => {
    await cbSignIn(activeFop?.checkboxLogin, activeFop?.checkboxPassword);
    setSignedIn(true);
  }, 'Касира авторизовано');

  const total = round2(items.reduce((s, it) => s + (+it.price || 0) * (+it.qty || 0), 0));
  const setItem = (id, field, v) => setItems(p => p.map(it => it.id === id ? { ...it, [field]: v } : it));

  const handleSell = () => run(async () => {
    const valid = items.filter(it => it.name.trim() && +it.price > 0 && +it.qty > 0);
    if (!valid.length) throw new Error('Додайте хоча б одну позицію');
    const receipt = await cbSellReceipt(licenseKey, valid, payment, total);
    setLastReceipt(receipt);
    // Чек → надходження в журнал (каса або еквайринг)
    addTransaction({
      date: new Date().toISOString().slice(0, 10), type: 'income',
      counterparty: 'Роздрібний покупець',
      amount: total,
      description: `Фіскальний чек ПРРО №${receipt.fiscal_code || receipt.id?.slice(0, 8) || ''}`,
      paymentMethod: payment === 'CASH' ? 'cash' : 'acquiring',
    });
    setItems([EMPTY_ITEM()]);
    return receipt;
  }, 'Чек фіскалізовано і додано в журнал');

  if (!activeFop?.checkboxLogin || !licenseKey) {
    return (
      <div className="view-placeholder">
        <div className="placeholder-icon">🖨</div>
        <h3>ПРРО (Checkbox)</h3>
        <p>Заповніть логін, пароль касира і ліцензійний ключ каси<br />
          у профілі ФОП → вкладка «РРО / ПРРО».</p>
      </div>
    );
  }

  return (
    <div className="view-rro">
      <div className="view-toolbar">
        <h2 className="view-title">ПРРО (Checkbox)</h2>
        <div className="toolbar-actions">
          {!signedIn ? (
            <button className="btn btn--primary" disabled={busy} onClick={handleSignIn}>Увійти касиром</button>
          ) : (
            <>
              {!shift
                ? <button className="btn btn--primary" disabled={busy} onClick={() => run(() => cbOpenShift(licenseKey), 'Зміну відкрито')}>Відкрити зміну</button>
                : <>
                    <button className="btn btn--ghost" disabled={busy} onClick={() => run(() => cbXReport(licenseKey), 'X-звіт сформовано')}>X-звіт</button>
                    <button className="btn btn--danger" disabled={busy} onClick={() => window.confirm('Закрити зміну (Z-звіт)?') && run(() => cbCloseShift(licenseKey), 'Зміну закрито (Z-звіт)')}>Z-звіт / закрити</button>
                  </>}
              <button className="btn btn--ghost btn--sm" onClick={() => { cbSignOut(); setSignedIn(false); setShift(null); }}>Вийти</button>
            </>
          )}
        </div>
      </div>

      {msg && <div className="settings-msg" style={{ marginBottom: 10 }}>{msg}</div>}

      <div className="stats-grid" style={{ marginBottom: 14 }}>
        <div className="stat-card">
          <div className="stat-label">Стан зміни</div>
          <div className="stat-value" style={{ color: shift ? 'var(--success)' : 'var(--text-muted)' }}>
            {signedIn ? (shift ? 'Відкрита' : 'Закрита') : 'Не авторизовано'}
          </div>
        </div>
        {shift?.opened_at && (
          <div className="stat-card"><div className="stat-label">Відкрита з</div>
            <div className="stat-value" style={{ fontSize: '.95rem' }}>{new Date(shift.opened_at).toLocaleString('uk-UA')}</div></div>
        )}
      </div>

      {signedIn && shift && (
        <div className="settings-section">
          <h3>Новий чек</h3>
          {items.map(it => (
            <div key={it.id} className="form-row-4" style={{ marginBottom: 6 }}>
              <div className="field" style={{ gridColumn: 'span 2' }}>
                <input list="rro-products" placeholder="Назва товару/послуги" value={it.name}
                  onChange={e => {
                    const p = products.find(x => x.name === e.target.value);
                    setItem(it.id, 'name', e.target.value);
                    if (p?.price) setItem(it.id, 'price', p.price);
                  }} />
              </div>
              <div className="field"><input type="number" placeholder="Ціна" min="0" step="0.01"
                value={it.price} onChange={e => setItem(it.id, 'price', e.target.value)} /></div>
              <div className="field" style={{ display: 'flex', gap: 6 }}>
                <input type="number" placeholder="К-сть" min="0.001" step="1" style={{ flex: 1 }}
                  value={it.qty} onChange={e => setItem(it.id, 'qty', e.target.value)} />
                <button className="btn-icon btn-icon--del" onClick={() => setItems(p => p.length > 1 ? p.filter(x => x.id !== it.id) : p)}>✕</button>
              </div>
            </div>
          ))}
          <datalist id="rro-products">{products.map(p => <option key={p.id} value={p.name} />)}</datalist>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            <button className="btn btn--ghost btn--sm" onClick={() => setItems(p => [...p, EMPTY_ITEM()])}>+ Позиція</button>
            <select value={payment} onChange={e => setPayment(e.target.value)} style={{ maxWidth: 160 }}>
              <option value="CASH">Готівка</option>
              <option value="CARD">Картка</option>
            </select>
            <b style={{ marginLeft: 'auto' }}>Разом: {fmtMoney(total)} грн</b>
            <button className="btn btn--primary" disabled={busy || total <= 0} onClick={handleSell}>
              Фіскалізувати чек
            </button>
          </div>
        </div>
      )}

      {lastReceipt && (
        <div className="settings-section">
          <h3>Останній чек</h3>
          <p>Фіскальний № <b>{lastReceipt.fiscal_code || '—'}</b> · Сума {fmtMoney(total)} грн</p>
          <a className="btn btn--ghost" href={receiptUrl(lastReceipt.id)} target="_blank" rel="noreferrer">
            Відкрити чек (QR-сторінка)
          </a>
        </div>
      )}

      <p className="cell-muted" style={{ fontSize: '.8rem', marginTop: 14 }}>
        Фіскалізація напряму через API Checkbox. Кожен чек автоматично додається
        в журнал операцій як надходження (каса або еквайринг). Якщо браузер блокує
        запити (CORS) — повідомте, перейдемо на проксі.
      </p>
    </div>
  );
};

export default RroView;
