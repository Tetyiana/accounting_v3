import React, { useState, useMemo, useRef } from 'react';
import { useData } from '../context/DataContext';
import { calculateRunningBalance } from '../utils/accountingLogic';
import UploadOperation from '../components/Operations/UploadOperation';
import ReviewOperation from '../components/Operations/ReviewOperation';
import { parseFile } from '../utils/parser';
import { parseBankFile } from '../utils/fileHandlers';

const EMPTY = { date: new Date().toISOString().slice(0,10), counterparty: '', amount: '', description: '' };
const fmt = n => (+n || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2 });

const JournalView = () => {
  const { transactions, addTransaction, deleteTransaction, clients, addClient } = useData();
  const [showForm, setShowForm]   = useState(false);
  const [opType, setOpType]       = useState('income');
  const [form, setForm]           = useState(EMPTY);
  const [filter, setFilter]       = useState({ dateStart: '', dateEnd: '', counterparty: '' });
  const [err, setErr]             = useState('');
  const [isBankImport, setIsBankImport] = useState(false);

  const [uploadMode, setUploadMode] = useState(false);
  const [parsing, setParsing]       = useState(false);
  const [parseErr, setParseErr]     = useState('');
  const [reviewRows, setReviewRows] = useState(null);
  const [importInfo, setImportInfo] = useState('');

  const statementRef = useRef(null);
  const [statementErr, setStatementErr] = useState('');

  const set = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  const setF = e => setFilter(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const openForm = (type) => { setOpType(type); setForm(EMPTY); setErr(''); setShowForm(true); setUploadMode(false); setIsBankImport(false); };
  const openUpload = () => { setOpType('income'); setErr(''); setParseErr(''); setReviewRows(null); setShowForm(true); setUploadMode(true); setIsBankImport(false); };

  const handleSave = () => {
    if (!form.counterparty || !form.amount || !form.date) { setErr('Заповніть обов\'язкові поля'); return; }
    if (isNaN(+form.amount) || +form.amount <= 0) { setErr('Некоректна сума'); return; }
    addTransaction({ ...form, type: opType });
    setShowForm(false);
    setErr('');
  };

  const handleFileProcess = async (file) => {
    setParseErr('');
    setParsing(true);
    try {
      const rows = await parseFile(file);
      if (!rows || rows.length === 0) throw new Error('У файлі не знайдено жодного рядка з даними');
      setReviewRows(rows.map(r => ({ ...r, type: r.type || opType })));
      setIsBankImport(false);
    } catch (e) {
      setParseErr(e.message || 'Не вдалося розпізнати файл');
    } finally {
      setParsing(false);
    }
  };

  const handleReviewSave = (editedRows) => {
    // incoming/outgoing (банківська термінологія) → income/expense (внутрішня)
    editedRows.forEach(r => addTransaction({
      date:        r.date,
      counterparty:r.counterparty,
      amount:      r.amount,
      description: r.description || '',
      type:        (r.type === 'incoming' ? 'income' : r.type === 'outgoing' ? 'expense' : r.type) || opType,
    }));
    setShowForm(false);
    setReviewRows(null);
    setIsBankImport(false);
    setImportInfo('');
  };

  const handleStatementFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setStatementErr('');
    setImportInfo('');
    setParsing(true);
    try {
      const rawRows = await parseBankFile(file);

      // ─── Автоматичне зіставлення/створення контрагентів по ЄДРПОУ ─────
      const newCreated = [];
      const rows = rawRows.map(row => {
        if (!row.edrpou) return row;

        // Шукаємо в довіднику по ЄДРПОУ (поле ipn)
        const found = clients.find(c => c.ipn && c.ipn.replace(/\D/g,'') === row.edrpou.replace(/\D/g,''));
        if (found) {
          // Є в довіднику — підставляємо офіційну назву
          return { ...row, counterparty: found.name };
        }

        // Немає — спрощено створюємо (тільки якщо ще не запланували для цього ЄДРПОУ)
        const alreadyPlanned = newCreated.find(c => c.ipn === row.edrpou);
        if (!alreadyPlanned && row.counterparty && row.edrpou) {
          newCreated.push({ name: row.counterparty, ipn: row.edrpou });
        }
        return row;
      });

      // Створюємо нових контрагентів (без дублів)
      newCreated.forEach(c => addClient(c));

      setOpType('income');
      setShowForm(true);
      setUploadMode(true);
      setIsBankImport(true);
      setReviewRows(rows);
      if (newCreated.length > 0) {
        setImportInfo(`Автоматично додано ${newCreated.length} нових контрагентів у довідник: ${newCreated.map(c=>c.name).join(', ')}`);
      }
    } catch (err) {
      setStatementErr(err.message || 'Не вдалося розпізнати виписку');
    } finally {
      setParsing(false);
    }
  };

  const [selected, setSelected] = useState(new Set());

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      const okS = !filter.dateStart || t.date >= filter.dateStart;
      const okE = !filter.dateEnd   || t.date <= filter.dateEnd;
      const okC = !filter.counterparty || (t.counterparty||'').toLowerCase().includes(filter.counterparty.toLowerCase());
      return okS && okE && okC;
    });
  }, [transactions, filter]);

  const rows = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => (a.date||'').localeCompare(b.date||''));
    return calculateRunningBalance(sorted);
  }, [filtered]);

  const allIds = useMemo(() => new Set(rows.map(r => r.id)), [rows]);
  const allSelected = allIds.size > 0 && [...allIds].every(id => selected.has(id));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allIds));
  };

  const toggleOne = (id) => setSelected(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });

  const deleteSelected = () => {
    if (!selected.size) return;
    if (!window.confirm(`Перемістити ${selected.size} операцій у кошик?`)) return;
    [...selected].forEach(id => deleteTransaction(id));
    setSelected(new Set());
  };

  return (
    <div className="view-journal">
      <div className="view-toolbar">
        <h2 className="view-title">Журнал операцій (Банк / Каса)</h2>
        <div className="toolbar-actions">
          <button className="btn btn--success" onClick={() => openForm('income')}>+ Надходження</button>
          <button className="btn btn--danger"  onClick={() => openForm('expense')}>− Списання</button>
          <button className="btn btn--ghost"   onClick={openUpload}>⇪ Завантажити з файлу</button>
          <button className="btn btn--ghost"   onClick={() => statementRef.current?.click()}>⇪ Імпорт виписки (CSV/MT940)</button>
          <input
            ref={statementRef}
            type="file"
            accept=".csv,.sta,.mt940,.swi,.txt"
            style={{ display: 'none' }}
            onChange={handleStatementFile}
          />
        </div>
      </div>

      {statementErr && <div className="form-error" style={{marginBottom: 12}}>{statementErr}</div>}
      {parsing && !showForm && <p className="cell-muted">Обробляю виписку…</p>}

      {showForm && uploadMode && !reviewRows && (
        <div className="inline-form">
          <div className="inline-form-header">
            <span>Автоматичне прибуткування — PDF, фото, Excel або Word</span>
            <button className="btn-close" onClick={() => setShowForm(false)}>✕</button>
          </div>
          {parseErr && <div className="form-error">{parseErr}</div>}
          <UploadOperation onFileProcess={handleFileProcess} />
          {parsing && <p className="cell-muted" style={{marginTop:8}}>Розпізнаю файл…</p>}
        </div>
      )}

      {showForm && uploadMode && reviewRows && (
        <div className="inline-form">
          <div className="inline-form-header">
            <span>{isBankImport ? `Виписка — ${reviewRows.length} операцій` : `Перевірте розпізнані дані (${reviewRows.length})`}</span>
            <button className="btn-close" onClick={() => setShowForm(false)}>✕</button>
          </div>
          {importInfo && (
            <div className="settings-msg" style={{marginBottom:10}}>ℹ {importInfo}</div>
          )}
          <ReviewOperation rows={reviewRows} onSave={handleReviewSave} onCancel={() => setReviewRows(null)} isBankImport={isBankImport} />
        </div>
      )}

      {showForm && !uploadMode && (
        <div className="inline-form">
          <div className="inline-form-header">
            <span>{opType === 'income' ? 'Нове надходження' : 'Нове списання'}</span>
            <button className="btn-close" onClick={() => setShowForm(false)}>✕</button>
          </div>
          {err && <div className="form-error">{err}</div>}
          <div className="form-row-4">
            <div className="field">
              <label>Дата <span className="req">*</span></label>
              <input type="date" name="date" value={form.date} onChange={set} />
            </div>
            <div className="field">
              <label>Контрагент <span className="req">*</span></label>
              <input name="counterparty" value={form.counterparty} onChange={set} placeholder="Назва або ПІБ" />
            </div>
            <div className="field">
              <label>Сума, грн <span className="req">*</span></label>
              <input type="number" name="amount" value={form.amount} onChange={set} placeholder="0.00" min="0" step="0.01" />
            </div>
            <div className="field">
              <label>Примітка</label>
              <input name="description" value={form.description} onChange={set} placeholder="Опис операції" />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn--primary" onClick={handleSave}>Зберегти</button>
            <button className="btn btn--ghost"   onClick={() => setShowForm(false)}>Скасувати</button>
          </div>
        </div>
      )}

      <div className="filters-bar" style={{flexWrap:'wrap', gap:8}}>
        <input type="date" name="dateStart" value={filter.dateStart} onChange={setF} title="Дата з" />
        <input type="date" name="dateEnd"   value={filter.dateEnd}   onChange={setF} title="Дата по" />
        <input name="counterparty" value={filter.counterparty} onChange={setF} placeholder="Пошук по контрагенту" />
        {selected.size > 0 && (
          <button className="btn btn--danger btn--sm" onClick={deleteSelected}>
            Видалити вибрані ({selected.size})
          </button>
        )}
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{width:36}}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll}
                  title="Вибрати всі" style={{cursor:'pointer'}} />
              </th>
              <th>Дата</th>
              <th>Тип</th>
              <th>Контрагент</th>
              <th style={{textAlign:'right'}}>Сума, грн</th>
              <th>Примітка</th>
              <th style={{textAlign:'right'}}>Баланс, грн</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="table-empty">Операцій немає</td></tr>
            ) : rows.map(row => (
              <tr key={row.id} className={row.type==='income'?'row-income':'row-expense'}>
                <td>
                  <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleOne(row.id)}
                    style={{cursor:'pointer'}} />
                </td>
                <td>{row.date}</td>
                <td>
                  <span className={`badge badge--${row.type==='income'?'success':'danger'}`}>
                    {row.type==='income'?'Надходження':'Списання'}
                  </span>
                </td>
                <td>{row.counterparty||'—'}</td>
                <td style={{textAlign:'right',fontWeight:600}}>{fmt(row.amount)}</td>
                <td className="cell-muted">{row.description||'—'}</td>
                <td style={{textAlign:'right'}}>{fmt(row.balance)}</td>
                <td>
                  <button className="btn-icon btn-icon--del"
                    onClick={() => window.confirm('Перемістити в кошик?') && deleteTransaction(row.id)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default JournalView;
