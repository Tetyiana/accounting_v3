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

// ─── Розрахунок коригування до ПН (РК) F1201213 ──────────────────
const FORM_RK = { cDoc: 'F12', cDocSub: '012', cDocVer: 13, schema: 'F1201213.xsd' };

export const buildRkXml = ({ fop, rk }) => {
  // rk: { date, number, counterparty, counterpartyTin, base, rate, description,
  //      correctedNumber, correctedDate, correctionReason }
  const d = rk.date || '';
  const h = {
    tin: fop?.rnokpp || '', ...regRaj(fop),
    ...FORM_RK,
    periodMonth: +d.slice(5, 7) || 1, periodType: 1, periodYear: +d.slice(0, 4) || new Date().getFullYear(),
    dFill: today(),
  };
  const rate = +rk.rate || 20;
  const base = +rk.base || 0;
  const vat = Math.round(base * rate) / 100;
  const dFillRk = d ? pad(+d.slice(8, 10), 2) + pad(+d.slice(5, 7), 2) + d.slice(0, 4) : today();
  const dCorr = (rk.correctedDate || '').replace(/-/g, '');
  const dCorrFmt = dCorr.length === 8 ? dCorr.slice(6, 8) + dCorr.slice(4, 6) + dCorr.slice(0, 4) : '';
  const rateCode = rate === 20 ? 20 : rate === 14 ? 14 : rate === 7 ? 7 : 0;
  const sign = base < 0 ? -1 : 1;
  const body = `<HFILL>${dFillRk}</HFILL>
<HNUM>${esc(rk.number || '')}</HNUM>
<HNAMESEL>${esc('ФОП ' + (fop?.fullName || ''))}</HNAMESEL>
<HKSEL>${esc(fop?.vatCertificate || fop?.rnokpp || '')}</HKSEL>
<HTINSEL>${esc(fop?.rnokpp || '')}</HTINSEL>
<HNAMEBUY>${esc(rk.counterparty || '')}</HNAMEBUY>
<HKBUY>${esc(rk.counterpartyTin || '')}</HKBUY>
<HNUMPN>${esc(rk.correctedNumber || '')}</HNUMPN>
<HFILLPN>${dCorrFmt}</HFILLPN>
<HREASON>${esc(rk.correctionReason || '')}</HREASON>
<R01G7>${num(base)}</R01G7>
<R01G109>${num(rate === 20 ? vat : 0)}</R01G109>
<R01G110>${num(rate === 14 ? vat : 0)}</R01G110>
<R01G111>${num(rate === 7 ? vat : 0)}</R01G111>
<R03G7>${num(base + vat)}</R03G7>
<TAB>
<ROW ROWNUM="1">
<RXXXXG2S>${esc(rk.correctionReason || 'Коригування')}</RXXXXG2S>
<RXXXXG4S>${esc(rk.description || 'Товари/послуги')}</RXXXXG4S>
<RXXXXG5>послуга</RXXXXG5>
<RXXXXG6>1</RXXXXG6>
<RXXXXG7>${sign}</RXXXXG7>
<RXXXXG8>${num(Math.abs(base))}</RXXXXG8>
<RXXXXG9>${rateCode}</RXXXXG9>
<RXXXXG11>${num(base)}</RXXXXG11>
<RXXXXG12>${num(vat)}</RXXXXG12>
</ROW>
</TAB>
<HBOS>${esc(fop?.fullName || '')}</HBOS>`;
  return { xml: wrap(h, FORM_RK.schema, body), name: fileName(h) };
};

// ─── Об'єднана звітність (4ДФ + Д1 ЄСВ) F0500108 ──────────────────
// Податковий розрахунок сум доходу, нарахованого на користь платників, і сум
// утриманого з них податку. Квартальна форма роботодавця (ФОП з найманими).
// УВАГА: реальна форма містить ~40 полів на працівника — цей експорт дає
// заповнення основного пакету; додаткові розділи (Д2, Д3, Д4, Д5, Д6)
// заповнюються за наявності специфічних операцій.
const FORM_1DF = { cDoc: 'F05', cDocSub: '001', cDocVer: 8, schema: 'F0500108.xsd' };

export const buildUnifiedReportXml = ({ fop, year, quarter, employees, records }) => {
  // employees: [{ id, fullName, rnokpp }]
  // records: [{ employeeId, period: 'YYYY-MM', gross, pdfo, vz, esv, esvBase }]
  const h = {
    tin: fop?.rnokpp || '', ...regRaj(fop),
    ...FORM_1DF,
    periodMonth: quarter * 3, periodType: 2, periodYear: year, dFill: today(),
  };
  const qMonths = [quarter * 3 - 2, quarter * 3 - 1, quarter * 3].map(m => pad(m, 2));
  const inQuarter = records.filter(r =>
    r.period && r.period.startsWith(String(year)) && qMonths.includes(r.period.slice(5, 7)));

  // Групування по працівнику (4ДФ)
  const byEmp = new Map();
  for (const r of inQuarter) {
    const key = r.employeeId;
    if (!byEmp.has(key)) byEmp.set(key, { gross: 0, pdfo: 0, vz: 0, esv: 0, esvBase: 0 });
    const a = byEmp.get(key);
    a.gross += +r.gross || 0; a.pdfo += +r.pdfo || 0;
    a.vz    += +r.vz    || 0; a.esv  += +r.esv  || 0;
    a.esvBase += +r.esvBase || 0;
  }

  const totals = { gross: 0, pdfo: 0, vz: 0, esv: 0, esvBase: 0 };
  const rows4df = [];
  let n = 0;
  for (const [empId, a] of byEmp) {
    const emp = employees.find(e => e.id === empId);
    if (!emp) continue;
    n++;
    totals.gross += a.gross; totals.pdfo += a.pdfo;
    totals.vz    += a.vz;    totals.esv  += a.esv; totals.esvBase += a.esvBase;
    rows4df.push(`<ROW ROWNUM="${n}">
<T1RXXXXG2S>${esc(emp.rnokpp || '')}</T1RXXXXG2S>
<T1RXXXXG3>${num(a.gross)}</T1RXXXXG3>
<T1RXXXXG3A>${num(a.gross)}</T1RXXXXG3A>
<T1RXXXXG4>${num(a.pdfo)}</T1RXXXXG4>
<T1RXXXXG4A>${num(a.pdfo)}</T1RXXXXG4A>
<T1RXXXXG5>${num(a.vz)}</T1RXXXXG5>
<T1RXXXXG5A>${num(a.vz)}</T1RXXXXG5A>
<T1RXXXXG6>101</T1RXXXXG6>
</ROW>`);
  }

  // Д1: помісячно, ЄСВ по кожному працівнику × місяць
  const rowsD1 = [];
  let m = 0;
  for (const emp of employees) {
    for (const month of qMonths) {
      const period = `${year}-${month}`;
      const monthRecs = inQuarter.filter(r => r.employeeId === emp.id && r.period === period);
      if (monthRecs.length === 0) continue;
      const gross = monthRecs.reduce((s, r) => s + (+r.gross || 0), 0);
      const esvBase = monthRecs.reduce((s, r) => s + (+r.esvBase || 0), 0);
      const esv = monthRecs.reduce((s, r) => s + (+r.esv || 0), 0);
      m++;
      rowsD1.push(`<ROW ROWNUM="${m}">
<T3RXXXXG3S>${esc(emp.rnokpp || '')}</T3RXXXXG3S>
<T3RXXXXG4S>${esc(emp.fullName || '')}</T3RXXXXG4S>
<T3RXXXXG5>${+month}</T3RXXXXG5>
<T3RXXXXG7>1</T3RXXXXG7>
<T3RXXXXG8>${num(gross)}</T3RXXXXG8>
<T3RXXXXG9>${num(esvBase)}</T3RXXXXG9>
<T3RXXXXG10>22.00</T3RXXXXG10>
<T3RXXXXG11>${num(esv)}</T3RXXXXG11>
</ROW>`);
    }
  }

  const body = `<HZ>${quarter}</HZ>
<HZY>${year}</HZY>
<HNAME>${esc('ФОП ' + (fop?.fullName || ''))}</HNAME>
<HTIN>${esc(fop?.rnokpp || '')}</HTIN>
<HLOC>${esc(fop?.legalAddress || '')}</HLOC>
<HKSTI>${pad(h.cSti || 0, 4)}</HKSTI>
<HKEMP>${n}</HKEMP>
<T1RXXXXG3T>${num(totals.gross)}</T1RXXXXG3T>
<T1RXXXXG4T>${num(totals.pdfo)}</T1RXXXXG4T>
<T1RXXXXG5T>${num(totals.vz)}</T1RXXXXG5T>
<T1TAB>
${rows4df.join('\n')}
</T1TAB>
<T3TAB>
${rowsD1.join('\n')}
</T3TAB>
<HBOS>${esc(fop?.fullName || '')}</HBOS>
<HFILL>${today()}</HFILL>`;
  return { xml: wrap(h, FORM_1DF.schema, body), name: fileName(h) };
};
