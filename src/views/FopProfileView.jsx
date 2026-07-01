import React, { useState } from 'react';
import { useFop } from '../context/FopContext';
import { useAuth } from '../context/AuthContext';
import { TAX_GROUPS } from '../constants/taxOptions';
import { EMPTY_FOP, BANK_ACCOUNT_EMPTY } from '../constants/fopFields';

const FopProfileView = ({ mode = 'create', fopId, onCancel, isFirst = false }) => {
  const { fops, addFop, updateFop, setActiveFop } = useFop();
  const { user, logout } = useAuth();

  const existing = fopId ? fops.find(f => f.id === fopId) : null;
  const [form, setForm] = useState(existing || { ...EMPTY_FOP });
  const [err, setErr] = useState('');
  const [section, setSection] = useState('main'); // main | address | bank | tax | rro

  const set = (e) => {
    const { name, value, type, checked } = e.target;
    let val = type === 'checkbox' ? checked : value;
    // КVED: автоматична нормалізація коми → крапка (47,91 → 47.91)
    if (name === 'mainKved') val = value.replace(/,/g, '.');
    setForm(prev => ({ ...prev, [name]: val }));
  };

  // Банківські рахунки
  const setBank = (idx, field, value) => {
    setForm(prev => ({
      ...prev,
      bankAccounts: prev.bankAccounts.map((a, i) =>
        i === idx ? { ...a, [field]: value } : a
      ),
    }));
  };
  const addBank = () => setForm(prev => ({
    ...prev,
    bankAccounts: [...prev.bankAccounts, { ...BANK_ACCOUNT_EMPTY, id: Date.now().toString() }],
  }));
  const removeBank = (idx) => setForm(prev => ({
    ...prev,
    bankAccounts: prev.bankAccounts.filter((_, i) => i !== idx),
  }));
  const setMainBank = (idx) => setForm(prev => ({
    ...prev,
    bankAccounts: prev.bankAccounts.map((a, i) => ({ ...a, isMain: i === idx })),
  }));

  const handleSave = () => {
    if (!form.fullName.trim()) { setErr('ПІБ обов\'язкове'); return; }
    if (!form.rnokpp.trim())   { setErr('РНОКПП обов\'язковий'); return; }
    if (form.rnokpp.replace(/\D/g,'').length !== 10) { setErr('РНОКПП має містити 10 цифр'); return; }

    // Нормалізуємо КВЕДи: кома → крапка (47,91 → 47.91)
    const normalized = {
      ...form,
      mainKved:       (form.mainKved       || '').replace(/,/g, '.').trim(),
      additionalKveds:(form.additionalKveds || '').replace(/,/g, '.').trim(),
    };

    if (mode === 'create') {
      addFop(normalized);
    } else {
      updateFop(fopId, normalized);
      if (onCancel) onCancel();
    }
    setErr('');
  };

  const SECTIONS = [
    { id: 'main',    label: 'Основне' },
    { id: 'address', label: 'Адреси' },
    { id: 'bank',    label: 'Банківські рахунки' },
    { id: 'tax',     label: 'Оподаткування' },
    { id: 'rro',     label: 'РРО / ПРРО', disabled: !form.useRRO },
    { id: 'extra',   label: 'Додатково' },
  ];

  return (
    <div className="fop-profile-page">
      {isFirst && (
        <div className="fop-profile-topbar">
          <div className="fop-select-logo">
            <span className="auth-logo-icon">Ф</span>
            <div>
              <div className="auth-logo-title">Облік ФОП</div>
              <div className="auth-logo-sub">{user?.name}</div>
            </div>
          </div>
          <button className="btn btn--ghost btn--sm" onClick={logout}>Вийти</button>
        </div>
      )}

      <div className="fop-profile-wrap">
        <div className="fop-profile-header">
          <h2>{mode === 'create' ? (isFirst ? 'Реєстрація ФОП' : 'Новий ФОП') : 'Редагування ФОП'}</h2>
          {isFirst && (
            <p className="cell-muted">Заповніть реквізити — їх можна буде змінити пізніше в Налаштуваннях.</p>
          )}
        </div>

        {err && <div className="form-error" style={{marginBottom:12}}>{err}</div>}

        <div className="fop-profile-tabs">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              className={`tab-pill${section===s.id?' tab-pill--active':''}${s.disabled?' tab-pill--disabled':''}`}
              onClick={() => !s.disabled && setSection(s.id)}
              disabled={s.disabled}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="fop-profile-body">

          {/* ─── Основне ──────────────────────────────────── */}
          {section === 'main' && (
            <div className="settings-section">
              <div className="form-row-2">
                <div className="field">
                  <label>ПІБ підприємця <span className="req">*</span></label>
                  <input name="fullName" value={form.fullName} onChange={set}
                    placeholder="Іваненко Іван Іванович" autoFocus />
                </div>
                <div className="field">
                  <label>РНОКПП (ІПН) <span className="req">*</span></label>
                  <input name="rnokpp" value={form.rnokpp} onChange={set}
                    placeholder="1234567890" maxLength={10} />
                </div>
              </div>
              <div className="form-row-2">
                <div className="field">
                  <label>Основний КВЕД</label>
                  <input name="mainKved" value={form.mainKved} onChange={set} placeholder="47.91" />
                  <span className="cell-muted" style={{fontSize:'.75rem'}}>Формат: 47.91</span>
                </div>
                <div className="field">
                  <label>Додаткові КВЕДи (через кому)</label>
                  <input name="additionalKveds" value={form.additionalKveds} onChange={set} placeholder="73.11, 63.12, 47.73" />
                  <span className="cell-muted" style={{fontSize:'.75rem'}}>Формат: 73.11, 63.12</span>
                </div>
              </div>
              <div className="form-row-3">
                <div className="field">
                  <label>Дата реєстрації ФОП</label>
                  <input type="date" name="registrationDate" value={form.registrationDate} onChange={set} />
                </div>
                <div className="field">
                  <label>Номер запису в ЄДР</label>
                  <input name="edrRecord" value={form.edrRecord} onChange={set} placeholder="2 000 000 000" />
                </div>
                <div className="field">
                  <label>Свідоцтво платника ЄП</label>
                  <input name="epCertificate" value={form.epCertificate} onChange={set} />
                </div>
              </div>
            </div>
          )}

          {/* ─── Адреси ───────────────────────────────────── */}
          {section === 'address' && (
            <div className="settings-section">
              <div className="field">
                <label>Юридична адреса</label>
                <input name="legalAddress" value={form.legalAddress} onChange={set}
                  placeholder="Область, місто, вулиця, буд., кв." />
              </div>
              <label className="check-label">
                <input type="checkbox" name="sameAddress" checked={form.sameAddress} onChange={set} />
                Фактична адреса збігається з юридичною
              </label>
              {!form.sameAddress && (
                <div className="field">
                  <label>Фактична адреса</label>
                  <input name="actualAddress" value={form.actualAddress} onChange={set}
                    placeholder="Область, місто, вулиця, буд., кв." />
                </div>
              )}
            </div>
          )}

          {/* ─── Банківські рахунки ───────────────────────── */}
          {section === 'bank' && (
            <div className="settings-section">
              {form.bankAccounts.map((acc, idx) => (
                <div key={acc.id || idx} className="bank-account-row">
                  <div className="bank-account-fields">
                    <div className="field">
                      <label>IBAN {idx === 0 ? '(основний)' : ''}</label>
                      <input value={acc.iban} onChange={e => setBank(idx,'iban',e.target.value)}
                        placeholder="UA000000000000000000000000000" maxLength={34} />
                    </div>
                    <div className="field">
                      <label>Банк</label>
                      <input value={acc.bankName} onChange={e => setBank(idx,'bankName',e.target.value)}
                        placeholder="Назва банку" />
                    </div>
                    <div className="bank-account-actions">
                      {!acc.isMain && (
                        <button className="btn btn--ghost btn--sm" onClick={() => setMainBank(idx)}>
                          Зробити основним
                        </button>
                      )}
                      {acc.isMain && <span className="badge badge--success">Основний</span>}
                      {form.bankAccounts.length > 1 && (
                        <button className="btn-icon btn-icon--del" onClick={() => removeBank(idx)}>✕</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <button className="btn btn--ghost" onClick={addBank} style={{marginTop:8}}>+ Додати рахунок</button>
            </div>
          )}

          {/* ─── Оподаткування ────────────────────────────── */}
          {section === 'tax' && (
            <div className="settings-section">
              <div className="field" style={{maxWidth:360}}>
                <label>Група оподаткування</label>
                <select name="taxGroup" value={form.taxGroup} onChange={set}>
                  {TAX_GROUPS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
                </select>
              </div>
              <div className="field" style={{maxWidth:360}}>
                <label>ІПН платника ПДВ</label>
                <input name="vatCertificate" value={form.vatCertificate} onChange={set}
                  placeholder="РНОКПП або ЄДРПОУ (Свідоцтво скасовано з 2014 р.)" />
              </div>
              <div className="field-checks">
                <label className="check-label">
                  <input type="checkbox" name="isVatPayer" checked={form.isVatPayer} onChange={set} />
                  Платник ПДВ
                </label>
                <label className="check-label">
                  <input type="checkbox" name="useWarehouse" checked={form.useWarehouse} onChange={set} />
                  Вести складський облік
                </label>
                <label className="check-label">
                  <input type="checkbox" name="useRRO" checked={form.useRRO} onChange={set} />
                  РРО / ПРРО (Checkbox)
                </label>
              </div>
            </div>
          )}

          {/* ─── РРО / ПРРО ───────────────────────────────── */}
          {section === 'rro' && form.useRRO && (
            <div className="settings-section">
              <p className="cell-muted" style={{marginBottom:12}}>
                Облікові дані Checkbox (зберігаються тільки в цьому браузері).
              </p>
              <div className="form-row-3">
                <div className="field">
                  <label>Логін (email)</label>
                  <input name="checkboxLogin" type="email" value={form.checkboxLogin} onChange={set} />
                </div>
                <div className="field">
                  <label>Пароль</label>
                  <input name="checkboxPassword" type="password" value={form.checkboxPassword} onChange={set} />
                </div>
                <div className="field">
                  <label>Ліцензійний ключ касира</label>
                  <input name="checkboxLicenseKey" value={form.checkboxLicenseKey} onChange={set} />
                </div>
              </div>
            </div>
          )}

          {/* ─── Додатково ─────────────────────────────────── */}
          {section === 'extra' && (
            <div className="settings-section">

              {/* Факсиміле */}
              <h3 style={{marginBottom:4}}>Факсиміле</h3>
              <p className="cell-muted" style={{fontSize:'.83rem', marginBottom:12}}>
                Зображення підпису або печатки — автоматично накладається на рахунки
                при збереженні в PDF. При звичайному друку — не накладається.
              </p>
              {form.facsimile ? (
                <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:10}}>
                  <img
                    src={form.facsimile}
                    alt="Факсиміле"
                    style={{maxHeight:80, maxWidth:200, border:'1px solid var(--border)',
                            borderRadius:4, padding:4, background:'#fff'}}
                  />
                  <button
                    className="btn btn--danger-outline btn--sm"
                    onClick={() => setForm(p => ({ ...p, facsimile: null }))}>
                    Видалити
                  </button>
                </div>
              ) : (
                <p className="cell-muted" style={{marginBottom:8, fontSize:'.82rem'}}>Факсиміле не завантажено</p>
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                style={{display:'none'}}
                id="facsimile-input"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 512 * 1024) { alert('Файл завеликий. Максимум 512 КБ.'); e.target.value=''; return; }
                  const reader = new FileReader();
                  reader.onload = ev => setForm(p => ({ ...p, facsimile: ev.target.result }));
                  reader.readAsDataURL(file);
                  e.target.value = '';
                }}
              />
              <button className="btn btn--ghost" onClick={() => document.getElementById('facsimile-input').click()}>
                ⇪ {form.facsimile ? 'Замінити факсиміле' : 'Завантажити факсиміле'} (PNG, JPEG, SVG, до 512 КБ)
              </button>

              {/* Версія XML-схеми для звітності */}
              <h3 style={{marginTop:24, marginBottom:4}}>XML звітність</h3>
              <p className="cell-muted" style={{fontSize:'.83rem', marginBottom:8}}>
                Версія схеми (C_DOC_VER) для Єдиної звітності та ПН.
                При зміні наказу ДПС оновіть це поле без перекомпіляції програми.
              </p>
              <div className="field" style={{maxWidth:120}}>
                <label>C_DOC_VER</label>
                <input
                  name="xmlDocVer"
                  value={form.xmlDocVer || '01'}
                  onChange={set}
                  placeholder="01"
                  maxLength={5}
                />
              </div>

              {/* Примітки до ФОП */}
              <h3 style={{marginTop:24, marginBottom:4}}>Службові примітки</h3>
              <div className="field">
                <label>Примітки (внутрішні, не виводяться в документах)</label>
                <textarea
                  name="notes"
                  value={form.notes || ''}
                  onChange={set}
                  rows={3}
                  placeholder="Будь-яка службова інформація про цього ФОП"
                  style={{width:'100%', resize:'vertical'}}
                />
              </div>

            </div>
          )}

        </div>

        <div className="form-actions" style={{marginTop:20}}>
          <button className="btn btn--primary" onClick={handleSave}>
            {mode === 'create' ? 'Зберегти і продовжити' : 'Зберегти зміни'}
          </button>
          {!isFirst && onCancel && (
            <button className="btn btn--ghost" onClick={onCancel}>Скасувати</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FopProfileView;
