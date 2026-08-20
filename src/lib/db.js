// Шар роботи з Supabase: конвертери camelCase↔snake_case, generic CRUD.
// Views працюють у camelCase — конвертація прозора на межі з базою.
import { supabase } from './supabase';

// Спец-кейси для абревіатур, які прямолінійна конвертація ламає
// (useRRO → use_r_r_o замість use_rro)
const SPECIAL       = { useRRO: 'use_rro' };
const SPECIAL_BACK  = { use_rro: 'useRRO' };

const snake = k => SPECIAL[k] || k.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
const camel = k => SPECIAL_BACK[k] || k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

// '' → null для дат (Postgres date не приймає порожній рядок)
const isDateKey = k => k === 'date' || k.endsWith('_date') || k.endsWith('Date');

export const toRow = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined) continue;
    out[snake(k)] = (isDateKey(k) && v === '') ? null : v;
  }
  return out;
};

export const fromRow = (row) => {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    out[camel(k)] = (isDateKey(k) && v === null) ? '' : v;
  }
  return out;
};

export const newId = () => crypto.randomUUID();

// ─── Черга незбережених записів (переживає перезавантаження) ──
const Q_KEY = 'db_pending_v1';
const qRead  = () => { try { return JSON.parse(localStorage.getItem(Q_KEY) || '[]'); } catch { return []; } };
const qWrite = (q) => localStorage.setItem(Q_KEY, JSON.stringify(q));
const qPush  = (table, row) => { const q = qRead(); q.push({ table, row, ts: Date.now() }); qWrite(q); };

export const pendingCount = () => qRead().length;

// Дописує все, що не долетіло. Виклик: при старті і при відновленні зв'язку.
export const flushPending = async () => {
  const q = qRead();
  if (!q.length) return 0;
  const left = [];
  for (const item of q) {
    try {
      const { error } = await supabase.from(item.table).insert(toRow(item.row));
      // 23505 = дублікат PK: запис уже в базі, з черги прибираємо
            // 23505 — дублікат PK (запис уже в базі). PGRST* — помилка схеми/запиту:
      // повтор не допоможе, тримати в черзі вічно немає сенсу.
      const hopeless = !error || error.code === '23505' || String(error.code || '').startsWith('PGRST');
      if (error && hopeless) console.error(`[db] запис відкинуто з черги (${item.table}):`, error.message, item.row);
      if (!hopeless) left.push(item);
    } catch { left.push(item); }
  }
  qWrite(left);
  return q.length - left.length;
};

// ─── Generic CRUD ────────────────────────────────────────────
export const dbInsert = (table, row) => {
  supabase.from(table).insert(toRow(row))
    .then(({ error }) => {
      if (error) {
        console.error(`[db] insert ${table}:`, error.message, row);
        qPush(table, row);
      }
    })
    .catch((e) => {
      // База недоступна — fetch кидає виняток, .then сюди не доходить.
      // Саме через відсутність цього catch дані зникали мовчки.
      console.error(`[db] insert ${table} (network):`, e?.message, row);
      qPush(table, row);
    });
};

export const dbUpdate = (table, id, patch) => {
  supabase.from(table).update(toRow(patch)).eq('id', id).then(({ error }) => {
    if (error) console.error(`[db] update ${table}:`, error.message);
  });
};

export const dbDelete = (table, id) => {
  supabase.from(table).delete().eq('id', id).then(({ error }) => {
    if (error) console.error(`[db] delete ${table}:`, error.message);
  });
};

export const dbSelect = async (table, filters = {}) => {
  let q = supabase.from(table).select('*');
  for (const [k, v] of Object.entries(filters)) q = q.eq(snake(k), v);
  const { data, error } = await q.order('created_at', { ascending: true });
  if (error) { console.error(`[db] select ${table}:`, error.message); return []; }
  return (data || []).map(fromRow);
};
