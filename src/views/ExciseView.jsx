import React, { useMemo, useState } from 'react';
import { useFop } from '../context/FopContext';
import { useData } from '../context/DataContext';
import { fmtMoney } from '../utils/documentLogic';
import { openPrintWindow } from '../utils/printWindow';
import { taxYear } from '../constants/taxYears';
import { retailExcise } from '../utils/vatLogic';
import { shiftWeekend } from '../utils/deadlines';
import JSZip from 'jszip';
import { encode1251 } from '../utils/xmlDps';
import { buildExcisePackage } from '../utils/exciseXml';

// Ліцензії на роздрібну торгівлю і роздрібний акциз.
// Закон № 3817-IX: ліцензії безстрокові, плата — щокварталу рівними частинами
// до початку кварталу; річна ставка — у мінімальних зарплатах, установлених на 1 січня.
// Роздрібний акциз (пп. 213.1.9, 215.3.10 ПКУ): 5 % вартості реалізованих у роздріб алкогольних
// напоїв з ПДВ; з ціни продажу = ціна × 5 / 105. Тютюнові вироби в роздробі акцизом не обкладаються.
export const LICENSE_KINDS = [
  { id: 'alcohol', label: 'Алкогольні напої (роздріб)', city: 1.5, village: 0.08, per: 'за кожен РРО / ПРРО' },
  { id: 'cider',   label: 'Сидр і перрі без додавання спирту', city: 0.15, village: 0.15, per: 'за кожен РРО / ПРРО' },
  { id: 'tobacco', label: 'Тютюнові вироби та рідини для електронних сигарет', city: 0.35, village: 0.05, per: 'за місце торгівлі' },
  { id: 'fuel',    label: 'Пальне (роздріб)', city: 0.35, village: 0.35, per: 'за місце торгівлі' },
];
const r2 = (n) => Math.round((+n || 0) * 100) / 100;
export const licenseQuarterFee = (lic, year) => {
  const k = LICENSE_KINDS.find(x => x.id === lic.kind);
  if (!k) return 0;
  return r2(taxYear(year).minWage * (lic.village ? k.village : k.city) / 4);
};
const qKey = (d) => `${d.getFullYear()}-${Math.floor(d.getMonth() / 3) + 1}`;
const nextQ = (key) => { const [y, q] = key.split('-').map(Number); return q === 4 ? `${y + 1}-1` : `${y}-${q + 1}`; };
const qLabel = (key) => { const [y, q] = key.split('-'); return `${['І', 'ІІ', 'ІІІ', 'IV'][q - 1]} кв. ${y}`; };
const qStart = (key) => { const [y, q] = key.split('-').map(Number); return new Date(y, (q - 1) * 3, 1); };
const EMPTY = { kind: 'alcohol', number: '', issueDate: '', place: '', rro: '', village: false };

const ExciseView = () => {
  const { activeFop, updateFop } = useFop();
  const { transactions } = useData();
  const data = activeFop?.licenses || {};
  const list = data.list || [];
  const [form, setForm] = useState(null);
  const [period, setPeriod] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); });
  const save = (patch) => updateFop(activeFop.id, { licenses: { ...data, ...patch } });

  const now = new Date();
  const curQ = qKey(now), nxtQ = nextQ(curQ);
  const togglePaid = (lic, key) => {
    const paid = new Set(lic.paidQuarters || []);
    if (paid.has(key)) paid.delete(key); else paid.add(key);
    save({ list: list.map(l => (l.id === lic.id ? { ...l, paidQuarters: [...paid] } : l)) });
  };
  const saveLicense = () => {
    if (!form.number.trim() || !form.place.trim()) { alert('Вкажіть номер ліцензії та адресу місця торгівлі'); return; }
    const item = { ...form, id: form.id || `${Date.now()}`, paidQuarters: form.paidQuarters || [] };
    save({ list: form.id ? list.map(l => (l.id === form.id ? item : l)) : [...list, item] });
    setForm(null);
  };

  // Акциз за місяць: чеки з підакцизними товарами мінус повернення, плюс продажі поза програмою
  const excise = useMemo(() => {
    let sold = 0, returned = 0;
    for (const t of transactions) {
      if (!(+t.exciseBase > 0) || !String(t.date).startsWith(period)) continue;
      if (t.type === 'refund_out') returned += +t.exciseBase; else if (t.type === 'income') sold += +t.exciseBase;
    }
    const manual = +(data.exciseManual || {})[period] || 0;
    const base = r2(sold - returned + manual);
    return { sold: r2(sold), returned: r2(returned), manual, base, tax: retailExcise(Math.max(0, base)) };
  }, [transactions, period, data.exciseManual]);
  // Розбивка за видами для додатка 5: вино і пиво вводяться, решта — лікеро-горілчана продукція
  const split = (data.exciseSplit || {})[period] || {};
  const grossByKind = {
    wine: Math.min(+split.wine || 0, Math.max(0, excise.base)),
    beer: Math.min(+split.beer || 0, Math.max(0, excise.base - (+split.wine || 0))),
  };
  grossByKind.spirits = r2(Math.max(0, excise.base) - grossByKind.wine - grossByKind.beer);
  const setSplit = (k, v) => save({ exciseSplit: { ...(data.exciseSplit || {}), [period]: { ...split, [k]: v } } });
  const downloadXmlPackage = async () => {
    if (!activeFop?.katottg && !window.confirm('У профілі ФОП не вказано код КАТОТТГ — у декларації код території буде порожній. Продовжити?')) return;
    const pkg = buildExcisePackage({ fop: activeFop, period, gross: grossByKind });
    const zip = new JSZip();
    pkg.files.forEach(f => zip.file(f.name, encode1251(f.xml)));
    const url = URL.createObjectURL(await zip.generateAsync({ type: 'blob' }));
    const a = document.createElement('a'); a.href = url; a.download = `Декларація_акцизу_${period}.zip`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };
  const [py, pm] = period.split('-').map(Number);
  const declDue = shiftWeekend(new Date(py, pm, 20));
  const payDue = new Date(declDue); payDue.setDate(payDue.getDate() + 10);
  const hasAlcohol = list.some(l => l.kind === 'alcohol' || l.kind === 'cider');

  const printSheet = () => openPrintWindow(`<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8"><title>Акциз ${period}</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;margin:30px}h2{font-size:14px;text-align:center}
table{width:100%;border-collapse:collapse;margin:10px 0}td{border:1px solid #333;padding:5px 8px}td.r{text-align:right}</style></head><body>
<h2>РОЗРАХУНОК РОЗДРІБНОГО АКЦИЗНОГО ПОДАТКУ</h2>
<p style="text-align:center">за ${String(pm).padStart(2, '0')}.${py} · ФОП ${activeFop?.fullName || ''} · РНОКПП ${activeFop?.rnokpp || ''}</p>
<table>
<tr><td>Реалізовано підакцизних товарів у роздріб (з ПДВ та акцизом), грн</td><td class="r">${fmtMoney(excise.sold + excise.manual)}</td></tr>
<tr><td>Повернення покупцям, грн</td><td class="r">${fmtMoney(excise.returned)}</td></tr>
<tr><td>Вартість реалізації до оподаткування, грн</td><td class="r">${fmtMoney(excise.base)}</td></tr>
<tr><td><b>Акцизний податок 5 % (вартість × 5 / 105), грн</b></td><td class="r"><b>${fmtMoney(excise.tax)}</b></td></tr>
</table>
<p style="font-size:10.5px">Робочий розрахунок для декларації акцизного податку. Декларація — до ${declDue.toLocaleDateString('uk-UA')},
сплата — до ${payDue.toLocaleDateString('uk-UA')}, до місцевого бюджету за місцем торгівлі.</p></body></html>`, { fop: activeFop });

  return (
    <div>
      <div className="view-toolbar">
        <h2 className="view-title">Ліцензії та акциз</h2>
        <div className="toolbar-actions">
          <button className="btn btn--primary" onClick={() => setForm({ ...EMPTY })}>+ Ліцензія</button>
        </div>
      </div>

      {form && (
        <div className="inline-form">
          <div className="inline-form-header"><span>{form.id ? 'Ліцензія' : 'Нова ліцензія'}</span>
            <button className="btn-close" onClick={() => setForm(null)}>✕</button></div>
          <div className="form-row-4">
            <div className="field" style={{ gridColumn: 'span 2' }}><label>Вид</label>
              <select value={form.kind} onChange={e => setForm(p => ({ ...p, kind: e.target.value }))}>
                {LICENSE_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}</select></div>
            <div className="field"><label>Номер ліцензії</label>
              <input value={form.number} onChange={e => setForm(p => ({ ...p, number: e.target.value }))} /></div>
            <div className="field"><label>Дата видачі</label>
              <input type="date" value={form.issueDate} onChange={e => setForm(p => ({ ...p, issueDate: e.target.value }))} /></div>
          </div>
          <div className="form-row-4">
            <div className="field" style={{ gridColumn: 'span 2' }}><label>Адреса місця торгівлі</label>
              <input value={form.place} onChange={e => setForm(p => ({ ...p, place: e.target.value }))} /></div>
            <div className="field"><label>Фіскальний номер РРО / ПРРО</label>
              <input value={form.rro} onChange={e => setForm(p => ({ ...p, rro: e.target.value }))} /></div>
            <div className="field"><label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={!!form.village} onChange={e => setForm(p => ({ ...p, village: e.target.checked }))} />
              Село / селище (знижена ставка)</label></div>
          </div>
          <p className="cell-muted" style={{ fontSize: '.82rem' }}>
            Плата за квартал: <b>{fmtMoney(licenseQuarterFee(form, now.getFullYear()))} грн</b> {LICENSE_KINDS.find(k => k.id === form.kind)?.per}.
            Умови зниженої ставки для сіл і селищ перевірте в Законі № 3817-IX.
          </p>
          <div className="form-actions">
            <button className="btn btn--primary" onClick={saveLicense}>Зберегти</button>
            <button className="btn btn--ghost" onClick={() => setForm(null)}>Скасувати</button>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Вид</th><th>Номер</th><th>Місце торгівлі</th><th>РРО / ПРРО</th>
            <th style={{ textAlign: 'right' }}>Плата за квартал</th><th>{qLabel(curQ)}</th><th>{qLabel(nxtQ)}</th><th></th></tr></thead>
          <tbody>
            {list.length === 0 ? <tr><td colSpan={8} className="table-empty">Ліцензій немає</td></tr> : list.map(l => {
              const paid = l.paidQuarters || [];
              const cell = (key, fee) => (
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: paid.includes(key) ? 'var(--success)' : (qStart(key) <= now ? 'var(--danger)' : 'var(--warning)') }}>
                  <input type="checkbox" checked={paid.includes(key)} onChange={() => togglePaid(l, key)} />
                  {paid.includes(key) ? 'сплачено' : `${fmtMoney(fee)}${taxYear(+key.slice(0, 4)).draft ? ' (за проєктом бюджету)' : ''} до ${new Date(qStart(key).getTime() - 86400000).toLocaleDateString('uk-UA')}`}
                </label>);
              return (
                <tr key={l.id}>
                  <td>{LICENSE_KINDS.find(k => k.id === l.kind)?.label}{l.village ? ' · село' : ''}</td>
                  <td>{l.number}{l.issueDate ? <span className="cell-muted"> від {l.issueDate.split('-').reverse().join('.')}</span> : ''}</td>
                  <td>{l.place}</td><td>{l.rro}</td>
                  <td style={{ textAlign: 'right' }}>{fmtMoney(licenseQuarterFee(l, now.getFullYear()))}</td>
                  <td>{cell(curQ, licenseQuarterFee(l, +curQ.slice(0, 4)))}</td>
                  <td>{cell(nxtQ, licenseQuarterFee(l, +nxtQ.slice(0, 4)))}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn-icon" title="Редагувати" onClick={() => setForm({ ...EMPTY, ...l })}>✎</button>
                    <button className="btn-icon btn-icon--del" title="Видалити"
                      onClick={() => window.confirm(`Видалити ліцензію № ${l.number}?`) && save({ list: list.filter(x => x.id !== l.id) })}>✕</button>
                  </td>
                </tr>);
            })}
          </tbody>
        </table>
      </div>
      <p className="cell-muted" style={{ fontSize: '.82rem', marginTop: 8 }}>
        Ліцензії безстрокові; черговий платіж вноситься до початку кварталу, після сплати до органу ліцензування подається заява
        із сумою і реквізитами платежу. Позначка «сплачено» — для власного контролю, банківську операцію внесіть у «Банк / Каса».
      </p>

      <div className="settings-section" style={{ marginTop: 20 }}>
        <h3>Роздрібний акциз 5 % (алкогольні напої)</h3>
        {!hasAlcohol && <p className="cell-muted">Ліцензії на алкоголь немає — роздрібний акциз не нараховується. Тютюнові вироби і пальне в роздробі цим податком не обкладаються.</p>}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field"><label>Місяць</label>
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ width: 160 }} /></div>
          <div className="field"><label>Продажі поза програмою (з ПДВ і акцизом), грн</label>
            <input type="number" min="0" step="0.01" value={(data.exciseManual || {})[period] ?? ''} placeholder="0" style={{ width: 220 }}
              onChange={e => save({ exciseManual: { ...(data.exciseManual || {}), [period]: e.target.value } })} /></div>
          <div className="field"><label>з них виноробна продукція, грн</label>
            <input type="number" min="0" step="0.01" value={split.wine ?? ''} placeholder="0" style={{ width: 150 }} onChange={e => setSplit('wine', e.target.value)} /></div>
          <div className="field"><label>з них пиво, грн</label>
            <input type="number" min="0" step="0.01" value={split.beer ?? ''} placeholder="0" style={{ width: 150 }} onChange={e => setSplit('beer', e.target.value)} /></div>
          <button className="btn btn--ghost" onClick={printSheet}>🖨 Друк розрахунку</button>
          <button className="btn btn--primary" disabled={!(excise.base > 0)} onClick={downloadXmlPackage}>⇩ XML декларації (zip)</button>
        </div>
        <table className="data-table" style={{ marginTop: 10, maxWidth: 640 }}>
          <tbody>
            <tr><td>Чеки ПРРО з підакцизними товарами</td><td style={{ textAlign: 'right' }}>{fmtMoney(excise.sold)}</td></tr>
            <tr><td>Повернення</td><td style={{ textAlign: 'right' }}>− {fmtMoney(excise.returned)}</td></tr>
            <tr><td>Продажі поза програмою</td><td style={{ textAlign: 'right' }}>{fmtMoney(excise.manual)}</td></tr>
            <tr style={{ fontWeight: 700 }}><td>Акциз до сплати (вартість × 5 / 105)</td><td style={{ textAlign: 'right' }}>{fmtMoney(excise.tax)}</td></tr>
          </tbody>
        </table>
        <p className="cell-muted" style={{ fontSize: '.82rem', marginTop: 8 }}>
          Декларація акцизного податку за {period} — до {declDue.toLocaleDateString('uk-UA')}, сплата — до {payDue.toLocaleDateString('uk-UA')}.
          XML — декларація F0209514 з додатком 5 для одного коду території (КАТОТТГ з профілю ФОП). У додатку вартість ділиться на лікеро-горілчану продукцію, вино і пиво: вкажіть частки вина й пива, решта піде як лікеро-горілчана.
        </p>
      </div>
    </div>
  );
};

export default ExciseView;
