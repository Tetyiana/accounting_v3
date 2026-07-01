import React, { useState } from 'react';
import { useSettings } from '../context/SettingsContext';

const EMPTY_ITEM = { name: '', qty: 1, price: '' };

const buildPdf = async (form, settings, total, vat) => {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text('Рахунок-фактура', 14, 18);

  doc.setFontSize(10);
  doc.text(`№ ${form.number || '—'}`, 14, 26);
  doc.text(`Дата: ${form.date}`, 14, 32);
  doc.text(`Клієнт: ${form.client || '—'}`, 14, 38);

  autoTable(doc, {
    startY: 46,
    head: [['Найменування', 'К-сть', 'Ціна, грн', 'Сума, грн']],
    body: form.items.map(it => [
      it.name,
      String(it.qty),
      (+it.price || 0).toFixed(2),
      ((+it.qty || 0) * (+it.price || 0)).toFixed(2),
    ]),
    foot: settings.isVatPayer
      ? [
          ['', '', 'Сума без ПДВ:', total.toFixed(2)],
          ['', '', 'ПДВ 20%:', vat.toFixed(2)],
          ['', '', 'Разом з ПДВ:', (total + vat).toFixed(2)],
        ]
      : [['', '', 'Разом:', total.toFixed(2)]],
    styles: { font: 'helvetica' },
  });

  return doc;
};

const DocumentsView = () => {
  const { settings } = useSettings();
  const [form, setForm] = useState({ client: '', number: '', date: new Date().toISOString().slice(0,10), items: [{ ...EMPTY_ITEM }] });
  const [shareSupported] = useState(typeof navigator !== 'undefined' && !!navigator.share && !!navigator.canShare);

  const setField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const setItem = (i, field, value) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.map((it, idx) => idx === i ? { ...it, [field]: value } : it),
    }));
  };

  const addItem    = () => setForm(prev => ({ ...prev, items: [...prev.items, { ...EMPTY_ITEM }] }));
  const removeItem = (i) => setForm(prev => ({ ...prev, items: prev.items.filter((_, idx) => idx !== i) }));

  const total = form.items.reduce((s, it) => s + (+it.qty || 0) * (+it.price || 0), 0);
  const vat   = settings.isVatPayer ? total * 0.2 : 0;

  const handleDownloadPdf = async () => {
    const doc = await buildPdf(form, settings, total, vat);
    doc.save(`rahunok_${form.number || form.date}.pdf`);
  };

  const handleShare = async () => {
    const doc = await buildPdf(form, settings, total, vat);
    const blob = doc.output('blob');
    const file = new File([blob], `rahunok_${form.number || form.date}.pdf`, { type: 'application/pdf' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `Рахунок ${form.number || ''}`.trim() });
      } catch {
        /* користувач закрив діалог поділитися — нічого робити не треба */
      }
    } else {
      // Немає підтримки Web Share API з файлами (десктопні браузери) — просто завантажуємо.
      doc.save(`rahunok_${form.number || form.date}.pdf`);
    }
  };

  return (
    <div className="view-documents">
      <div className="view-toolbar">
        <h2 className="view-title">Документи — Рахунок-фактура</h2>
        <div className="toolbar-actions">
          <button className="btn btn--ghost" onClick={handleDownloadPdf}>⇩ PDF</button>
          <button className="btn btn--primary" onClick={handleShare}>
            {shareSupported ? '↗ Надіслати (Telegram/Viber/Email)' : '⇩ Завантажити PDF'}
          </button>
        </div>
      </div>

      <div className="invoice-builder">
        <div className="form-row-3">
          <div className="field">
            <label>Клієнт</label>
            <input value={form.client} onChange={e => setField('client', e.target.value)} placeholder="Назва або ПІБ" />
          </div>
          <div className="field">
            <label>Номер рахунку</label>
            <input value={form.number} onChange={e => setField('number', e.target.value)} placeholder="№" />
          </div>
          <div className="field">
            <label>Дата</label>
            <input type="date" value={form.date} onChange={e => setField('date', e.target.value)} />
          </div>
        </div>

        <div className="table-wrap" style={{marginTop: 16}}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{width:'50%'}}>Найменування</th>
                <th style={{textAlign:'right', width:'12%'}}>Кількість</th>
                <th style={{textAlign:'right', width:'18%'}}>Ціна, грн</th>
                <th style={{textAlign:'right', width:'18%'}}>Сума, грн</th>
                <th style={{width:'2%'}}></th>
              </tr>
            </thead>
            <tbody>
              {form.items.map((it, i) => (
                <tr key={i}>
                  <td>
                    <input
                      value={it.name}
                      onChange={e => setItem(i, 'name', e.target.value)}
                      placeholder="Товар або послуга"
                      className="table-input"
                    />
                  </td>
                  <td>
                    <input
                      type="number" value={it.qty} min="1" step="any"
                      onChange={e => setItem(i, 'qty', e.target.value)}
                      className="table-input table-input--right"
                    />
                  </td>
                  <td>
                    <input
                      type="number" value={it.price} min="0" step="0.01"
                      onChange={e => setItem(i, 'price', e.target.value)}
                      className="table-input table-input--right"
                      placeholder="0.00"
                    />
                  </td>
                  <td style={{textAlign:'right', fontWeight:600}}>
                    {((+it.qty || 0) * (+it.price || 0)).toLocaleString('uk-UA', { minimumFractionDigits: 2 })}
                  </td>
                  <td>
                    {form.items.length > 1 && (
                      <button className="btn-icon btn-icon--del" onClick={() => removeItem(i)}>✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {settings.isVatPayer && (
                <>
                  <tr>
                    <td colSpan={3} style={{textAlign:'right'}}>Сума без ПДВ:</td>
                    <td style={{textAlign:'right'}}>{total.toLocaleString('uk-UA', {minimumFractionDigits:2})}</td>
                    <td></td>
                  </tr>
                  <tr>
                    <td colSpan={3} style={{textAlign:'right'}}>ПДВ 20%:</td>
                    <td style={{textAlign:'right'}}>{vat.toLocaleString('uk-UA', {minimumFractionDigits:2})}</td>
                    <td></td>
                  </tr>
                </>
              )}
              <tr>
                <td colSpan={3} style={{textAlign:'right', fontWeight:700}}>
                  {settings.isVatPayer ? 'Разом з ПДВ:' : 'Разом:'}
                </td>
                <td style={{textAlign:'right', fontWeight:700, fontSize:'1.05rem'}}>
                  {(total + vat).toLocaleString('uk-UA', {minimumFractionDigits:2})} грн
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <button className="btn btn--ghost" onClick={addItem} style={{marginTop: 8}}>+ Додати рядок</button>
      </div>
    </div>
  );
};

export default DocumentsView;
