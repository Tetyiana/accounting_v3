import React, { useState, useEffect } from 'react';
import { useFop } from '../context/FopContext';
import { useData } from '../context/DataContext';
import { fmtMoney } from '../utils/documentLogic';
import {
  cbSignIn, cbSignedIn, cbSignOut, cbCurrentShift,
  cbOpenShift, cbCloseShift, cbXReport, cbSellReceipt, cbServiceReceipt, cbTaxes, receiptUrl,
} from '../utils/checkboxApi';

// ПРРО (Checkbox): зміни, фіскалізація чеків, X/Z-звіти.
// Credentials беруться з профілю ФОПа (вкладка РРО/ПРРО).

const round2 = n => Math.round((+n || 0) * 100) / 100;
const EMPTY_ITEM = () => ({ id: Date.now() + Math.random(), name: '', price: '', qty: 1, excise: false });

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
  const [isReturn, setIsReturn] = useState(false);      // чек повернення
  const [returnNote, setReturnNote] = useState('');     // номер чека, що повертається
  const [serviceSum, setServiceSum] = useState('');
  const [taxes, setTaxes] = useState([]);               // податкові ставки каси
  const [vatCode, setVatCode] = useState('');           // код ставки ПДВ для всіх позицій
  const [exciseCode, setExciseCode] = useState('');     // код ставки акцизу для підакцизних позицій

  const refreshShift = async () => {
    if (!cbSignedIn()) return;
    setShift(await cbCurrentShift(licenseKey));
    if (!taxes.length) setTaxes(await cbTaxes(licenseKey));
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

  const exciseBase = round2(items.filter(it => it.excise).reduce((s, it) => s + (+it.price || 0) * (+it.qty || 0), 0));

  const handleSell = () => run(async () => {
    const valid = items.filter(it => it.name.trim() && +it.price > 0 && +it.qty > 0);
    if (!valid.length) throw new Error('Додайте хоча б одну позицію');
    if (isReturn && !returnNote.trim()) throw new Error('Вкажіть фіскальний номер чека, за яким робиться повернення');
    if (activeFop?.isVatPayer && taxes.length && !vatCode) throw new Error('Оберіть ставку ПДВ для чека: платник ПДВ має друкувати її в чеку');
    if (valid.some(it => it.excise) && taxes.length && !exciseCode) throw new Error('У чеку є підакцизний товар — оберіть ставку акцизу');
    const withTax = valid.map(it => ({
      ...it, taxCodes: [vatCode, it.excise ? exciseCode : ''].filter(Boolean).map(Number),
    }));
    const receipt = await cbSellReceipt(licenseKey, withTax, payment, total, { isReturn });
    setLastReceipt({ ...receipt, sum: total, isReturn });
    // Чек → журнал: продаж — надходження, повернення — повернення покупцю (каса або еквайринг).
    // exciseBase — вартість підакцизних товарів у чеку, база роздрібного акцизу.
    addTransaction({
      date: new Date().toISOString().slice(0, 10), type: isReturn ? 'refund_out' : 'income',
      counterparty: 'Роздрібний покупець',
      amount: total,
      exciseBase,
      description: isReturn
        ? `Чек повернення ПРРО №${receipt.fiscal_code || ''} до чека №${returnNote.trim()}`
        : `Фіскальний чек ПРРО №${receipt.fiscal_code || receipt.id?.slice(0, 8) || ''}`,
      paymentMethod: payment === 'CASH' ? 'cash' : 'acquiring',
    });
    setItems([EMPTY_ITEM()]); setIsReturn(false); setReturnNote('');
    return receipt;
  }, isReturn ? 'Чек повернення фіскалізовано і додано в журнал' : 'Чек фіскалізовано і додано в журнал');

  const handleService = (sign) => run(async () => {
    const sum = round2(serviceSum);
    if (!(sum > 0)) throw new Error('Вкажіть суму');
    await cbServiceReceipt(licenseKey, sign * sum);
    setServiceSum('');
  }, sign > 0 ? 'Службове внесення проведено' : 'Службове вилучення проведено');

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
        {shift?.balance && (
          <div className="stat-card"><div className="stat-label">Готівка в касі</div>
            <div className="stat-value">{fmtMoney((shift.balance.balance || 0) / 100)}</div></div>
        )}
        {shift?.opened_at && Date.now() - new Date(shift.opened_at).getTime() > 23 * 3600 * 1000 && (
          <div className="stat-card"><div className="stat-label">Увага</div>
            <div className="stat-value" style={{ fontSize: '.9rem', color: 'var(--warning)' }}>Зміна триває понад 23 години — закрийте її: максимум 24 години</div></div>
        )}
      </div>

      {signedIn && shift && (
        <div className="settings-section">
          <h3>{isReturn ? 'Чек повернення' : 'Новий чек'}</h3>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={isReturn} onChange={e => setIsReturn(e.target.checked)} /> Повернення</label>
            {isReturn && <input placeholder="Фіскальний № чека продажу" value={returnNote} onChange={e => setReturnNote(e.target.value)} style={{ maxWidth: 240 }} />}
            {taxes.length > 0 && (<>
              <select value={vatCode} onChange={e => setVatCode(e.target.value)} style={{ maxWidth: 220 }}>
                <option value="">ПДВ: без ставки</option>
                {taxes.map(t => <option key={t.code} value={t.code}>{t.symbol} — {t.label}</option>)}
              </select>
              <select value={exciseCode} onChange={e => setExciseCode(e.target.value)} style={{ maxWidth: 220 }}>
                <option value="">Акциз: ставка для підакцизних</option>
                {taxes.map(t => <option key={t.code} value={t.code}>{t.symbol} — {t.label}</option>)}
              </select>
            </>)}
          </div>
          {items.map(it => (
            <div key={it.id} className="form-row-4" style={{ marginBottom: 6 }}>
              <div className="field" style={{ gridColumn: 'span 2' }}>
                <input list="rro-products" placeholder="Назва товару/послуги" value={it.name}
                  onChange={e => {
                    const p = products.find(x => x.name === e.target.value);
                    setItem(it.id, 'name', e.target.value);
                    if (p?.price) setItem(it.id, 'price', p.price);
                    if (p) setItem(it.id, 'excise', !!p.isExcise);
                  }} />
              </div>
              <div className="field"><input type="number" placeholder="Ціна" min="0" step="0.01"
                value={it.price} onChange={e => setItem(it.id, 'price', e.target.value)} /></div>
              <div className="field" style={{ display: 'flex', gap: 6 }}>
                <input type="number" placeholder="К-сть" min="0.001" step="1" style={{ flex: 1 }}
                  value={it.qty} onChange={e => setItem(it.id, 'qty', e.target.value)} />
                <label title="Підакцизний товар (алкоголь): роздрібний акциз 5 %" style={{ display: 'flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={!!it.excise} onChange={e => setItem(it.id, 'excise', e.target.checked)} />акциз</label>
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
            <b style={{ marginLeft: 'auto' }}>
              Разом: {fmtMoney(total)} грн{exciseBase > 0 ? ` · у т. ч. акциз ${fmtMoney(exciseBase * 5 / 105)}` : ''}
            </b>
            <button className={`btn ${isReturn ? 'btn--danger' : 'btn--primary'}`} disabled={busy || total <= 0} onClick={handleSell}>
              {isReturn ? 'Фіскалізувати повернення' : 'Фіскалізувати чек'}
            </button>
          </div>
        </div>
      )}

      {signedIn && shift && (
        <div className="settings-section">
          <h3>Службове внесення і вилучення готівки</h3>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="number" min="0" step="0.01" placeholder="Сума, грн" value={serviceSum}
              onChange={e => setServiceSum(e.target.value)} style={{ maxWidth: 160 }} />
            <button className="btn btn--ghost" disabled={busy} onClick={() => handleService(1)}>Внести</button>
            <button className="btn btn--ghost" disabled={busy} onClick={() => handleService(-1)}>Вилучити</button>
          </div>
          <p className="cell-muted" style={{ fontSize: '.8rem', marginTop: 6 }}>
            Розмінна монета і здавання виручки. У журнал операцій не потрапляють: це не дохід і не витрата.
            Здавання готівки в банк внесіть у «Банк / Каса» окремою операцією.
          </p>
        </div>
      )}

      {lastReceipt && (
        <div className="settings-section">
          <h3>{lastReceipt.isReturn ? 'Останній чек повернення' : 'Останній чек'}</h3>
          <p>Фіскальний № <b>{lastReceipt.fiscal_code || '—'}</b> · Сума {fmtMoney(lastReceipt.sum)} грн</p>
          <a className="btn btn--ghost" href={receiptUrl(lastReceipt.id)} target="_blank" rel="noreferrer">
            Відкрити чек (QR-сторінка)
          </a>
        </div>
      )}

      <p className="cell-muted" style={{ fontSize: '.8rem', marginTop: 14 }}>
        Фіскалізація напряму через API Checkbox. Чек продажу додається в журнал як надходження,
        чек повернення — як повернення покупцю (каса або еквайринг).
        {activeFop?.isVatPayer ? ' Підсумкову податкову накладну за день сформуйте в «ПДВ» → «Контроль».' : ''}
        {' '}Вартість підакцизних товарів потрапляє в розрахунок роздрібного акцизу («Ліцензії / Акциз»).
      </p>
    </div>
  );
};

export default RroView;
