import React, { useRef, useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useFop } from '../context/FopContext';
import { TAX_GROUPS } from '../constants/taxOptions';
import FopProfileView from './FopProfileView';

const SettingsView = () => {
  const { settings }           = useSettings();
  const { user, logout }       = useAuth();
  const { exportBackup, importBackup } = useData();
  const { activeFop, deleteFop } = useFop();
  const fileRef = useRef(null);
  const [msg, setMsg]         = useState('');
  const [editFop, setEditFop] = useState(false);

  if (editFop) {
    return <FopProfileView mode="edit" fopId={activeFop?.id} onCancel={() => setEditFop(false)} />;
  }

  const handleExport = () => {
    const backup = exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fop-backup_${activeFop?.fullName?.replace(/\s+/g,'_') || 'data'}_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg('Резервну копію завантажено.');
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      if (!window.confirm('Відновлення замінить поточні дані. Продовжити?')) return;
      const res = importBackup(backup);
      setMsg(res.ok ? 'Дані відновлено.' : `Помилка: ${res.error}`);
    } catch { setMsg('Некоректний файл резервної копії.'); }
    finally { e.target.value = ''; }
  };

  const handleDeleteFop = () => {
    if (!window.confirm(`Видалити ФОП "${activeFop?.fullName}"? Всі дані цього ФОП буде втрачено.`)) return;
    deleteFop(activeFop.id);
  };

  return (
    <div className="view-settings">
      <h2 className="view-title">Налаштування</h2>

      {/* ─── Профіль ФОП ─────────────────────────────────── */}
      <div className="settings-section">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h3>Профіль ФОП</h3>
          <button className="btn btn--ghost btn--sm" onClick={() => setEditFop(true)}>Редагувати</button>
        </div>
        {[
          ['ПІБ',             activeFop?.fullName],
          ['РНОКПП',          activeFop?.rnokpp],
          ['Юр. адреса',      activeFop?.legalAddress],
          ['Факт. адреса',    activeFop?.sameAddress ? activeFop?.legalAddress : activeFop?.actualAddress],
          ['Основний КВЕД',      (activeFop?.mainKved       || '').replace(/,/g, '.') || null],
          ['Дата реєстрації',    activeFop?.registrationDate],
          ['Номер ЄДР',          activeFop?.edrRecord],
          ['Свідоцтво ЄП',       activeFop?.epCertificate],
          ['ІПН платника ПДВ',   activeFop?.isVatPayer ? activeFop?.vatCertificate : null],
        ].filter(([, v]) => v).map(([label, value]) => (
          <div key={label} className="settings-row">
            <span className="settings-label">{label}</span>
            <span className="settings-value">{value}</span>
          </div>
        ))}

        {activeFop?.bankAccounts?.length > 0 && (
          <div>
            <div className="settings-label" style={{marginBottom:4}}>Банківські рахунки</div>
            {activeFop.bankAccounts.map((acc, i) => (
              <div key={i} className="settings-row">
                <span className="cell-muted">{acc.bankName || 'Банк'}{acc.isMain ? ' (основний)' : ''}</span>
                <span className="settings-value" style={{fontFamily:'monospace', fontSize:'.82rem'}}>{acc.iban}</span>
              </div>
            ))}
          </div>
        )}

        <div className="settings-row">
          <span className="settings-label">Група</span>
          <span className="settings-value">{TAX_GROUPS.find(g=>g.id===settings.taxGroup)?.label}</span>
        </div>
        <div style={{display:'flex', gap:8, flexWrap:'wrap', marginTop:4}}>
          {settings.isVatPayer   && <span className="badge badge--warning">Платник ПДВ</span>}
          {settings.useWarehouse && <span className="badge badge--success">Склад</span>}
          {settings.useRRO       && <span className="badge badge--success">РРО / ПРРО</span>}
        </div>
      </div>

      {/* ─── Обліковий запис ─────────────────────────────── */}
      <div className="settings-section">
        <h3>Обліковий запис</h3>
        <div className="settings-row">
          <span className="settings-label">Ім'я</span>
          <span className="settings-value">{user?.name}</span>
        </div>
        <div className="settings-row">
          <span className="settings-label">Email</span>
          <span className="settings-value">{user?.email}</span>
        </div>
      </div>

      {/* ─── Резервна копія ──────────────────────────────── */}
      <div className="settings-section">
        <h3>Резервна копія даних</h3>
        <p className="cell-muted" style={{marginBottom:12, fontSize:'.85rem'}}>
          Дані зберігаються в браузері. Зробіть копію, щоб не втратити їх при очищенні кешу.
        </p>
        <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
          <button className="btn btn--primary" onClick={handleExport}>⇩ Завантажити копію</button>
          <button className="btn btn--ghost" onClick={() => fileRef.current?.click()}>⇪ Відновити з файлу</button>
          <input ref={fileRef} type="file" accept="application/json" style={{display:'none'}} onChange={handleImportFile} />
        </div>
        {msg && <div className="settings-msg" style={{marginTop:10}}>{msg}</div>}
      </div>

      {/* ─── Небезпечна зона ─────────────────────────────── */}
      <div className="settings-section settings-section--danger">
        <h3>Небезпечна зона</h3>
        <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
          <button className="btn btn--danger-outline" onClick={handleDeleteFop}>
            Видалити цей ФОП і всі його дані
          </button>
          <button className="btn btn--ghost" onClick={() => {
            if (window.confirm('Вийти з облікового запису?')) logout();
          }}>
            Вийти
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
