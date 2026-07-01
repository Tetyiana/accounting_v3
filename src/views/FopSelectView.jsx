import React, { useState } from 'react';
import { useFop } from '../context/FopContext';
import { useAuth } from '../context/AuthContext';
import { TAX_GROUPS } from '../constants/taxOptions';
import FopProfileView from './FopProfileView';

const FopSelectView = () => {
  const { fops, setActiveFop } = useFop();
  const { user, logout } = useAuth();
  const [addMode, setAddMode] = useState(false);

  if (addMode) return <FopProfileView mode="create" onCancel={() => setAddMode(false)} />;

  return (
    <div className="fop-select-page">
      <div className="fop-select-header">
        <div className="fop-select-logo">
          <span className="auth-logo-icon">Ф</span>
          <div>
            <div className="auth-logo-title">Облік ФОП</div>
            <div className="auth-logo-sub">{user?.name}</div>
          </div>
        </div>
        <button className="btn btn--ghost btn--sm" onClick={logout}>Вийти</button>
      </div>

      <div className="fop-select-body">
        <h2 className="fop-select-title">Оберіть ФОП</h2>

        <div className="fop-cards-grid">
          {fops.map(fop => {
            const group = TAX_GROUPS.find(g => g.id === fop.taxGroup);
            return (
              <button
                key={fop.id}
                className="fop-card"
                onClick={() => setActiveFop(fop.id)}
              >
                <div className="fop-card-avatar">
                  {fop.fullName ? fop.fullName.charAt(0).toUpperCase() : 'Ф'}
                </div>
                <div className="fop-card-info">
                  <div className="fop-card-name">{fop.fullName || 'Без назви'}</div>
                  <div className="fop-card-meta">
                    {fop.rnokpp && <span>{fop.rnokpp}</span>}
                    {group && <span>{group.label}</span>}
                    {fop.isVatPayer && <span className="badge badge--warning">ПДВ</span>}
                    {fop.useRRO && <span className="badge badge--success">РРО</span>}
                  </div>
                </div>
                <span className="fop-card-arrow">›</span>
              </button>
            );
          })}

          <button className="fop-card fop-card--add" onClick={() => setAddMode(true)}>
            <span className="fop-card-add-icon">+</span>
            <span className="fop-card-add-label">Додати ФОП</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default FopSelectView;
