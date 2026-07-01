// Парсинг банківських виписок.
// Підтримує Monobank, PrivatBank (всі формати), загальний CSV, MT940.
// Повертає масив: { date, counterparty, amount, type, description, edrpou? }

export const parseBankFile = async (file) => {
  const ext    = file.name.split('.').pop().toLowerCase();
  const buffer = await file.arrayBuffer();
  let text = '';
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { text = new TextDecoder('windows-1251').decode(buffer); }
  text = text.replace(/^\uFEFF/, '');
  if (['sta','mt940','swi'].includes(ext) || text.includes(':61:')) return parseMT940(text);
  return parseCsv(text);
};

// ─── Утиліти ────────────────────────────────────────────────────────
const splitLine = (line, d) => {
  const out=[]; let cur='', q=false;
  for (const ch of line) {
    if (ch==='"'){ q=!q; continue; }
    if (ch===d&&!q){ out.push(cur.trim()); cur=''; continue; }
    cur+=ch;
  }
  out.push(cur.trim());
  return out;
};

const toNum = (raw) => {
  if (!raw||raw==='-') return NaN;
  const s=String(raw).replace(/\s/g,'');
  if (s.includes(',')&&s.includes('.'))
    return s.lastIndexOf(',')>s.lastIndexOf('.')?parseFloat(s.replace(/\./g,'').replace(',','.')):parseFloat(s.replace(/,/g,''));
  return parseFloat(s.includes(',') ? s.replace(',','.') : s);
};

const normDate = (raw) => {
  if (!raw) return new Date().toISOString().slice(0,10);
  const s=String(raw);
  const m=s.match(/(\d{2})[.\-\/](\d{2})[.\-\/](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  return new Date().toISOString().slice(0,10);
};

const isDateLike = s => /\d{2}[.\-\/]\d{2}[.\-\/]\d{4}/.test(String(s||''));
const detDelim = l => ((l.match(/;/g)||[]).length >= (l.match(/,/g)||[]).length) ? ';' : ',';

// Знаходимо заголовок (пропускаємо метадані вгорі файлу)
const findHeader = (lines, d) => {
  for (let i=0; i<Math.min(lines.length,30); i++) {
    const h = splitLine(lines[i],d).map(c=>c.toLowerCase().replace(/"/g,'').trim());
    if (h.length>=3 && h.some(c=>c==='дата'||c.startsWith('дата ')||c.includes('дата і')||c.includes('дата о'))) return i;
  }
  return 0;
};

// Назви банків у полі "Найменування контрагента" — означає що це внутрішня операція
// або платіж через банк, і реальний контрагент — у призначенні
const BANK_RE = /^(ат\s+кб|ат\s+"кб|монобанк|ощадбанк|приватбанк|укрексімбанк|райффайзен|альфа.банк|банк)/i;
const isBankName = n => BANK_RE.test((n||'').trim());

// ─── Пошук потрібних колонок ─────────────────────────────────────────
// Шукаємо назву контрагента в пріоритеті:
// найменування > контрагент (не єдрпоу/рахунок) > одержувач/платник > призначення > деталі/опис
// НІКОЛИ не беремо 'назва банку', 'назва організ', 'мфо'
const findNameCol = (h) => {
  const checks = [
    c => c === 'контрагент',
    c => c === 'кореспондент',
    c => c.includes('найменування') && !c.includes('банку'),
    c => c.includes('контрагент') && !c.includes('єдрпоу') && !c.includes('іпн') && !c.includes('рахунок') && !c.includes('код'),
    c => c.includes('кореспондент') && !c.includes('єдрпоу') && !c.includes('іпн') && !c.includes('рахунок') && !c.includes('код'),
    c => c.includes('одержувач') || c.includes('платник'),
  ];
  for (const check of checks) {
    const i = h.findIndex(check);
    if (i >= 0) return i;
  }
  return -1;
};

const findPurposeCol = (h) => h.findIndex(c => c.includes('призначення'));

const findEdrpouCol = (h) => {
  // Спочатку шукаємо явно "ЄДРПОУ контрагента"/"ЄДРПОУ кореспондента" —
  // щоб не сплутати з власним ЄДРПОУ ФОП (перша колонка у виписці)
  const iCounterparty = h.findIndex(c =>
    (c.includes('єдрпоу')||c.includes('іпн')) && (c.includes('контрагент')||c.includes('кореспондент'))
  );
  if (iCounterparty >= 0) return iCounterparty;
  return h.findIndex(c => (c.includes('єдрпоу')||c.includes('іпн')) && !c.includes('банку'));
};

// Знаходимо колонки суми: можлива одна зі знаком АБО дві (дохід/видаток)
const findAmountCols = (h) => {
  // Одна колонка з підписом (позитив/негатив)
  const iSingle = h.findIndex(c =>
    (c==='сума'||c==='sum'||c==='amount'||c==='сума (uah)'||c==='сума, грн') ||
    (c.includes('сума') && !c.includes('надходжень') && !c.includes('видатків') && !c.includes('зарахування') && !c.includes('списання'))
  );

  // Дві колонки
  const iIn = h.findIndex(c =>
    c.includes('надходжен')||c.includes('зарахуван')||
    c==='кредит'||c==='credit'||c.includes('кредит(')
  );
  const iOut = h.findIndex(c =>
    c.includes('видатк')||c.includes('списан')||
    c==='дебет'||c==='debit'||c.includes('дебет(')
  );

  return { iSingle, iIn, iOut };
};

// Будуємо рядок результату з клітинок
// Рядок виглядає як номер картки або технічний ідентифікатор ПриватБанку:
// "5169 **** **** 6922 25.06.2026 20:41:22"
const looksLikeCardOrTech = (s) => {
  if (!s || s.length < 3) return true;
  if (/\d{1,2}:\d{2}:\d{2}/.test(s)) return true;  // містить час HH:MM:SS
  if (/^\d{4}[\s\W]/.test(s)) return true;           // починається з 4 цифр (картка/рахунок)
  return false;
};

// Шаблони «сміттєвих» призначень — номер картки, дата+час, внутрішні коди
const cleanPurpose = (p) => {
  if (!p) return '';
  if (looksLikeCardOrTech(p)) return '';
  return p.slice(0, 80);
};

const buildRow = ({ cells, iDate, iName, iPurpose, iEdrpou, amtCols }) => {
  const { iSingle, iIn, iOut } = amtCols;
  let amount=0, type='incoming';

  if (iSingle>=0) {
    const a = toNum(cells[iSingle]);
    if (!isNaN(a)&&a!==0) { amount=Math.abs(a); type=a<0?'outgoing':'incoming'; }
  } else {
    const inc = iIn >=0 ? toNum(cells[iIn])  : NaN;
    const out = iOut>=0 ? toNum(cells[iOut]) : NaN;
    if (!isNaN(inc)&&inc>0) { amount=inc; type='incoming'; }
    else if (!isNaN(out)&&out>0) { amount=out; type='outgoing'; }
  }
  if (amount===0) return null;
  if (!isDateLike(cells[iDate])) return null;

  const rawName   = iName    >=0 ? (cells[iName]   ||'').trim() : '';
  const purpose   = iPurpose >=0 ? (cells[iPurpose]||'').trim() : '';
  const edrpou    = iEdrpou  >=0 ? (cells[iEdrpou] ||'').trim() : '';

  // Пріоритет: «Назва контрагента» якщо не назва банку → «Призначення» (без технічних рядків)
  // «Назва контрагента» може містити номер картки — це все одно корисніше за «Банківська операція»
  const usablePurpose = cleanPurpose(purpose);

  let counterparty;
  if (rawName && !isBankName(rawName)) {
    counterparty = rawName;                       // є назва і не банк → беремо
  } else if (usablePurpose) {
    counterparty = usablePurpose;                 // призначення з корисним текстом
  } else if (rawName) {
    counterparty = rawName;                       // банк як крайній варіант
  } else {
    counterparty = 'Без назви';
  }

  return {
    date:         normDate(cells[iDate]),
    counterparty,
    amount,
    type,
    description:  purpose || (rawName ? `Контрагент: ${rawName}` : 'Виписка'),
    edrpou,
  };
};

// ─── Monobank ────────────────────────────────────────────────────────
// "Дата і час операції","Деталі операції","MCC","Сума у валюті картки (UAH)",...,"Коментар"
const isMono = h => h.some(c=>c==='mcc') && h.some(c=>c.includes('деталі'));

const parseMono = (rows, h) => {
  const iDate    = h.findIndex(c=>c.includes('дата'));
  const iDetails = h.findIndex(c=>c.includes('деталі'));
  const iAmount  = h.findIndex(c=>c.includes('сума')&&c.includes('uah'));
  const iComment = h.findIndex(c=>c==='коментар'||c.includes('коментар'));
  return rows.map(cells => {
    const amt = toNum(cells[iAmount]);
    if (isNaN(amt)||amt===0) return null;
    const details = cells[iDetails]||'';
    const comment = iComment>=0 ? (cells[iComment]||'') : '';
    return {
      date:         normDate(cells[iDate]),
      counterparty: (comment&&!isBankName(comment)) ? comment : (!isBankName(details) ? details : comment||details||'Monobank'),
      amount:       Math.abs(amt),
      type:         amt<0 ? 'outgoing' : 'incoming',
      description:  details||'Monobank виписка',
    };
  }).filter(Boolean);
};

// ─── PrivatBank Приват24 особистий ───────────────────────────────────
// "Дата","Час","Категорія","Картка","Опис","Сума (UAH)","Валюта",...
const isPrivat24 = h => h.some(c=>c==='категорія') && h.some(c=>c.includes('картка'));

const parsePrivat24 = (rows, h) => {
  const iDate   = h.findIndex(c=>c==='дата');
  const iDesc   = h.findIndex(c=>c==='опис'||c.includes('призначення'));
  const iAmount = h.findIndex(c=>c.includes('сума')&&c.includes('uah'));
  const iStatus = h.findIndex(c=>c==='статус'||c==='status');
  return rows.map(cells => {
    if (iStatus>=0 && cells[iStatus]?.toLowerCase().includes('відмов')) return null;
    const amt = toNum(cells[iAmount]);
    if (isNaN(amt)||amt===0) return null;
    return { date:normDate(cells[iDate]), counterparty:cells[iDesc]||'Приват24', amount:Math.abs(amt), type:amt<0?'outgoing':'incoming', description:'Приват24 виписка' };
  }).filter(Boolean);
};

// ─── Загальний PrivatBank / інші банки ──────────────────────────────
// Обробляємо всі інші CSV-формати одним універсальним парсером
const parseUniversal = (rows, h) => {
  const iDate    = h.findIndex(c=>c.includes('дата'));
  const iName    = findNameCol(h);
  const iPurpose = findPurposeCol(h);
  const iEdrpou  = findEdrpouCol(h);
  const amtCols  = findAmountCols(h);

  if (iDate===-1) throw new Error('Не знайдено колонку дати. Заголовок файлу: ' + h.join(' | '));
  if (amtCols.iSingle===-1 && amtCols.iIn===-1 && amtCols.iOut===-1)
    throw new Error('Не знайдено колонку суми. Заголовок: ' + h.join(' | '));

  return rows.map(cells => buildRow({ cells, iDate, iName, iPurpose, iEdrpou, amtCols })).filter(Boolean);
};

// ─── Головний CSV-парсер ─────────────────────────────────────────────
const parseCsv = (text) => {
  const lines = text.split(/\r?\n/).filter(l=>l.trim());
  if (lines.length<2) throw new Error('Файл порожній або не схожий на виписку');
  const d    = detDelim(lines[0]);
  const hIdx = findHeader(lines, d);
  const h    = splitLine(lines[hIdx], d).map(c=>c.toLowerCase().replace(/"/g,'').trim());
  const data = lines.slice(hIdx+1).map(l=>splitLine(l,d));

  let rows;
  if      (isMono(h))    rows = parseMono(data, h);
  else if (isPrivat24(h))rows = parsePrivat24(data, h);
  else                   rows = parseUniversal(data, h);

  if (!rows.length) throw new Error('У виписці не знайдено жодної операції.\nЗаголовок: ' + h.join(' | '));
  return rows;
};

// ─── MT940 ─────────────────────────────────────────────────────────
const parseMT940 = (text) => {
  const rows=[]; let pending=null;
  for (const line of text.split(/\r?\n/)) {
    const m61=line.match(/^:61:(\d{6})(\d{4})?([CD])([A-Z]?)(\d+(?:[.,]\d+)?)/);
    if (m61) {
      const [,yymmdd,,sign,,amtRaw]=m61;
      pending={ date:`20${yymmdd.slice(0,2)}-${yymmdd.slice(2,4)}-${yymmdd.slice(4,6)}`, amount:Math.abs(toNum(amtRaw)), type:sign==='C'?'incoming':'outgoing', counterparty:'MT940', description:'' };
      rows.push(pending);
    }
    const m86=line.match(/^:86:(.*)/);
    if (m86&&pending){ pending.description=m86[1].trim(); pending.counterparty=m86[1].trim().slice(0,60)||'MT940'; }
  }
  if (!rows.length) throw new Error('Не вдалося розпізнати жодного руху в MT940-файлі');
  return rows;
};
