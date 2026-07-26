import React, { useState, useEffect, useCallback } from 'react';
import { listAttachments, attachFile, detachFile, signedUrl } from '../../lib/files';

// Список файлів, прикріплених до сутності. Reusable.
// props: fopId, entityType ('transaction'|'counterparty'|'invoice'|'act'|'delivery_note'|'vat_invoice'),
//        entityId, compact (true — компактний вигляд у ряду таблиці)

const AttachmentsList = ({ fopId, entityType, entityId, compact = false }) => {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try { setItems(await listAttachments(entityType, entityId)); }
    catch (e) { setErr(e.message); }
  }, [entityType, entityId]);
  useEffect(() => { load(); }, [load]);

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setErr('');
    try {
      await attachFile(file, { fopId, entityType, entityId });
      await load();
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); e.target.value = ''; }
  };

  const onDownload = async (a) => {
    try { window.open(await signedUrl(a.storagePath, 3600), '_blank'); }
    catch (ex) { alert(ex.message); }
  };

  const onDelete = async (a) => {
    if (!window.confirm(`Видалити «${a.filename}»?`)) return;
    try { await detachFile(a.id, a.storagePath); await load(); }
    catch (ex) { alert(ex.message); }
  };

  return (
    <div className={compact ? 'attachments attachments--compact' : 'attachments'}>
      {err && <div className="form-error" style={{ fontSize: '.8rem' }}>{err}</div>}
      {items.length === 0 && !compact && (
        <p className="cell-muted" style={{ fontSize: '.83rem', margin: '4px 0' }}>Файлів не прикріплено</p>
      )}
      {items.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {items.map(a => (
            <li key={a.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--mint-50, #f0faf6)', border: '1px solid var(--mint-100, #d6ebe0)',
              borderRadius: 6, padding: '3px 8px', fontSize: '.82rem',
            }}>
              <a style={{ cursor: 'pointer', color: 'var(--mint-900)' }} onClick={() => onDownload(a)} title="Відкрити">
                📎 {a.filename}
              </a>
              <button className="btn-icon btn-icon--del" style={{ fontSize: '.75rem', padding: '0 4px' }}
                onClick={() => onDelete(a)}>✕</button>
            </li>
          ))}
        </ul>
      )}
      <label className="btn btn--ghost btn--sm" style={{ marginTop: 4, cursor: 'pointer' }}>
        {busy ? 'Завантаження…' : '📎 + Файл'}
        <input type="file" style={{ display: 'none' }} onChange={onUpload} disabled={busy} />
      </label>
    </div>
  );
};

export default AttachmentsList;
