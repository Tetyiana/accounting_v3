import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const STATUSES = [
  ['new', 'Новий'], ['in_progress', 'В роботі'], ['answered', 'Є відповідь'], ['fixed', 'Виправлено'], ['closed', 'Закрито'],
];
const ST_LABEL = Object.fromEntries(STATUSES);
const stBadge = (s) => s === 'fixed' || s === 'closed' ? 'badge--success' : s === 'new' ? 'badge--danger' : 'badge--warning';
const PAGES = ['Головна', 'Журнал операцій', 'Продажі/Закупівлі', 'Дебітори/Кредитори', 'Реєстр документів', 'Довідники',
  'Склад', 'Зарплата', 'Книга доходів', 'Бухгалтерія', 'Звітність ДПС', 'Звіти', 'ПДВ', 'РРО/Каса', 'Тарифи', 'Інше'];

const SupportView = () => {
  const [tickets, setTickets] = useState([]);
  const [msgs, setMsgs] = useState({});
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState({ title: '', description: '', page: '' });
  const [reply, setReply] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: t, error } = await supabase.from('support_tickets').select('*').order('created_at', { ascending: false });
    if (error) { setLoading(false); alert('Помилка завантаження: ' + error.message + '\nПеревірте, що виконана migration_003.sql'); return; }
    setTickets(t || []);
    const { data: m } = await supabase.from('support_messages').select('*').order('created_at');
    const byT = {};
    for (const x of m || []) (byT[x.ticket_id] = byT[x.ticket_id] || []).push(x);
    setMsgs(byT);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.title.trim()) { alert('Опишіть проблему хоча б у темі'); return; }
    const { error } = await supabase.from('support_tickets').insert({
      title: form.title.trim(), description: form.description || null, page: form.page || null,
    });
    if (error) { alert(error.message); return; }
    setForm({ title: '', description: '', page: '' });
    load();
  };

  const send = async (tid) => {
    if (!reply.trim()) return;
    const { error } = await supabase.from('support_messages').insert({ ticket_id: tid, author: 'user', body: reply.trim() });
    if (error) { alert(error.message); return; }
    setReply('');
    load();
  };

  const setStatus = async (tid, status) => {
    await supabase.from('support_tickets').update({ status }).eq('id', tid);
    load();
  };

  const askAi = async (tid) => {
    setAiBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('support-ai', { body: { ticket_id: tid } });
      if (error || !data?.ok) alert(data?.error || error?.message || 'AI-асистент недоступний. Перевірте, що функція support-ai задеплоєна і секрет ANTHROPIC_API_KEY заданий.');
      load();
    } finally { setAiBusy(false); }
  };

  const copyRegistry = async () => {
    const openTickets = tickets.filter(t => t.status !== 'closed' && t.status !== 'fixed');
    const text = openTickets.map((t, i) =>
      `${i + 1}. [${ST_LABEL[t.status] || t.status}] ${t.page ? `(${t.page}) ` : ''}${t.title}` +
      (t.description ? `\n   ${t.description}` : '') +
      (msgs[t.id]?.length ? '\n' + msgs[t.id].map(m => `   ${m.author === 'user' ? '→' : '←'} ${m.body}`).join('\n') : '')
    ).join('\n');
    try {
      await navigator.clipboard.writeText(text || 'Відкритих звернень немає');
      alert('Реєстр відкритих звернень скопійовано — надішліть його розробнику');
    } catch {
      alert('Не вдалося скопіювати. Текст:\n\n' + text);
    }
  };

  if (loading) return <div className="view-placeholder">Завантаження…</div>;

  return (
    <div className="view-support">
      <div className="view-toolbar">
        <h2 className="view-title">Технічна підтримка</h2>
        <button className="btn btn--ghost btn--sm" onClick={copyRegistry}>Скопіювати реєстр (надіслати розробнику)</button>
      </div>

      <div className="table-wrap" style={{ padding: '14px 18px', marginBottom: 14 }}>
        <h3 style={{ margin: '0 0 10px' }}>Повідомити про проблему</h3>
        <div className="form-row-3">
          <div className="field">
            <label>Тема (коротко, що не так)</label>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="field">
            <label>Розділ</label>
            <select value={form.page} onChange={e => setForm({ ...form, page: e.target.value })}>
              <option value="">—</option>
              {PAGES.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label>Деталі (що робили, що очікували, що сталося)</label>
          <textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        </div>
        <div style={{ marginTop: 10 }}>
          <button className="btn btn--primary" onClick={create}>Надіслати</button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>Дата</th><th>Розділ</th><th>Звернення</th><th>Статус</th></tr>
          </thead>
          <tbody>
            {tickets.length === 0 && (
              <tr><td colSpan={4} className="cell-muted">Звернень поки немає.</td></tr>
            )}
            {tickets.map(t => (
              <tr key={t.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{t.created_at.slice(0, 10)}</td>
                <td>{t.page || '—'}</td>
                <td>
                  <a style={{ cursor: 'pointer' }} onClick={() => setOpen(open === t.id ? null : t.id)}>{t.title}</a>
                  {open === t.id && (
                    <div style={{ marginTop: 8 }}>
                      {t.description && <p style={{ whiteSpace: 'pre-wrap', margin: '0 0 6px' }}>{t.description}</p>}
                      {(msgs[t.id] || []).map(m => (
                        <p key={m.id} style={{ whiteSpace: 'pre-wrap', borderLeft: '3px solid var(--mint-500, #4a9)', paddingLeft: 8, margin: '6px 0' }}>
                          <b>{m.author === 'user' ? 'Ви' : m.author === 'assistant' ? 'AI-асистент' : 'Підтримка'}:</b> {m.body}
                        </p>
                      ))}
                      <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                        <input style={{ flex: 1, minWidth: 180 }} placeholder="Відповідь / уточнення"
                               value={reply} onChange={e => setReply(e.target.value)} />
                        <button className="btn btn--primary btn--sm" onClick={() => send(t.id)}>Надіслати</button>
                        <button className="btn btn--ghost btn--sm" disabled={aiBusy} onClick={() => askAi(t.id)}>
                          {aiBusy ? 'AI думає…' : 'Запитати AI'}
                        </button>
                      </div>
                    </div>
                  )}
                </td>
                <td>
                  <select className={`badge ${stBadge(t.status)}`} value={t.status}
                          onChange={e => setStatus(t.id, e.target.value)}>
                    {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SupportView;
