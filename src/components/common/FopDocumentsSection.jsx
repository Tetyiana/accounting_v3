import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import {
  listFopDocuments, addFopDocument, removeFopDocument,
  uploadFacsimile, signedUrl, FOP_DOC_CATEGORIES,
} from '../../lib/files';

// Документи і факсиміле активного ФОПа.
// props: fopId, fop (з stamp_path / signature_path), onFopChanged

const Preview = ({ path, alt, height = 60 }) => {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!path) return;
    signedUrl(path, 3600).then(setUrl).catch(() => {});
  }, [path]);
  if (!path) return null;
  return url
    ? <img src={url} alt={alt} style={{ maxHeight: height, maxWidth: 200, border: '1px solid var(--border)', borderRadius: 4, padding: 4, background: '#fff' }} />
    : <span className="cell-muted" style={{ fontSize: '.82rem' }}>завантаження…</span>;
};

const FopDocumentsSection = ({ fopId, fop, onFopChanged }) => {
  const [docs, setDocs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [newCategory, setNewCategory] = useState('passport');
  const [newTitle, setNewTitle] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!fopId) return;
    try { setDocs(await listFopDocuments(fopId)); }
    catch (e) { setErr(e.message); }
  }, [fopId]);
  useEffect(() => { load(); }, [load]);

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setErr('');
    try {
      await addFopDocument(file, { fopId, category: newCategory, title: newTitle });
      setNewTitle('');
      await load();
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); e.target.value = ''; }
  };

  const onDelete = async (d) => {
    if (!window.confirm(`Видалити «${d.title || d.filename}»?`)) return;
    try { await removeFopDocument(d.id, d.storagePath); await load(); }
    catch (ex) { setErr(ex.message); }
  };

  const onOpen = async (d) => {
    try { window.open(await signedUrl(d.storagePath, 3600), '_blank'); }
    catch (ex) { alert(ex.message); }
  };

  const onFacsimile = async (kind, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setErr('');
    try {
      const path = await uploadFacsimile(file, { fopId, kind });
      onFopChanged?.({ [kind === 'stamp' ? 'stampPath' : 'signaturePath']: path });
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); e.target.value = ''; }
  };

  const clearFacsimile = async (kind) => {
    const col = kind === 'stamp' ? 'stamp_path' : 'signature_path';
    await supabase.from('fops').update({ [col]: '' }).eq('id', fopId);
    onFopChanged?.({ [kind === 'stamp' ? 'stampPath' : 'signaturePath']: '' });
  };

  // ── Відправка списку контрагенту ──
  const buildDocList = async () => {
    // Формуємо перелік з тимчасовими підписаними URL (24 години)
    const lines = [];
    lines.push(`Статутні документи ФОП ${fop?.fullName || ''} (РНОКПП ${fop?.rnokpp || ''})`);
    lines.push('');
    for (const d of docs) {
      const cat = FOP_DOC_CATEGORIES.find(c => c.id === d.category)?.label || d.category;
      try {
        const url = await signedUrl(d.storagePath, 24 * 3600);
        lines.push(`${cat}: ${d.title || d.filename}\n${url}`);
        lines.push('');
      } catch (_) {
        lines.push(`${cat}: ${d.title || d.filename} (посилання недоступне)`);
      }
    }
    return lines.join('\n');
  };

  const sendEmail = async () => {
    const body = await buildDocList();
    const subject = `Статутні документи ФОП ${fop?.fullName || ''}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const sendTelegram = async () => {
    const text = await buildDocList();
    window.open(`https://t.me/share/url?url=${encodeURIComponent('')}&text=${encodeURIComponent(text)}`, '_blank');
  };

  const copyList = async () => {
    const text = await buildDocList();
    try { await navigator.clipboard.writeText(text); alert('Список скопійовано у буфер обміну'); }
    catch { prompt('Скопіюйте вручну:', text); }
  };

  if (!fopId) {
    return <p className="cell-muted">Спочатку збережіть основні дані ФОПа</p>;
  }

  return (
    <div className="settings-section">
      {err && <div className="form-error">{err}</div>}

      {/* ── ФАКСИМІЛЕ ── */}
      <h3 style={{ marginBottom: 4 }}>Факсиміле</h3>
      <p className="cell-muted" style={{ fontSize: '.83rem', marginBottom: 12 }}>
        Підпис і печатка — сканується як зображення (PNG/JPG, бажано з прозорим фоном для підпису).
        На друк документа з&apos;являється галочка «з факсиміле» — можна вимкнути перед друком.
      </p>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: '.85rem', fontWeight: 500, marginBottom: 6 }}>Підпис</div>
          <Preview path={fop?.signaturePath} alt="Підпис" height={60} />
          <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
            <label className="btn btn--ghost btn--sm" style={{ cursor: 'pointer' }}>
              {fop?.signaturePath ? 'Замінити' : '+ Завантажити'}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => onFacsimile('signature', e)} disabled={busy} />
            </label>
            {fop?.signaturePath && (
              <button className="btn btn--ghost btn--sm" onClick={() => clearFacsimile('signature')}>Видалити</button>
            )}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '.85rem', fontWeight: 500, marginBottom: 6 }}>Печатка</div>
          <Preview path={fop?.stampPath} alt="Печатка" height={100} />
          <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
            <label className="btn btn--ghost btn--sm" style={{ cursor: 'pointer' }}>
              {fop?.stampPath ? 'Замінити' : '+ Завантажити'}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => onFacsimile('stamp', e)} disabled={busy} />
            </label>
            {fop?.stampPath && (
              <button className="btn btn--ghost btn--sm" onClick={() => clearFacsimile('stamp')}>Видалити</button>
            )}
          </div>
        </div>
      </div>

      {/* ── СТАТУТНІ ДОКУМЕНТИ ── */}
      <h3 style={{ marginBottom: 4, marginTop: 8 }}>Статутні документи</h3>
      <p className="cell-muted" style={{ fontSize: '.83rem', marginBottom: 12 }}>
        Скани документів під рукою: паспорт, РНОКПП, витяг з реєстру, ліцензії, договори.
        Кнопки нижче дозволяють одним натиском надіслати весь пакет контрагенту.
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12, flexWrap: 'wrap' }}>
        <div className="field">
          <label>Категорія</label>
          <select value={newCategory} onChange={e => setNewCategory(e.target.value)}>
            {FOP_DOC_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
          <label>Опис (необов&apos;язково)</label>
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="напр., Витяг від 05.03.2024" />
        </div>
        <label className="btn btn--primary btn--sm" style={{ cursor: 'pointer' }}>
          {busy ? 'Завантаження…' : '+ Файл'}
          <input type="file" style={{ display: 'none' }} onChange={onUpload} disabled={busy} />
        </label>
      </div>

      {docs.length === 0 ? (
        <p className="cell-muted" style={{ fontSize: '.83rem' }}>Документів не завантажено</p>
      ) : (
        <table className="data-table" style={{ marginBottom: 12 }}>
          <thead><tr><th>Категорія</th><th>Опис</th><th>Файл</th><th>Розмір</th><th></th></tr></thead>
          <tbody>
            {docs.map(d => (
              <tr key={d.id}>
                <td>{FOP_DOC_CATEGORIES.find(c => c.id === d.category)?.label || d.category}</td>
                <td>{d.title || '—'}</td>
                <td><a style={{ cursor: 'pointer' }} onClick={() => onOpen(d)}>📎 {d.filename}</a></td>
                <td className="cell-muted">{d.size ? `${Math.round(d.size / 1024)} КБ` : '—'}</td>
                <td>
                  <button className="btn-icon btn-icon--del" onClick={() => onDelete(d)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {docs.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <button className="btn btn--ghost btn--sm" onClick={sendEmail}>✉ Надіслати email</button>
          <button className="btn btn--ghost btn--sm" onClick={sendTelegram}>Telegram</button>
          <button className="btn btn--ghost btn--sm" onClick={copyList}>📋 Скопіювати список</button>
          <span className="cell-muted" style={{ fontSize: '.78rem', alignSelf: 'center' }}>
            Посилання діють 24 години
          </span>
        </div>
      )}
    </div>
  );
};

export default FopDocumentsSection;
