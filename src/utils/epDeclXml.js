// XML декларації платника єдиного податку — ФОП, за схемами ДПС:
//   F0103309 — група 3 (квартал), додаток 1 (ЄСВ) F0133109 — лише у складі річної
//   F0103407 — групи 1 і 2 (рік),  додаток 1 (ЄСВ) F0134107
// Форма — наказ Мінфіну від 19.06.2015 № 578 у редакції наказу від 31.01.2025 № 57.
// Рядки беруться з buildDeclaration (utils/dpsDeclaration.js): елемент R0NNG3 — рядок NN,
// R0141G3 / R0142G3 — рядки 14.1 / 14.2. R02G1–R02G4 (група 1) і R03G1–R03G4 (група 2) —
// щомісячні авансові внески єдиного податку в розрізі кварталів. R08G1–R08G12 — відмітки
// місяців, за які нараховано військовий збір платника груп 1, 2 (розділ VIII, підрозділ 1).
import { esc, num, todayDps } from './xmlDps';
import { fileNameOf, wrapXml, baseHead, el, col, lines } from './payrollXml';

const r2 = (n) => Math.round((+n || 0) * 100) / 100;
const FORMS = {
  g3:  { decl: { cDoc: 'F01', cDocSub: '033', cDocVer: 9 }, app1: { cDoc: 'F01', cDocSub: '331', cDocVer: 9 } },
  g12: { decl: { cDoc: 'F01', cDocSub: '034', cDocVer: 7 }, app1: { cDoc: 'F01', cDocSub: '341', cDocVer: 7 } },
};
// Тип періоду в заголовку файлу і позначка періоду в тілі декларації
const PERIODS = {
  1: { periodType: 2, periodMonth: 3,  mark: 'H1KV' },
  2: { periodType: 3, periodMonth: 6,  mark: 'HHY' },
  3: { periodType: 4, periodMonth: 9,  mark: 'H3KV' },
  4: { periodType: 5, periodMonth: 12, mark: 'HY' },
};

// «49.41 Вантажний автомобільний транспорт, 52.29 Інша допоміжна діяльність» → [{code, name}]
export const parseKveds = (...sources) => {
  const text = sources.filter(Boolean).join('; ');
  const re = /\b(\d{2}\.\d{1,2})\b/g;
  const hits = [...text.matchAll(re)];
  const out = [];
  hits.forEach((h, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].index : text.length;
    const name = text.slice(h.index + h[1].length, end).replace(/^[\s\-–—:.)]+|[\s,;.(]+$/g, '');
    if (!out.some(k => k.code === h[1])) out.push({ code: h[1], name });
  });
  return out;
};

export const epDeclXmlGaps = (fop) => {
  const miss = [];
  if (!/^\d{10}$/.test(String(fop?.rnokpp || ''))) miss.push('РНОКПП (10 цифр)');
  if (!fop?.fullName) miss.push('прізвище, ім’я, по батькові');
  if (!fop?.legalAddress) miss.push('податкова адреса');
  if (!fop?.dpsRegion) miss.push('код області ДПС');
  if (!fop?.dpsDistrict) miss.push('код району ДПС');
  if (!fop?.dpsCode) miss.push('код податкового органу');
  if (!fop?.dpsName) miss.push('назва податкового органу');
  if (!parseKveds(fop?.mainKved).length) miss.push('основний КВЕД');
  return miss;
};

const sum = (n) => (r2(n) ? `${num(n)}` : '');
const rowEl = (code, v) => { const s = sum(v); return s ? `<R${code}G3>${s}</R${code}G3>` : ''; };

/**
 * @param {object} p
 * @param {object} p.fop
 * @param {number} p.year
 * @param {object} p.decl          результат buildDeclaration
 * @param {number} p.employeesCount рядок 9 — чисельність найманих працівників
 * @param {number[]} [p.advanceByQuarter] групи 1, 2: авансові внески ЄП за квартали
 */
export const buildEpDeclPackage = ({ fop, year, decl, employeesCount = 0, advanceByQuarter = [] }) => {
  const r = decl.rows;
  const annualOnly = decl.meta.isAnnualOnly;
  const forms = annualOnly ? FORMS.g12 : FORMS.g3;
  const per = PERIODS[annualOnly ? 4 : decl.period.id];
  const headPer = { periodMonth: per.periodMonth, periodType: per.periodType, periodYear: year, cnt: 1 };
  const hDecl = baseHead(fop, forms.decl, headPer);
  const hApp1 = baseHead(fop, forms.app1, headPer);
  const withApp1 = decl.withAppendix1 && decl.esvTotal > 0;
  const warnings = [];

  const kveds = parseKveds(fop?.mainKved, fop?.additionalKveds);
  if (kveds.some(k => !k.name)) warnings.push('Для частини КВЕД у профілі немає назви — у декларацію замість назви потрапив код. Допишіть назву після коду в профілі ФОП.');
  const isG1 = r['01'] > 0 || r['02'] > 0, isG2 = r['03'] > 0 || r['04'] > 0;
  const adv = (prefix) => advanceByQuarter.map((v, i) => (r2(v) ? `<${prefix}G${i + 1}>${num(v)}</${prefix}G${i + 1}>` : '')).filter(Boolean).join('\n');
  // Нульова декларація груп 1, 2: розділ обираємо за групою з профілю
  const g1 = annualOnly && (isG1 || (!isG2 && decl.meta.taxGroup === '1'));
  const g2 = annualOnly && !g1;

  const body = lines(
    '<HZ>1</HZ>', `<${per.mark}>1</${per.mark}>`, `<HZY>${year}</HZY>`,
    `<HSTI>${esc(fop?.dpsName || '')}</HSTI>`,
    `<HNAME>${esc(fop?.fullName || '')}</HNAME>`,
    `<HLOC>${esc(fop?.legalAddress || '')}</HLOC>`,
    el('HEMAIL', fop?.email), el('HTEL', fop?.phone),
    `<HTIN>${esc(fop?.rnokpp || '')}</HTIN>`,
    `<HNACTL>${Math.max(0, Math.round(+employeesCount || 0))}</HNACTL>`,
    col('T1RXXXXG1S', kveds, k => k.code), col('T1RXXXXG2S', kveds, k => k.name || k.code),
    g1 ? adv('R02') : '', rowEl('001', r['01']), rowEl('002', r['02']),
    g2 ? adv('R03') : '', rowEl('003', r['03']), rowEl('004', r['04']),
    rowEl('005', r['05']), rowEl('006', r['06']), rowEl('007', r['07']),
    rowEl('008', r['08']), rowEl('009', r['09']), rowEl('010', r['10']), rowEl('011', r['11']),
    rowEl('012', r['12']), rowEl('013', r['13']),
    rowEl('0141', r['14.1']), rowEl('0142', r['14.2']), rowEl('014', r['14']),
    withApp1 ? rowEl('021', r['21']) : '',
    annualOnly ? decl.vzMonthMarks.map((on, i) => (on ? `<R08G${i + 1}>1</R08G${i + 1}>` : '')).filter(Boolean).join('\n') : '',
    rowEl('022', r['22']), rowEl('023', r['23']), rowEl('024', r['24']), rowEl('025', r['25']),
    withApp1 ? '<HD1>1</HD1>' : '',
    `<HFILL>${todayDps()}</HFILL>`,
    `<HBOS>${esc(fop?.fullName || '')}</HBOS>`,
  );

  const files = [{
    name: fileNameOf(hDecl), title: 'Декларація платника єдиного податку',
    xml: wrapXml(hDecl, withApp1 ? [{ ...hApp1, linkType: 1 }] : [], body),
  }];

  if (withApp1) {
    // Період перебування на спрощеній системі в межах року
    const reg = String(fop?.registrationDate || '');
    const from = reg.slice(0, 4) === String(year) ? `${reg.slice(8, 10)}${reg.slice(5, 7)}${year}` : `0101${year}`;
    const main = kveds[0]?.code || '';
    const rows = decl.esvRows.map((x, i) => (x.amount > 0 ? lines(
      `<R09${i + 1}G2>${num(x.base)}</R09${i + 1}G2>`,
      `<R09${i + 1}G3>${num(x.ratePercent)}</R09${i + 1}G3>`,
      `<R09${i + 1}G4>${num(x.amount)}</R09${i + 1}G4>`) : '')).filter(Boolean).join('\n');
    const baseTotal = r2(decl.esvRows.reduce((s, x) => s + (x.amount > 0 ? x.base : 0), 0));
    const app1Body = lines(
      '<HZ>1</HZ>',
      `<HTIN>${esc(fop?.rnokpp || '')}</HTIN>`,
      `<HNAME>${esc(fop?.fullName || '')}</HNAME>`,
      '<HY>1</HY>', `<HZY>${year}</HZY>`,
      `<HKVED>${esc(main)}</HKVED>`,
      `<R08G1D>${from}</R08G1D>`, `<R08G2D>3112${year}</R08G2D>`,
      `<R081G1>${decl.meta.insuredPersonCategory}</R081G1>`,
      rows,
      `<R09G2>${num(baseTotal)}</R09G2>`, `<R09G4>${num(decl.esvTotal)}</R09G4>`,
      `<HBOS>${esc(fop?.fullName || '')}</HBOS>`,
    );
    files.push({
      name: fileNameOf(hApp1), title: 'Додаток 1 (єдиний внесок)',
      xml: wrapXml(hApp1, [{ ...hDecl, linkType: 2 }], app1Body),
    });
  }
  return { files, warnings };
};
