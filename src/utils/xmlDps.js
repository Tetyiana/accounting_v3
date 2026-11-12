// Генерація XML-файлів для Електронного кабінету ДПС.
// Формат: DECLAR → DECLARHEAD + DECLARBODY, кодування windows-1251.
//
// УВАГА: коди форм (C_DOC_SUB / C_DOC_VER) періодично оновлюються ДПС.
// Якщо кабінет відхиляє файл через версію форми — поправити константи FORM_* нижче.

// ─── Кодування windows-1251 ───────────────────────────────────────
const CP1251_EXTRA = {
  'Ё': 0xA8, 'ё': 0xB8, 'Є': 0xAA, 'є': 0xBA, 'І': 0xB2, 'і': 0xB3,
  'Ї': 0xAF, 'ї': 0xBF, 'Ґ': 0xA5, 'ґ': 0xB4, '’': 0x92, '№': 0xB9,
  '«': 0xAB, '»': 0xBB, '–': 0x96, '—': 0x97,
};
const encode1251 = (str) => {
  const bytes = [];
  for (const ch of str) {
    const c = ch.codePointAt(0);
    if (c < 0x80) bytes.push(c);
    else if (c >= 0x410 && c <= 0x44F) bytes.push(c - 0x410 + 0xC0); // А-я
    else if (CP1251_EXTRA[ch] !== undefined) bytes.push(CP1251_EXTRA[ch]);
    else bytes.push(0x3F); // '?'
  }
  return new Uint8Array(bytes);
};

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const pad = (n, len) => String(n).padStart(len, '0');
const num = (v) => (Math.round((+v || 0) * 100) / 100).toFixed(2);

// ─── Завантаження файлу ───────────────────────────────────────────
export const downloadXml = (xmlString, fileName) => {
  const blob = new Blob([encode1251(xmlString)], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const today = () => {
  const d = new Date();
  return pad(d.getDate(), 2) + pad(d.getMonth() + 1, 2) + d.getFullYear();
};

// Коди ДПІ з адреси не витягнути — беремо з профілю ФОП, якщо задані, інакше 00.
const regRaj = (fop) => ({
  cReg: fop?.dpsRegion || fop?.dps_region || 0,
  cRaj: fop?.dpsDistrict || fop?.dps_district || 0,
  cSti: fop?.dpsCode || fop?.dps_code || 0,
});

// Декларація платника єдиного податку (F0103309, F0103407 з додатком 1) — у utils/epDeclXml.js.
// Податкова накладна і розрахунок коригування (F1201016, F1201216) — у utils/vatXml.js.
// Зарплатна звітність (Податковий розрахунок F0500111 з додатками, звіт про внесок
// F0500701, повідомлення про прийняття F3001005) — у utils/payrollXml.js.
export { encode1251, esc, pad, num, regRaj, today as todayDps };
