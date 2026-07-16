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

// ─── Generic CRUD (fire-and-forget з логом помилок) ──────────
export const dbInsert = (table, row) => {
  supabase.from(table).insert(toRow(row)).then(({ error }) => {
    if (error) {
      console.error(`[db] insert ${table}:`, error.message, row);
      // Критично: збереження не відбулося — повідомляємо, інакше дані
      // живуть лише до перезавантаження і «зникають» непомітно.
      alert(`Не збережено в базу (${table}): ${error.message}`);
    }
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
