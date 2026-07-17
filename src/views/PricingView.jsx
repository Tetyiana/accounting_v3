import React, { useState, useEffect, useMemo } from 'react';
import { useFop } from '../context/FopContext';
import { MODULES, modulePrice } from '../constants/modules';
import { dbSelect, dbInsert, dbDelete, newId } from '../lib/db';
import { fmtMoney } from '../utils/documentLogic';

// Тарифи: конструктор модулів по кожному ФОПу.
// Зараз — тест-режим: увімкнення безкоштовне і безстрокове,
// сума показується для розуміння майбутньої вартості.

const PricingView = () => {
  const { fops, updateFop } = useFop();
  const [subs, setSubs] = useState([]);       // {id, fopId, module}
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all(fops.map(f => dbSelect('subscriptions', { fopId: f.id })))
      .then(lists => { setSubs(lists.flat()); setLoading(false); });
  }, [fops]);

  const isOn = (fopId, mod) =>
    mod === 'base' || subs.some(s => s.fopId === fopId && s.module === mod);

  const toggle = (fop, mod) => {
    if (mod === 'base') return;
    const existing = subs.find(s => s.fopId === fop.id && s.module === mod);
    if (existing) {
      setSubs(p => p.filter(s => s.id !== existing.id));
      dbDelete('subscriptions', existing.id);
      // синхронізуємо прапорці ФОПа, які керують меню
      if (mod === 'warehouse') updateFop(fop.id, { useWarehouse: false });
      if (mod === 'vat')       updateFop(fop.id, { isVatPayer: false });
      if (mod === 'rro')       updateFop(fop.id, { useRRO: false });
    } else {
      const item = { id: newId(), fopId: fop.id, module: mod };
      setSubs(p => [...p, item]);
      dbInsert('subscriptions', item);
      if (mod === 'warehouse') updateFop(fop.id, { useWarehouse: true });
      if (mod === 'vat')       updateFop(fop.id, { isVatPayer: true });
      if (mod === 'rro')       updateFop(fop.id, { useRRO: true });
    }
  };

  const perFop = (fopId) => MODULES
    .filter(m => isOn(fopId, m.id))
    .reduce((s, m) => s + m.price, 0);

  const total = useMemo(() => fops.reduce((s, f) => s + perFop(f.id), 0), [fops, subs]);

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
        Зараз тестовий період — усі модулі вмикаються безкоштовно; вартість показана
        для розуміння майбутнього тарифу.
      </p>

      {fops.map(fop => (
        <div key={fop.id} className="settings-section" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>{fop.fullName || 'ФОП'}</h3>
            <b>{fmtMoney(perFop(fop.id))} грн/міс</b>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {MODULES.map(m => {
              const on = isOn(fop.id, m.id);
              return (
                <button key={m.id}
                  className={`tab-pill${on ? ' tab-pill--active' : ''}`}
                  onClick={() => toggle(fop, m.id)}
                  disabled={m.required}
                  title={m.desc}
                  style={{ minHeight: 42, opacity: m.required ? .85 : 1 }}>
                  {m.label} · {m.price} грн{m.required ? ' (завжди)' : ''}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default PricingView;
