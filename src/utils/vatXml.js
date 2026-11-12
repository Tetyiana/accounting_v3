// XML податкової накладної (F1201016) і розрахунку коригування (F1201216) для ЄРПН.
// Назви й порядок елементів — зі схем ДПС (архів xsd_all). Форма — наказ Мінфіну
// від 31.12.2015 № 1307. Таблична частина пишеться стовпцями.
import { esc, num, todayDps } from './xmlDps';
import { fileNameOf, wrapXml, baseHead, el, money, col, lines, dmy } from './payrollXml';
import { vatLines, vatTotals, specOf, isNonpayerPn, isSelfPn, rkRegistrar, IPN_SELF } from './vatLogic';

const FORM_PN = { cDoc: 'F12', cDocSub: '010', cDocVer: 16 };
const FORM_RK = { cDoc: 'F12', cDocSub: '012', cDocVer: 16 };

// Код ставки (графа 8): 20, 7, 14; 902 — ставка 0 % на митній території
export const rateCode = (rate) => (+rate === 0 ? 902 : +rate);
// Код одиниці за Класифікатором системи позначень одиниць вимірювання та обліку
const UNIT_CODES = { 'шт': '2009', 'кг': '0301', 'т': '0306', 'л': '0138', 'м': '0101', 'год': '0171', 'грн': '2454' };
const unitCode = (name) => UNIT_CODES[String(name || '').toLowerCase().replace(/\.$/, '')] || '';
// Код ознаки джерела податкового номера: 1 — ЄДРПОУ, 2 — РНОКПП
const tinKind = (tin) => (/^\d{8}$/.test(tin) ? 1 : /^\d{10}$/.test(tin) ? 2 : '');
const digits = (s) => String(s || '').replace(/\D/g, '');
const qty6 = (n) => String(Math.round((+n || 0) * 1e6) / 1e6);

const parties = (fop, v) => {
  const self = isSelfPn(v), nonpayer = isNonpayerPn(v);
  const sellerName = `ФОП ${fop?.fullName || ''}`.trim();
  const buyerTin = self || nonpayer ? '' : digits(v.counterpartyTin);
  return lines(
    `<HNAMESEL>${esc(sellerName)}</HNAMESEL>`,
    `<HNAMEBUY>${esc(self ? sellerName : (v.counterparty || ''))}</HNAMEBUY>`,
    `<HKSEL>${esc(fop?.vatCertificate || fop?.rnokpp || '')}</HKSEL>`,
    el('HTINSEL', fop?.rnokpp), fop?.rnokpp ? '<HKS>2</HKS>' : '',
    `<HKBUY>${esc(self ? IPN_SELF : (v.buyerIpn || specOf(v).ipn || ''))}</HKBUY>`,
    el('HTINBUY', buyerTin), buyerTin && tinKind(buyerTin) ? `<HKB>${tinKind(buyerTin)}</HKB>` : '',
  );
};
const topMarks = (v) => lines(
  el('R01G1', v.consolidatedCode || specOf(v).consolidatedCode),
  (v.reasonType || specOf(v).reasonType) ? `<HORIG1>1</HORIG1>\n<HTYPR>${esc(v.reasonType || specOf(v).reasonType)}</HTYPR>` : '',
);
const numParts = (tag, number) => {
  const [main, spec] = String(number || '').split('/');
  return lines(`<${tag}>${esc(main || '')}</${tag}>`, spec ? `<${tag}1>${esc(spec)}</${tag}1>` : '');
};
const nz = (name, v) => (+v ? money(name, v) : '');
const goodsCols = (rows) => lines(
  col('RXXXXG3S', rows, x => x.name || 'Товари/послуги'),
  col('RXXXXG4', rows, x => x.uktzed),
  col('RXXXXG33', rows, x => x.dkpp),
  col('RXXXXG4S', rows, x => x.unitName),
  col('RXXXXG105_2S', rows, x => unitCode(x.unitName)),
);

export const pnXmlGaps = (fop, v) => {
  const miss = [];
  if (!fop?.rnokpp) miss.push('РНОКПП ФОП');
  if (!fop?.dpsRegion || !fop?.dpsDistrict || !fop?.dpsCode) miss.push('коди ДПС у профілі ФОП');
  if (!isSelfPn(v) && !isNonpayerPn(v) && !/^\d{10,12}$/.test(v.buyerIpn || '')) miss.push('ІПН покупця');
  if (!/^[1-9]\d*(\/\d+)?$/.test(String(v.number || ''))) miss.push('номер (лише цифри, не з нуля)');
  return miss;
};

export const buildPnXml = ({ fop, pn }) => {
  const d = String(pn.date || '');
  const h = baseHead(fop, FORM_PN, { periodMonth: +d.slice(5, 7) || 1, periodType: 1, periodYear: +d.slice(0, 4), cnt: parseInt(pn.number, 10) || 1 });
  const rows = vatLines(pn);
  const t = vatTotals(pn);
  const b = (r) => t.byRate[r] || { base: 0, vat: 0 };
  const body = lines(
    topMarks(pn),
    `<HFILL>${dmy(d)}</HFILL>`, numParts('HNUM', pn.number),
    parties(fop, pn),
    money('R04G11', t.total), money('R03G11', t.vat),
    nz('R03G7', b(20).vat), nz('R03G109', b(7).vat), nz('R03G14', b(14).vat),
    nz('R01G7', b(20).base), nz('R01G109', b(7).base), nz('R01G14', b(14).base), nz('R01G8', b(0).base),
    goodsCols(rows),
    col('RXXXXG5', rows, x => (x.qty ? qty6(x.qty) : '')),
    col('RXXXXG6', rows, x => (x.price ? num(x.price) : '')),
    col('RXXXXG008', rows, x => rateCode(x.rate)),
    col('RXXXXG010', rows, x => x.base, num),
    col('RXXXXG11_10', rows, x => (x.rate ? (x.base * x.rate / 100).toFixed(6) : '')),
    `<HBOS>${esc(fop?.fullName || '')}</HBOS>`, `<HKBOS>${esc(fop?.rnokpp || '')}</HKBOS>`,
  );
  return { name: fileNameOf(h), xml: wrapXml(h, [], body) };
};

export const buildRkXml = ({ fop, rk }) => {
  const d = String(rk.date || '');
  const h = baseHead(fop, FORM_RK, { periodMonth: +d.slice(5, 7) || 1, periodType: 1, periodYear: +d.slice(0, 4), cnt: parseInt(rk.number, 10) || 1 });
  const rows = vatLines(rk).map((x, i) => ({ lineNo: 1, reasonCode: rk.reasonCode || '103', group: i + 1, ...x }));
  const t = vatTotals(rk);
  const b = (r) => t.byRate[r] || { base: 0, vat: 0 };
  const body = lines(
    rkRegistrar(rk) === 'buyer' ? '<HERPN>1</HERPN>' : '<HERPN0>1</HERPN0>',
    topMarks(rk),
    `<HFILL>${dmy(d)}</HFILL>`, numParts('HNUM', rk.number),
    `<HPODFILL>${dmy(rk.correctedDate)}</HPODFILL>`, numParts('HPODNUM', rk.correctedNumber),
    parties(fop, rk),
    money('R001G03', t.vat),
    nz('R02G9', b(20).vat), nz('R02G111', b(7).vat), nz('R03G14', b(14).vat),
    nz('R01G9', b(20).base), nz('R01G111', b(7).base), nz('R01G14', b(14).base), nz('R006G03', b(0).base),
    col('RXXXXG001', rows, x => x.lineNo),
    col('RXXXXG21', rows, x => x.reasonCode),
    col('RXXXXG22', rows, x => x.group),
    goodsCols(rows),
    col('RXXXXG5', rows, x => (x.qtyDelta ? qty6(x.qtyDelta) : '')),
    col('RXXXXG6', rows, x => (x.qtyDelta && x.price ? num(x.price) : '')),
    col('RXXXXG7', rows, x => (x.priceDelta ? num(x.priceDelta) : '')),
    col('RXXXXG8', rows, x => (x.priceDelta && x.qtyForPrice ? qty6(x.qtyForPrice) : '')),
    col('RXXXXG008', rows, x => rateCode(x.rate)),
    col('RXXXXG010', rows, x => x.base, num),
    col('RXXXXG11_10', rows, x => (x.rate ? (x.base * x.rate / 100).toFixed(6) : '')),
    `<HBOS>${esc(fop?.fullName || '')}</HBOS>`, `<HKBOS>${esc(fop?.rnokpp || '')}</HKBOS>`,
  );
  return { name: fileNameOf(h), xml: wrapXml(h, [], body) };
};
