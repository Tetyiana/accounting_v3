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

// Стандартна назва файлу для кабінету:
// <C_REG(2)><C_RAJ(2)><TIN(10)><C_DOC(3)><C_DOC_SUB(3)><C_DOC_VER(2)><C_DOC_STAN(1)><C_DOC_TYPE(2)><C_DOC_CNT(7)><PERIOD_TYPE(1)><PERIOD_MONTH(2)><PERIOD_YEAR(4)>.XML
const fileName = (h) =>
  `${pad(h.cReg, 2)}${pad(h.cRaj, 2)}${pad(h.tin, 10)}${h.cDoc}${h.cDocSub}${pad(h.cDocVer, 2)}` +
  `1${pad(0, 2)}${pad(1, 7)}${h.periodType}${pad(h.periodMonth, 2)}${h.periodYear}.XML`;

const head = (h) => `<DECLARHEAD>
<TIN>${esc(h.tin)}</TIN>
<C_DOC>${h.cDoc}</C_DOC>
<C_DOC_SUB>${h.cDocSub}</C_DOC_SUB>
<C_DOC_VER>${h.cDocVer}</C_DOC_VER>
<C_DOC_TYPE>0</C_DOC_TYPE>
<C_DOC_CNT>1</C_DOC_CNT>
<C_REG>${pad(h.cReg, 2)}</C_REG>
<C_RAJ>${pad(h.cRaj, 2)}</C_RAJ>
<PERIOD_MONTH>${h.periodMonth}</PERIOD_MONTH>
<PERIOD_TYPE>${h.periodType}</PERIOD_TYPE>
<PERIOD_YEAR>${h.periodYear}</PERIOD_YEAR>
<C_STI_ORIG>${pad(h.cSti || 0, 4)}</C_STI_ORIG>
<C_DOC_STAN>1</C_DOC_STAN>
<LINKED_DOCS xsi:nil="true"></LINKED_DOCS>
<D_FILL>${h.dFill}</D_FILL>
<SOFTWARE>Oblik FOP</SOFTWARE>
</DECLARHEAD>`;

const wrap = (h, schema, body) =>
  `<?xml version="1.0" encoding="windows-1251"?>\n` +
  `<DECLAR xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="${schema}">\n` +
  head(h) + '\n<DECLARBODY>\n' + body + '\n</DECLARBODY>\n</DECLAR>';

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

// ─── Декларація платника ЄП, 3 група (квартальна) ────────────────
// Форма F0103309 (за потреби поправити версію).
const FORM_EP_G3 = { cDoc: 'F01', cDocSub: '033', cDocVer: 9, schema: 'F0103309.xsd' };

export const buildEpG3Xml = ({ fop, year, quarter, incomeCumulative, epCumulative, vzCumulative, epPrev, vzPrev, esvMonths }) => {
  const h = {
    tin: fop?.rnokpp || '', ...regRaj(fop),
    ...FORM_EP_G3,
    periodMonth: quarter * 3, periodType: 2, periodYear: year, dFill: today(),
  };
  const rate = fop && (fop.taxGroup === '3_3_vat') ? 3 : 5;
  const body = `<HZ>1</HZ>
<HZN>1</HZN>
<HNAME>${esc('ФОП ' + (fop?.fullName || ''))}</HNAME>
<HTIN>${esc(fop?.rnokpp || '')}</HTIN>
<HLOC>${esc(fop?.legalAddress || '')}</HLOC>
<HKVED xsi:nil="true"></HKVED>
<R001G1>${num(incomeCumulative)}</R001G1>
<R006G1>${num(incomeCumulative)}</R006G1>
<R008G1>${num(epCumulative)}</R008G1>
<R010G1>${num(epPrev)}</R010G1>
<R011G1>${num(epCumulative - epPrev)}</R011G1>
<R012G1>${num(vzCumulative)}</R012G1>
<R013G1>${num(vzPrev)}</R013G1>
<R014G1>${num(vzCumulative - vzPrev)}</R014G1>
<HFILL>${today()}</HFILL>
<HBOS>${esc(fop?.fullName || '')}</HBOS>
<HRATE>${rate}</HRATE>
<HESVMONTHS>${esvMonths || ''}</HESVMONTHS>`;
  return { xml: wrap(h, FORM_EP_G3.schema, body), name: fileName(h) };
};

// ─── Декларація платника ЄП, 1-2 групи (річна) ───────────────────
const FORM_EP_G12 = { cDoc: 'F01', cDocSub: '034', cDocVer: 6, schema: 'F0103406.xsd' };

export const buildEpG12Xml = ({ fop, year, incomeYear, epYear, vzYear }) => {
  const h = {
    tin: fop?.rnokpp || '', ...regRaj(fop),
    ...FORM_EP_G12,
    periodMonth: 12, periodType: 5, periodYear: year, dFill: today(),
  };
  const body = `<HZ>1</HZ>
<HZN>1</HZN>
<HNAME>${esc('ФОП ' + (fop?.fullName || ''))}</HNAME>
<HTIN>${esc(fop?.rnokpp || '')}</HTIN>
<HLOC>${esc(fop?.legalAddress || '')}</HLOC>
<R001G1>${num(incomeYear)}</R001G1>
<R008G1>${num(epYear)}</R008G1>
<R012G1>${num(vzYear)}</R012G1>
<HFILL>${today()}</HFILL>
<HBOS>${esc(fop?.fullName || '')}</HBOS>`;
  return { xml: wrap(h, FORM_EP_G12.schema, body), name: fileName(h) };
};

// ─── Податкова накладна (ПН) F1201013 ─────────────────────────────
const FORM_PN = { cDoc: 'F12', cDocSub: '010', cDocVer: 13, schema: 'F1201013.xsd' };

export const buildPnXml = ({ fop, pn }) => {
  // pn: { date: 'YYYY-MM-DD', number, counterparty, counterpartyTin, base, rate, description }
  const d = pn.date || '';
  const h = {
    tin: fop?.rnokpp || '', ...regRaj(fop),
    ...FORM_PN,
    periodMonth: +d.slice(5, 7) || 1, periodType: 1, periodYear: +d.slice(0, 4) || new Date().getFullYear(),
    dFill: today(),
  };
  const rate = +pn.rate || 20;
  const base = +pn.base || 0;
  const vat = Math.round(base * rate) / 100;
  const dFillPn = d ? pad(+d.slice(8, 10), 2) + pad(+d.slice(5, 7), 2) + d.slice(0, 4) : today();
  const rateCode = rate === 20 ? 20 : rate === 14 ? 14 : rate === 7 ? 7 : 0;
  const body = `<HFILL>${dFillPn}</HFILL>
<HNUM>${esc(pn.number || '')}</HNUM>
<HNAMESEL>${esc('ФОП ' + (fop?.fullName || ''))}</HNAMESEL>
<HKSEL>${esc(fop?.vatCertificate || fop?.rnokpp || '')}</HKSEL>
<HTINSEL>${esc(fop?.rnokpp || '')}</HTINSEL>
<HNAMEBUY>${esc(pn.counterparty || '')}</HNAMEBUY>
<HKBUY>${esc(pn.counterpartyTin || '')}</HKBUY>
<R01G7>${num(base)}</R01G7>
<R01G109>${num(rate === 20 ? vat : 0)}</R01G109>
<R01G110>${num(rate === 14 ? vat : 0)}</R01G110>
<R01G111>${num(rate === 7 ? vat : 0)}</R01G111>
<R03G7>${num(base + vat)}</R03G7>
<TAB>
<ROW ROWNUM="1">
<RXXXXG3S>${esc(pn.description || 'Товари/послуги')}</RXXXXG3S>
<RXXXXG4>послуга</RXXXXG4>
<RXXXXG5>1</RXXXXG5>
<RXXXXG6>1</RXXXXG6>
<RXXXXG7>${num(base)}</RXXXXG7>
<RXXXXG8>${rateCode}</RXXXXG8>
<RXXXXG10>${num(base)}</RXXXXG10>
<RXXXXG11>${num(vat)}</RXXXXG11>
</ROW>
</TAB>
<HBOS>${esc(fop?.fullName || '')}</HBOS>`;
  return { xml: wrap(h, FORM_PN.schema, body), name: fileName(h) };
};
