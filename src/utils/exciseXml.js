// XML декларації акцизного податку (F0209514) з додатком 5 (F0295614) — роздрібна торгівля.
// За бланками ДПС: розділ Д, рядок Д1 — зобов'язання за кодом території; додаток 5 — вартість
// з ПДВ без акцизу × 5 %: лікеро-горілчана продукція (1.1), виноробна (1.2), пиво (1.3).
// Платник — за пп. 212.1.11 ПКУ (позначка H00G8).
import { esc, num, todayDps } from './xmlDps';
import { fileNameOf, wrapXml, baseHead, el, col, lines } from './payrollXml';

const FORM_EXC = { cDoc: 'F02', cDocSub: '095', cDocVer: 14 };
const FORM_D5  = { cDoc: 'F02', cDocSub: '956', cDocVer: 14 };
const r2 = (n) => Math.round((+n || 0) * 100) / 100;
export const EXCISE_RATE = 5;

// gross — виручка від підакцизних товарів з ПДВ і акцизом за видами: { spirits, wine, beer }
export const calcExciseD5 = (gross) => {
  const line = (g) => { const base = r2((+g || 0) / (1 + EXCISE_RATE / 100)); return { base, tax: Math.round(base * EXCISE_RATE * 10) / 1000 }; };
  const spirits = line(gross.spirits), wine = line(gross.wine), beer = line(gross.beer);
  return { spirits, wine, beer, total: Math.round(spirits.tax + wine.tax + beer.tax) };
};

export const buildExcisePackage = ({ fop, period, gross, katottg }) => {
  const [y, m] = period.split('-').map(Number);
  const per = { periodMonth: m, periodType: 1, periodYear: y, cnt: 1 };
  const c = calcExciseD5(gross);
  const code = katottg || fop?.katottg || '';
  const hMain = baseHead(fop, FORM_EXC, per), hD5 = baseHead(fop, FORM_D5, per);
  const sign = lines(`<HDATE1>${todayDps()}</HDATE1>`, `<HBOS>${esc(fop?.fullName || '')}</HBOS>`, `<HKBOS>${esc(fop?.rnokpp || '')}</HKBOS>`);
  const terr = [{ code, sum: c.total }];
  const mainBody = lines(
    '<HZ>1</HZ>', `<HZM>${m}</HZM>`, `<HZY>${y}</HZY>`,
    `<HNAME>${esc(fop?.fullName || '')}</HNAME>`, `<HTIN>${esc(fop?.rnokpp || '')}</HTIN>`,
    '<H00G8>1</H00G8>',
    `<HLOC>${esc(fop?.legalAddress || '')}</HLOC>`, el('HZIP', fop?.zipCode), el('HTEL', fop?.phone), el('HEMAIL', fop?.email),
    `<HSTI>${esc(fop?.dpsName || '')}</HSTI>`,
    `<R500100G4>${c.total}</R500100G4>`,
    col('T1RXXXXG2S', terr, x => x.code), col('T1RXXXXG4', terr, x => x.sum),
    '<R010G1>1</R010G1>', '<R010G2>1</R010G2>', '<R010G3>1</R010G3>',
    `<HFILL>${todayDps()}</HFILL>`, sign,
  );
  const row = (n, x) => (x.base ? lines(`<R01${n}G3>${num(x.base)}</R01${n}G3>`, `<R01${n}G4>${EXCISE_RATE}</R01${n}G4>`, `<R01${n}G5>${x.tax.toFixed(3)}</R01${n}G5>`) : '');
  const d5Body = lines(
    '<H02G2S>Д1.1</H02G2S>', `<HZM>${m}</HZM>`, `<HZY>${y}</HZY>`, `<HKATOTTG>${esc(code)}</HKATOTTG>`,
    row(1, c.spirits), row(2, c.wine), row(3, c.beer),
    `<R01G5>${c.total}</R01G5>`, sign,
  );
  return {
    calc: c,
    files: [
      { name: fileNameOf(hMain), title: 'Декларація акцизного податку', xml: wrapXml(hMain, [{ ...hD5, linkType: 1 }], mainBody) },
      { name: fileNameOf(hD5), title: 'Додаток 5', xml: wrapXml(hD5, [{ ...hMain, linkType: 2 }], d5Body) },
    ],
  };
};
