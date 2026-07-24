import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useFop } from '../context/FopContext';
import { MODULES } from '../constants/modules';
import { dbSelect, dbInsert, dbDelete, newId } from '../lib/db';
import { fmtMoney } from '../utils/documentLogic';
import { supabase } from '../lib/supabase';

// Тарифи: конструктор модулів по кожному ФОПу + оплата через LiqPay.
// Enforcement: модуль вважається активним, якщо активна підписка з active_until >= сьогодні,
// або active_until = null (тест-режим, безстроково).

const today = () => new Date().toISOString().slice(0, 10);
const isActive = (sub) => !sub.activeUntil || sub.activeUntil >= today();

const PricingView = () => {
  const { fops, updateFop } = useFop();
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState({});   // {fopId: 1|3|12}
  const [paying, setPaying] = useState(false);

  const load = useCallback(() => {
    Promise.all(fops.map(f => dbSelect('subscriptions', { fopId: f.id })))
      .then(lists => { setSubs(lists.flat()); setLoading(false); });
  }, [fops]);
  useEffect(() => { load(); }, [load]);

  // Enforcement: коли підписка протухла, вимикаємо відповідний прапорець ФОПа,
  // щоб меню перестало показувати модуль. Виконується при відкритті сторінки Тарифи.
  useEffect(() => {
    if (loading || !subs.length) return;
    for (const fop of fops) {
      const patch = {};
      const check = (mod, flag) => {
        const s = subs.find(x => x.fopId === fop.id && x.module === mod);
        const active = s && isActive(s);
        if (fop[flag] && !active) patch[flag] = false;
      };
      check('warehouse', 'useWarehouse');
      check('vat', 'isVatPayer');
      check('rro', 'useRRO');
      if (Object.keys(patch).length) updateFop(fop.id, patch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Повернення з LiqPay — поновити список
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('pay') === 'ok') {
      setTimeout(load, 1500);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [load]);

  const findSub = (fopId, mod) => subs.find(s => s.fopId === fopId && s.module === mod);
  const isOn = (fopId, mod) => {
    if (mod === 'base') { const s = findSub(fopId, 'base'); return !s || isActive(s); }
    const s = findSub(fopId, mod);
    return !!s && isActive(s);
  };

  const toggle = (fop, mod) => {
    if (mod === 'base') return;
    const existing = findSub(fop.id, mod);
    if (existing) {
      setSubs(p => p.filter(s => s.id !== existing.id));
      dbDelete('subscriptions', existing.id);
      if (mod === 'warehouse') updateFop(fop.id, { useWarehouse: false });
      if (mod === 'vat')       updateFop(fop.id, { isVatPayer: false });
      if (mod === 'rro')       updateFop(fop.id, { useRRO: false });
    } else {
      const item = { id: newId(), fopId: fop.id, module: mod, activeUntil: null };
      setSubs(p => [...p, item]);
      dbInsert('subscriptions', item);
      if (mod === 'warehouse') updateFop(fop.id, { useWarehouse: true });
      if (mod === 'vat')       updateFop(fop.id, { isVatPayer: true });
      if (mod === 'rro')       updateFop(fop.id, { useRRO: true });
    }
  };

  const perFop = (fopId) => MODULES.filter(m => isOn(fopId, m.id)).reduce((s, m) => s + m.price, 0);
  const total = useMemo(() => fops.reduce((s, f) => s + perFop(f.id), 0), [fops, subs]);
  const earliestExpiry = (fopId) => {
    const active = MODULES.filter(m => isOn(fopId, m.id)).map(m => findSub(fopId, m.id)?.activeUntil).filter(Boolean);
    return active.length ? active.sort()[0] : null;
  };

  const pay = async (fop) => {
    const m = months[fop.id] || 1;
    const activeModules = MODULES.filter(x => isOn(fop.id, x.id)).map(x => x.id);
    if (activeModules.length === 0) { alert('Увімкніть хоча б один модуль'); return; }
    setPaying(true);
    try {
      const { data, error } = await supabase.functions.invoke('payment-liqpay', {
        body: { fop_id: fop.id, months: m, modules: activeModules },
      });
      if (error || !data?.ok) {
        alert(data?.error || error?.message || 'Помилка створення платежу. Перевірте, що функція payment-liqpay задеплоєна і секрети LIQPAY_PUBLIC_KEY / LIQPAY_PRIVATE_KEY задані.');
        return;
      }
      // Відкрити LiqPay Checkout у новому вікні через форму POST
      const w = window.open('', '_blank');
      if (!w) { alert('Дозвольте спливаючі вікна і повторіть'); return; }
      w.document.write(`<!DOCTYPE html><html><body onload="document.forms[0].submit()">
        <form method="POST" action="https://www.liqpay.ua/api/3/checkout" accept-charset="utf-8">
          <input type="hidden" name="data" value="${data.data}">
          <input type="hidden" name="signature" value="${data.signature}">
        </form></body></html>`);
      w.document.close();
    } finally { setPaying(false); }
  };

  if (loading) return <div className="view-placeholder">Завантаження…</div>;

  return (
    <div className="view-pricing">
      <div className="view-toolbar">
        <h2 className="view-title">Тарифи і модулі</h2>
        <div className="stat-card stat-card--accent" style={{ padding: '8px 16px' }}>
          <span className="stat-label">Разом за всіх ФОПів</span>
          <span className="stat-value" style={{ marginLeft: 10 }}>{fmtMoney(total)} грн/міс</span>
        </div>
      </div>

      <p className="cell-muted" style={{ marginBottom: 14, fontSize: '.85rem' }}>
        Підписка рахується по-модульно на кожного ФОПа окремо. «База» входить завжди.
        Оплата через LiqPay (картка). Після оплати період продовжується від поточної дати закінчення.
      </p>

      {fops.map(fop => {
        const expiry = earliestExpiry(fop.id);
        const m = months[fop.id] || 1;
        const amount = perFop(fop.id) * m;
        return (
          <div key={fop.id} className="settings-section" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0 }}>{fop.fullName || 'ФОП'}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {expiry
                  ? <span className="badge badge--info">Активно до {expiry}</span>
                  : <span className="badge badge--muted">Безстроково (тест)</span>}
                <b>{fmtMoney(perFop(fop.id))} грн/міс</b>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              {MODULES.map(mod => {
                const on = isOn(fop.id, mod.id);
                const sub = findSub(fop.id, mod.id);
                return (
                  <button key={mod.id}
                    className={`tab-pill${on ? ' tab-pill--active' : ''}`}
                    onClick={() => toggle(fop, mod.id)}
                    disabled={mod.required}
                    title={mod.desc + (sub?.activeUntil ? ` · до ${sub.activeUntil}` : '')}
                    style={{ minHeight: 42, opacity: mod.required ? .85 : 1 }}>
                    {mod.label} · {mod.price} грн{mod.required ? ' (завжди)' : ''}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '.85rem' }}>Період:</label>
              <select value={m} onChange={e => setMonths(p => ({ ...p, [fop.id]: +e.target.value }))}>
                <option value={1}>1 місяць</option>
                <option value={3}>3 місяці</option>
                <option value={6}>6 місяців</option>
                <option value={12}>12 місяців</option>
              </select>
              <button className="btn btn--primary btn--sm" disabled={paying || amount <= 0} onClick={() => pay(fop)}>
                💳 Оплатити {fmtMoney(amount)} грн
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default PricingView;
