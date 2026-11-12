// XML декларації з ПДВ (F0200126) і додатка 1 (F0200426) — за схемами і бланками ДПС.
// Додаток 1: таблиця 1.1 — видані ПН, не зареєстровані в ЄРПН на дату подання; таблиця 1.2 — такі самі
// РК на збільшення; таблиця 2.1 — податковий кредит за постачальниками і періодами складання ПН.
// Не формуються: таблиця 2.2 (коригування кредиту), додатки 2 (від'ємне значення), 4 (пільги), 5.
import { esc, todayDps } from './xmlDps';
import { fileNameOf, wrapXml, baseHead, el, col, lines, dmy } from './payrollXml';
import { num } from './xmlDps';
import {
  vatTotals, declarationSlot, isSelfPn, isNonresPn, isImportDoc, specOf, vatDeclarationRows, IPN_SELF,
} from './vatLogic';

const FORM_DECL = { cDoc: 'F02', cDocSub: '001', cDocVer: 26 };
const FORM_D1   = { cDoc: 'F02', cDocSub: '004', cDocVer: 26 };
const ROW_ORDER = ['R11GA', 'R11GB', 'R12GA', 'R12GB', 'R13GA', 'R13GB', 'R21GA', 'R30GA', 'R41GA', 'R41GB', 'R42GA', 'R42GB',
  'R43GA', 'R43GB', 'R50GA', 'R51GA', 'R61GA', 'R61GB', 'R62GA', 'R62GB', 'R71GA', 'R71GB', 'R90GB',
  'R101GA', 'R101GB', 'R102GA', 'R102GB', 'R103GA', 'R103GB', 'R104GA', 'R111GA', 'R111GB', 'R112GA', 'R112GB', 'R113GA', 'R113GB',
  'R131GA', 'R131GB', 'R132GA', 'R132GB', 'R140GA', 'R140GB', 'R160GB', 'R161GB', 'R170GB', 'R180GB', 'R190GB',
  'R191G3', 'R191GB', 'R200GB', 'R203GB', 'R210GB'];
const R = (n) => Math.round(+n || 0);
const vatBy = (t, r) => (t.byRate[r] ? t.byRate[r].vat : 0);

// Рядки додатка 1 за документами періоду
export const buildD1Tables = (vatInvoices, period) => {
  const inPeriod = vatInvoices.filter(v => declarationSlot(v).period === period ||
    (isNonresPn(v) && String(v.date).slice(0, 7) === period));
  const row = (v) => {
    const t = vatTotals(v);
    return { ipn: isSelfPn(v) ? IPN_SELF : (v.buyerIpn || specOf(v).ipn || ''), date: v.date, number: String(v.number || ''),
      self: isSelfPn(v) ? 1 : '', base: t.base, v20: vatBy(t, 20), v7: vatBy(t, 7), v14: vatBy(t, 14) };
  };
  const out = inPeriod.filter(v => v.direction === 'outgoing' && !v.registered && !isNonresPn(v));
  const t11 = out.filter(v => v.kind !== 'rk' && vatTotals(v).vat > 0).map(row);
  const t12 = out.filter(v => v.kind === 'rk' && vatTotals(v).vat > 0).map(row);
  // Кредит: згортаємо за ІПН постачальника і місяцем складання ПН
  const groups = {};
  const noIpn = [];
  for (const v of inPeriod) {
    if (v.direction !== 'incoming' || v.kind === 'rk' || isImportDoc(v)) continue;
    const t = vatTotals(v);
    if (t.vat <= 0) continue;
    if (!/^\d{10,12}$/.test(v.buyerIpn || '')) { noIpn.push(v); continue; }
    const key = `${v.buyerIpn}|${String(v.date).slice(0, 7)}`;
    const g = groups[key] || (groups[key] = { ipn: v.buyerIpn, month: +String(v.date).slice(5, 7), year: +String(v.date).slice(0, 4), base: 0, v20: 0, v7: 0, v14: 0 });
    g.base += t.byRate[20]?.base || 0; g.base += t.byRate[7]?.base || 0; g.base += t.byRate[14]?.base || 0;
    g.v20 += vatBy(t, 20); g.v7 += vatBy(t, 7); g.v14 += vatBy(t, 14);
  }
  return { t11, t12, t21: Object.values(groups), noIpn };
};

const table1 = (prefix, totalPrefix, rows) => (rows.length ? lines(
  col(`${prefix}G2`, rows, x => x.ipn), col(`${prefix}G3D`, rows, x => dmy(x.date)), col(`${prefix}G4S`, rows, x => x.number),
  col(`${prefix}G5`, rows, x => x.self),
  col(`${prefix}G6`, rows, x => x.base, num), col(`${prefix}G7`, rows, x => x.v20 || '', num),
  col(`${prefix}G8`, rows, x => x.v7 || '', num), col(`${prefix}G9`, rows, x => x.v14 || '', num),
  `<${totalPrefix}G6>${R(rows.reduce((s, x) => s + x.base, 0))}</${totalPrefix}G6>`,
  ...[['G7', 'v20'], ['G8', 'v7'], ['G9', 'v14']].map(([g, k]) => {
    const v = R(rows.reduce((s, x) => s + x[k], 0)); return v ? `<${totalPrefix}${g}>${v}</${totalPrefix}${g}>` : '';
  }),
) : '');

export const buildVatDeclPackage = ({ fop, calc, period, vatInvoices, seaLimit = null }) => {
  const [y, m] = period.split('-').map(Number);
  const per = { periodMonth: m, periodType: 1, periodYear: y, cnt: 1 };
  const rows = vatDeclarationRows(calc, { seaLimit });
  const d1 = buildD1Tables(vatInvoices, period);
  const hasD1 = d1.t11.length || d1.t12.length || d1.t21.length;
  const warnings = [];
  if (d1.noIpn.length) warnings.push(`Отримані ПН без ІПН постачальника (${d1.noIpn.map(v => `№ ${v.number}`).join(', ')}) — у таблицю 2.1 додатка 1 не потрапили`);
  if (rows.R140GB || rows.R140GA) warnings.push('Є коригування податкового кредиту (рядок 14): таблицю 2.2 додатка 1 заповніть у кабінеті');
  if (rows.R190GB && rows.R191G3 === undefined) warnings.push('Від\'ємне значення: вкажіть суму за п. 200-1.3 ПКУ, без неї рядки 19.1–21 не заповнено');
  if (rows.R190GB) warnings.push('Від\'ємне значення: до декларації потрібен додаток 2 — його додайте в кабінеті');
  if (rows.R51GA) warnings.push('Є звільнені операції (рядок 5.1): потрібен додаток 4 — його додайте в кабінеті');
  if (rows.R41GB || rows.R42GB || rows.R43GB) warnings.push('Є зобов\'язання за пп. 198.5, 199.1 (рядки 4.x): перевірте, чи потрібен додаток 5');

  const head = (fopHead) => lines(
    '<HZ>1</HZ>', `<HZY>${y}</HZY>`, `<HZM>${m}</HZM>`,
    `<HNAME>${esc(fop?.fullName || '')}</HNAME>`, `<HTIN>${esc(fop?.rnokpp || '')}</HTIN>`,
    `<HNPDV>${esc(fop?.vatCertificate || fop?.rnokpp || '')}</HNPDV>`, fopHead,
  );
  const sign = lines(`<HFILL>${todayDps()}</HFILL>`, `<HBOS>${esc(fop?.fullName || '')}</HBOS>`, `<HKBOS>${esc(fop?.rnokpp || '')}</HKBOS>`);
  const hMain = baseHead(fop, FORM_DECL, per), hD1 = baseHead(fop, FORM_D1, per);
  const mainBody = lines(
    head(lines(`<HLOC>${esc(fop?.legalAddress || '')}</HLOC>`, el('HZIP', fop?.zipCode), el('HTEL', fop?.phone), el('HEMAIL', fop?.email),
      `<HSTI>${esc(fop?.dpsName || '')}</HSTI>`)),
    ...ROW_ORDER.filter(k => rows[k] !== undefined).map(k => `<${k}>${rows[k]}</${k}>`),
    hasD1 ? '<HD1>1</HD1>' : '',
    sign,
  );
  const files = [{ name: fileNameOf(hMain), title: 'Декларація з ПДВ', xml: wrapXml(hMain, hasD1 ? [{ ...hD1, linkType: 1 }] : [], mainBody) }];
  if (hasD1) {
    const t21 = d1.t21;
    const tot = (k) => R(t21.reduce((s, x) => s + x[k], 0));
    const d1Body = lines(
      head(''),
      table1('T111RXXXX', 'R0111', d1.t11),
      table1('T121RXXXX', 'R0121', d1.t12),
      t21.length ? lines(
        col('T21RXXXXG2', t21, x => x.ipn), col('T21RXXXXG31', t21, x => x.month), col('T21RXXXXG32', t21, x => x.year),
        col('T21RXXXXG6', t21, x => x.base, num), col('T21RXXXXG7', t21, x => x.v20 || '', num),
        col('T21RXXXXG8', t21, x => x.v7 || '', num), col('T21RXXXXG9', t21, x => x.v14 || '', num),
        col('T21RXXXXG10', t21, x => x.v20 + x.v7 + x.v14, num),
        `<R021G6>${tot('base')}</R021G6>`, tot('v20') ? `<R021G7>${tot('v20')}</R021G7>` : '', tot('v7') ? `<R021G8>${tot('v7')}</R021G8>` : '',
        tot('v14') ? `<R021G9>${tot('v14')}</R021G9>` : '', `<R021G10>${tot('v20') + tot('v7') + tot('v14')}</R021G10>`,
      ) : '',
      sign,
    );
    files.push({ name: fileNameOf(hD1), title: 'Додаток 1', xml: wrapXml(hD1, [{ ...hMain, linkType: 2 }], d1Body) });
  }
  return { files, rows, d1, warnings };
};
