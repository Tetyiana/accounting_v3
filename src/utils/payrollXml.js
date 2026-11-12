// XML зарплатної звітності для Електронного кабінету ДПС.
// Назви елементів узято зі схем ДПС (архів xsd_all, версії станом на 11.2026):
//   F0500111 — Податковий розрахунок для ФОП / НПД (квартальний, з розбивкою за місяцями)
//   F0510111 — додаток ФІЗ-Д1, F0510411 — ФІЗ-4ДФ, F0510511 — ФІЗ-Д5
//   F0500701 — Звіт про внесок на підтримку працевлаштування осіб з інвалідністю
//   F3001005 — Повідомлення про прийняття працівника на роботу
// Зміст рядків і граф — наказ Мінфіну від 13.01.2015 № 4 у редакції наказу
// від 07.05.2026 № 243; наказ Мінфіну від 25.08.2026 № 453; постанова КМУ
// від 17.06.2015 № 413 у редакції постанови від 21.02.2025 № 184.
// Таблиці у форматі ДПС пишуться стовпцями: спершу всі значення графи 5, далі графи 6 і т. д.
import { taxYear } from '../constants/taxYears';
import { ESV_RATE, ESV_RATE_DISABILITY } from '../constants/payrollTypes';
import { esc, pad, num, regRaj, todayDps } from './xmlDps';
import {
  buildEmployeeTimesheet, avgHeadcountMonth, avgHeadcountQuarter, quarterPeriods, daysInMonth,
} from './timesheet';

const r2 = (n) => Math.round((+n || 0) * 100) / 100;
const dmy = (isoDate) => {           // 'РРРР-ММ-ДД' → 'ДДММРРРР'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate || ''));
  return m ? m[3] + m[2] + m[1] : '';
};
const dmyDots = (isoDate) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate || ''));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
};
export const splitName = (fullName) => {
  const p = String(fullName || '').trim().split(/\s+/);
  return { last: p[0] || '', first: p[1] || '', middle: p.slice(2).join(' ') };
};

// ─── Заголовок і назва файлу ──────────────────────────────────────
const fileNameOf = (h) =>
  `${pad(h.cReg, 2)}${pad(h.cRaj, 2)}${pad(h.tin, 10)}${h.cDoc}${h.cDocSub}${pad(h.cDocVer, 2)}` +
  `1${pad(h.docType || 0, 2)}${pad(h.cnt || 1, 7)}${h.periodType}${pad(h.periodMonth, 2)}${h.periodYear}` +
  `${pad(h.cSti || 0, 4)}.xml`;

const headXml = (h, linked = []) => `<DECLARHEAD>
<TIN>${esc(h.tin)}</TIN>
<C_DOC>${h.cDoc}</C_DOC>
<C_DOC_SUB>${h.cDocSub}</C_DOC_SUB>
<C_DOC_VER>${h.cDocVer}</C_DOC_VER>
<C_DOC_TYPE>${h.docType || 0}</C_DOC_TYPE>
<C_DOC_CNT>${h.cnt || 1}</C_DOC_CNT>
<C_REG>${pad(h.cReg, 2)}</C_REG>
<C_RAJ>${pad(h.cRaj, 2)}</C_RAJ>
<PERIOD_MONTH>${h.periodMonth}</PERIOD_MONTH>
<PERIOD_TYPE>${h.periodType}</PERIOD_TYPE>
<PERIOD_YEAR>${h.periodYear}</PERIOD_YEAR>
<C_STI_ORIG>${pad(h.cSti || 0, 4)}</C_STI_ORIG>
<C_DOC_STAN>1</C_DOC_STAN>
${linked.length ? `<LINKED_DOCS>
${linked.map((d, i) => `<DOC NUM="${i + 1}" TYPE="${d.linkType}">
<C_DOC>${d.cDoc}</C_DOC>
<C_DOC_SUB>${d.cDocSub}</C_DOC_SUB>
<C_DOC_VER>${d.cDocVer}</C_DOC_VER>
<C_DOC_TYPE>${d.docType || 0}</C_DOC_TYPE>
<C_DOC_CNT>${d.cnt || 1}</C_DOC_CNT>
<C_DOC_STAN>1</C_DOC_STAN>
<FILENAME>${fileNameOf(d)}</FILENAME>
</DOC>`).join('\n')}
</LINKED_DOCS>` : '<LINKED_DOCS xsi:nil="true"/>'}
<D_FILL>${h.dFill}</D_FILL>
<SOFTWARE>Oblik FOP</SOFTWARE>
</DECLARHEAD>`;

const wrapXml = (h, linked, body) =>
  `<?xml version="1.0" encoding="windows-1251"?>\n` +
  `<DECLAR xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
  `xsi:noNamespaceSchemaLocation="${h.cDoc}${h.cDocSub}${pad(h.cDocVer, 2)}.xsd">\n` +
  headXml(h, linked) + '\n<DECLARBODY>\n' + body + '\n</DECLARBODY>\n</DECLAR>';

// Порожні необов'язкові елементи у файл не пишуться
const el = (name, v) => (v === '' || v === null || v === undefined) ? '' : `<${name}>${esc(v)}</${name}>`;
const money = (name, v) => (v === null || v === undefined || v === '') ? '' : `<${name}>${num(v)}</${name}>`;
const col = (name, rows, pick, fmt = (v) => esc(v)) => rows
  .map((row, i) => {
    const v = pick(row);
    return (v === '' || v === null || v === undefined) ? '' : `<${name} ROWNUM="${i + 1}">${fmt(v)}</${name}>`;
  })
  .filter(Boolean).join('\n');
const lines = (...parts) => parts.filter(Boolean).join('\n');

// Спільні засоби для інших XML-модулів (ПДВ)
export { fileNameOf, wrapXml, el, money, col, lines, dmy };

// Реквізити ФОП, без яких кабінет файл не прийме
export const fopXmlGaps = (fop) => {
  const miss = [];
  if (!fop?.rnokpp) miss.push('РНОКПП');
  if (!fop?.dpsRegion) miss.push('код області ДПС');
  if (!fop?.dpsDistrict) miss.push('код району ДПС');
  if (!fop?.dpsCode) miss.push('код податкового органу');
  if (!fop?.dpsName) miss.push('назва податкового органу');
  if (!fop?.katottg) miss.push('код КАТОТТГ');
  if (!fop?.zipCode) miss.push('поштовий індекс');
  if (!fop?.legalAddress) miss.push('податкова адреса');
  return miss;
};

const footer = (fop, fill) => lines(
  `<HFILL>${fill}</HFILL>`,
  `<HKBOS>${esc(fop?.rnokpp || '')}</HKBOS>`,
  `<HBOS>${esc(fop?.fullName || '')}</HBOS>`,
);

export const baseHead = (fop, form, extra) => ({
  tin: fop?.rnokpp || '', ...regRaj(fop), ...form, dFill: todayDps(), ...extra,
});

// ─── ФІЗ-Д1: рядки одного місяця ──────────────────────────────────
// Один працівник дає кілька рядків: зарплата; відпускні (код типу нарахувань 10);
// лікарняні (код категорії 29, для особи з інвалідністю — 36); різниця до МЗП
// (код типу нарахувань 13, графа 18).
export const buildD1Rows = ({ period, records, employees, leaveRecords = [] }) => {
  const [year, month] = period.split('-').map(Number);
  const yp = taxYear(year);
  const rows = [];
  const warnings = [];
  for (const r of records) {
    const emp = employees.find(e => e.id === r.employeeId);
    if (!emp) continue;
    const disabled = !!(r.hasDisability ?? emp.hasDisability);
    const rate = disabled ? ESV_RATE_DISABILITY : ESV_RATE;
    const ts = buildEmployeeTimesheet(emp, period, leaveRecords);
    const nm = splitName(emp.fullName);
    if (!emp.gender) warnings.push(`${emp.fullName}: у картці не вказано стать (графа 6 ФІЗ-Д1)`);
    const sick  = r2((+r.sickPayAmount || 0) + (+r.sickPfuAmount || 0));
    const leave = r2(+r.leavePayAmount || 0);
    const salary = r2((+r.totalGross || 0) - sick - leave);
    let room = yp.esvMaxBase;                       // максимальна база на місяць на особу
    const common = {
      citizen: emp.isForeigner ? 0 : 1, gender: emp.gender || '', tin: emp.rnokpp || '',
      month, year, ...nm,
      employedDays: ts.employed || daysInMonth(period),
      main: 1, partTime: emp.isPartTime ? 1 : 0, special: 0, newPlace: 0, flex: 0,
      disabled, employeeId: emp.id,
    };
    const push = (kind, kzo, ktn, amount, extra = {}) => {
      const base = Math.max(0, Math.min(amount, room));
      room = r2(room - base);
      rows.push({ ...common, kind, kzo, ktn, g16: amount, g17: base, g18: null, g20: r2(base * rate), ...extra });
    };
    if (salary > 0 || (sick === 0 && leave === 0)) {
      push('salary', disabled ? 2 : 1, '', salary, { unpaidDays: +r.unpaidCalendarDays || ts.unpaid || 0 });
    }
    if (leave > 0) push('leave', disabled ? 2 : 1, 10, leave);
    if (sick > 0) {
      push('sick', disabled ? 36 : 29, '', sick, {
        sickDays: +r.sickDays || ts.sick || 0,
        sickEmployer: r2(+r.sickPayAmount || 0), sickPfu: r2(+r.sickPfuAmount || 0),
      });
    }
    // Різниця до МЗП: основне місце роботи, без інвалідності, у трудових відносинах увесь місяць
    const total = r2(salary + leave + sick);
    if (!disabled && ts.fullMonthEmployed && total > 0 && total < yp.minWage) {
      const diff = r2(yp.minWage - total);
      rows.push({ ...common, kind: 'topup', kzo: 1, ktn: 13, g16: null, g17: null, g18: diff, g20: r2(diff * ESV_RATE) });
    }
  }
  return { rows, warnings };
};

const d1Body = ({ fop, year, quarter, monthNo, appendixNo, rows }) => {
  const sum = (k) => r2(rows.reduce((s, x) => s + (+x[k] || 0), 0));
  const nz = (v) => (+v ? v : '');
  return lines(
    '<HZ>1</HZ>',
    `<HZY>${year}</HZY>`, `<HZKV>${quarter}</HZKV>`, `<HNM>${monthNo}</HNM>`, `<HNUM1>${appendixNo}</HNUM1>`,
    `<HNAME>${esc(fop?.fullName || '')}</HNAME>`, `<HTIN>${esc(fop?.rnokpp || '')}</HTIN>`,
    col('T1RXXXXG5', rows, x => x.citizen),
    // стать у схемі — числова ознака (тип OznColumn): 1 — чоловік, 0 — жінка
    col('T1RXXXXG6', rows, x => (x.gender === 'Ч' ? 1 : x.gender === 'Ж' ? 0 : '')),
    col('T1RXXXXG7S', rows, x => x.tin),
    col('T1RXXXXG8', rows, x => x.kzo),
    col('T1RXXXXG9', rows, x => x.ktn),
    col('T1RXXXXG101', rows, x => x.month),
    col('T1RXXXXG102', rows, x => x.year),
    col('T1RXXXXG111S', rows, x => x.last),
    col('T1RXXXXG112S', rows, x => x.first),
    col('T1RXXXXG113S', rows, x => x.middle),
    col('T1RXXXXG12', rows, x => nz(x.sickDays)),
    col('T1RXXXXG13', rows, x => nz(x.unpaidDays)),
    col('T1RXXXXG14', rows, x => (x.kind === 'salary' ? x.employedDays : '')),
    col('T1RXXXXG16', rows, x => x.g16, num),
    col('T1RXXXXG17', rows, x => x.g17, num),
    col('T1RXXXXG18', rows, x => x.g18, num),
    col('T1RXXXXG20', rows, x => x.g20, num),
    col('T1RXXXXG21', rows, x => x.main),
    col('T1RXXXXG22', rows, x => x.partTime),
    col('T1RXXXXG23', rows, x => x.special),
    col('T1RXXXXG24', rows, x => x.newPlace),
    col('T1RXXXXG26', rows, x => x.flex),
    money('R01G16', sum('g16')), money('R01G17', sum('g17')), money('R01G18', sum('g18')),
    money('R01G20', sum('g20')),
    footer(fop, todayDps()),
  );
};

// ─── ФІЗ-4ДФ: рядки одного місяця ─────────────────────────────────
// Ознака доходу 101 — зарплата, відпускні, лікарняні (довідник ознак доходів, додаток 2 до Порядку).
// Графи 3, 4, 5 (виплачено / перераховано) заповнюються, коли нарахування має статус «Виплачено».
export const build4dfRows = ({ period, records, employees }) => records.map(r => {
  const emp = employees.find(e => e.id === r.employeeId);
  if (!emp) return null;
  const paid = r.status === 'paid';
  const inPeriod = (d) => d && String(d).slice(0, 7) === period;
  return {
    tin: emp.rnokpp || '',
    accrued: r2(r.totalGross), paid: paid ? r2(r.totalGross) : 0,
    pdfoA: r2(r.pdfo), pdfo: paid ? r2(r.pdfo) : 0,
    vzA: r2(r.vz), vz: paid ? r2(r.vz) : 0,
    sign: 101,
    hired: inPeriod(emp.hireDate) ? dmy(emp.hireDate) : '',
    fired: inPeriod(emp.fireDate) ? dmy(emp.fireDate) : '',
  };
}).filter(Boolean);

const df4Body = ({ fop, year, quarter, monthNo, reportNum, rows }) => {
  const sum = (k) => r2(rows.reduce((s, x) => s + (+x[k] || 0), 0));
  return lines(
    '<HZ>1</HZ>',
    `<HZY>${year}</HZY>`, `<HZKV>${quarter}</HZKV>`, `<HNM>${monthNo}</HNM>`, `<HNUM>${reportNum}</HNUM>`,
    `<HNAME>${esc(fop?.fullName || '')}</HNAME>`, `<HTIN>${esc(fop?.rnokpp || '')}</HTIN>`,
    `<HKATOTTG>${esc(fop?.katottg || '')}</HKATOTTG>`,
    `<R00G01I>${new Set(rows.map(x => x.tin)).size}</R00G01I>`,
    col('T1RXXXXG02', rows, x => x.tin),
    col('T1RXXXXG03A', rows, x => x.accrued, num),
    col('T1RXXXXG03', rows, x => x.paid, num),
    col('T1RXXXXG04A', rows, x => x.pdfoA, num),
    col('T1RXXXXG04', rows, x => x.pdfo, num),
    col('T1RXXXXG5A', rows, x => x.vzA, num),
    col('T1RXXXXG5', rows, x => x.vz, num),
    col('T1RXXXXG05', rows, x => x.sign),
    col('T1RXXXXG06D', rows, x => x.hired),
    col('T1RXXXXG07D', rows, x => x.fired),
    money('R01G03A', sum('accrued')), money('R01G03', sum('paid')),
    money('R01G04A', sum('pdfoA')), money('R01G04', sum('pdfo')),
    money('R01G5A', sum('vzA')), money('R01G5', sum('vz')),
    footer(fop, todayDps()),
  );
};

// ─── ФІЗ-Д5: прийняття і звільнення за квартал ────────────────────
export const buildD5Rows = ({ year, quarter, employees, hrOrders = [] }) => {
  const periods = quarterPeriods(year, quarter);
  const inQ = (d) => d && periods.includes(String(d).slice(0, 7));
  const orderRef = (empId, type) => {
    const o = hrOrders.filter(x => x.employeeId === empId && x.orderType === type)
      .sort((a, b) => String(b.orderDate).localeCompare(String(a.orderDate)))[0];
    return o ? { text: `Наказ № ${o.orderNumber} від ${dmyDots(o.orderDate)}`, basis: o.details?.basis || '' } : { text: '', basis: '' };
  };
  const rows = [];
  for (const e of employees) {
    const nm = splitName(e.fullName);
    const common = {
      citizen: e.isForeigner ? 0 : 1, cpd: 0, cat: 1, tin: e.rnokpp || '', ...nm,
      inner: 0, transfer: 0, kpName: e.kpName || '', kpCode: e.kpCode || '', position: e.position || '',
    };
    if (inQ(e.hireDate)) rows.push({ ...common, start: dmy(e.hireDate), end: '', doc: orderRef(e.id, 'hire').text, reason: '' });
    if (inQ(e.fireDate)) {
      const o = orderRef(e.id, 'dismiss');
      rows.push({ ...common, start: '', end: dmy(e.fireDate), doc: o.text, reason: o.basis || 'ст. 38 КЗпП України' });
    }
  }
  return rows;
};

const d5Body = ({ fop, year, quarter, appendixNo, rows }) => lines(
  '<HZ>1</HZ>',
  `<HZY>${year}</HZY>`, `<HZKV>${quarter}</HZKV>`, `<HNUM1>${appendixNo}</HNUM1>`,
  `<HNAME>${esc(fop?.fullName || '')}</HNAME>`, `<HTIN>${esc(fop?.rnokpp || '')}</HTIN>`,
  col('T1RXXXXG5', rows, x => x.citizen),
  col('T1RXXXXG6', rows, x => x.cpd),
  col('T1RXXXXG7', rows, x => x.cat),
  col('T1RXXXXG8S', rows, x => x.tin),
  col('T1RXXXXG91S', rows, x => x.last),
  col('T1RXXXXG92S', rows, x => x.first),
  col('T1RXXXXG93S', rows, x => x.middle),
  col('T1RXXXXG101D', rows, x => x.start),
  col('T1RXXXXG102D', rows, x => x.end),
  col('T1RXXXXG11', rows, x => x.inner),
  col('T1RXXXXG12', rows, x => x.transfer),
  col('T1RXXXXG13S', rows, x => x.kpName),
  col('T1RXXXXG14S', rows, x => x.kpCode),
  col('T1RXXXXG15S', rows, x => x.position),
  col('T1RXXXXG16S', rows, x => x.doc),
  col('T1RXXXXG17S', rows, x => x.reason),
  footer(fop, todayDps()),
);

// ─── Податковий розрахунок ФОП: основна форма + додатки ───────────
// Рядки розділу (графи 3, 4, 5 — місяці кварталу):
//   1 — нараховано доходу (графа 16 ФІЗ-Д1): 1.1 зарплата, 1.3 лікарняні коштом
//       роботодавця, 1.4 лікарняні коштом ПФУ;
//   2 — база ЄСВ: 2.1 під 22 %, 2.2 під 8,41 %, 2.3 різниця до МЗП;
//   3 — нараховано ЄСВ: 3.1 = 22 %, 3.2 = 8,41 %, 3.2.1 довідково (2.2 × 22 %), 3.3 з різниці;
//   7 — ЄСВ до сплати (рядок 3 + рядок 4 − рядок 6).
export const calcUnifiedMonth = (d1rows) => {
  const s = (f, k) => r2(d1rows.filter(f).reduce((a, x) => a + (+x[k] || 0), 0));
  const m = {
    r1: s(() => true, 'g16'),
    r11: s(x => x.kind === 'salary' || x.kind === 'leave', 'g16'),
    r13: s(x => x.kind === 'sick', 'sickEmployer'),
    r14: s(x => x.kind === 'sick', 'sickPfu'),
    r21: s(x => !x.disabled && x.kind !== 'topup', 'g17'),
    r22: s(x => x.disabled, 'g17'),
    r23: s(x => x.kind === 'topup', 'g18'),
    r31: s(x => !x.disabled && x.kind !== 'topup', 'g20'),
    r32: s(x => x.disabled, 'g20'),
    r33: s(x => x.kind === 'topup', 'g20'),
  };
  m.r2 = r2(m.r21 + m.r22 + m.r23);
  m.r321 = r2(m.r22 * ESV_RATE);
  m.r3 = r2(m.r31 + m.r32 + m.r33);
  m.r7 = m.r3;
  return m;
};

const FORM_MAIN = { cDoc: 'F05', cDocSub: '001', cDocVer: 11 };
const FORM_D1   = { cDoc: 'F05', cDocSub: '101', cDocVer: 11 };
const FORM_4DF  = { cDoc: 'F05', cDocSub: '104', cDocVer: 11 };
const FORM_D5   = { cDoc: 'F05', cDocSub: '105', cDocVer: 11 };

export const buildUnifiedPackage = ({
  fop, year, quarter, employees, records, leaveRecords = [], hrOrders = [], reportNum = 1,
}) => {
  const periods = quarterPeriods(year, quarter);
  const per = { periodMonth: quarter * 3, periodType: 2, periodYear: year };
  const warnings = [];
  const months = periods.map((period, i) => {
    const recs = records.filter(r => r.period === period && r.status !== 'draft');
    const drafts = records.filter(r => r.period === period && r.status === 'draft').length;
    if (drafts) warnings.push(`${period}: ${drafts} нарахувань у статусі «Чернетка» — у звіт не потрапили`);
    const d1 = buildD1Rows({ period, records: recs, employees, leaveRecords });
    warnings.push(...d1.warnings);
    return {
      period, monthNo: i + 1, recs,
      d1rows: d1.rows,
      df4rows: build4dfRows({ period, records: recs, employees }),
      calc: calcUnifiedMonth(d1.rows),
      headcount: Math.round(avgHeadcountMonth(employees, period)),
      headcountDis: Math.round(avgHeadcountMonth(employees, period, e => e.hasDisability)),
      paidCount: new Set(recs.map(r => r.employeeId)).size,
    };
  });
  const d5rows = buildD5Rows({ year, quarter, employees, hrOrders });

  const mainHead = baseHead(fop, FORM_MAIN, { ...per, cnt: reportNum });
  const apps = [];
  months.filter(m => m.d1rows.length).forEach((m, i) =>
    apps.push({ kind: 'd1', m, head: baseHead(fop, FORM_D1, { ...per, cnt: i + 1 }) }));
  months.filter(m => m.df4rows.length).forEach((m, i) =>
    apps.push({ kind: '4df', m, head: baseHead(fop, FORM_4DF, { ...per, cnt: i + 1 }) }));
  if (d5rows.length) apps.push({ kind: 'd5', head: baseHead(fop, FORM_D5, { ...per, cnt: 1 }) });

  const n = (kind) => apps.filter(a => a.kind === kind).length;
  const g = (k) => months.map((m, i) => money(`R${k}G${i + 3}`, m.calc[rowKey[k]])).join('\n');
  const rowKey = {
    '0101': 'r1', '01011': 'r11', '01013': 'r13', '01014': 'r14',
    '0102': 'r2', '01021': 'r21', '01022': 'r22', '01023': 'r23',
    '0103': 'r3', '01031': 'r31', '01032': 'r32', '010321': 'r321', '01033': 'r33',
    '0107': 'r7',
  };
  const ints = (k, pick) => months.map((m, i) => `<R${k}G${i + 3}>${pick(m)}</R${k}G${i + 3}>`).join('\n');
  const nzMoney = (k) => months.some(m => +m.calc[rowKey[k]]) ? g(k) : '';

  const mainBody = lines(
    '<HZ>1</HZ>',
    `<HZY>${year}</HZY>`, `<HZKV>${quarter}</HZKV>`, `<HNUM>${reportNum}</HNUM>`,
    `<HNAME>${esc(fop?.fullName || '')}</HNAME>`, `<HTIN>${esc(fop?.rnokpp || '')}</HTIN>`,
    `<HKATOTTG>${esc(fop?.katottg || '')}</HKATOTTG>`,
    `<HLOC>${esc(fop?.legalAddress || '')}</HLOC>`, `<HZIP>${esc(fop?.zipCode || '')}</HZIP>`,
    el('HTEL', fop?.phone), el('HEMAIL', fop?.email),
    `<HSTI>${esc(fop?.dpsName || '')}</HSTI>`,
    n('d1') ? `<R061G3>1</R061G3>\n<R061G4>${n('d1')}</R061G4>` : '',
    n('4df') ? `<R062G3>1</R062G3>\n<R062G4>${n('4df')}</R062G4>` : '',
    n('d5') ? `<R063G3>1</R063G3>\n<R063G4>${n('d5')}</R063G4>` : '',
    el('HKVED', fop?.mainKved),
    '<R081G3>1</R081G3>',
    ints('091', m => m.headcount),
    months.some(m => m.headcountDis) ? ints('0911', m => m.headcountDis) : '',
    ints('092', m => m.paidCount),
    g('0101'), g('01011'), nzMoney('01013'), nzMoney('01014'),
    g('0102'), g('01021'), nzMoney('01022'), nzMoney('01023'),
    g('0103'), g('01031'), nzMoney('01032'), nzMoney('010321'), nzMoney('01033'),
    g('0107'),
    footer(fop, todayDps()),
  );

  const mainLink = [{ ...mainHead, linkType: 2 }];
  const files = [{
    name: fileNameOf(mainHead), title: 'Податковий розрахунок (основна форма)',
    xml: wrapXml(mainHead, apps.map(a => ({ ...a.head, linkType: 1 })), mainBody),
  }];
  for (const a of apps) {
    let body, title;
    if (a.kind === 'd1') {
      body = d1Body({ fop, year, quarter, monthNo: a.m.monthNo, appendixNo: a.head.cnt, rows: a.m.d1rows });
      title = `ФІЗ-Д1 за ${a.m.period}`;
    } else if (a.kind === '4df') {
      body = df4Body({ fop, year, quarter, monthNo: a.m.monthNo, reportNum, rows: a.m.df4rows });
      title = `ФІЗ-4ДФ за ${a.m.period}`;
    } else {
      body = d5Body({ fop, year, quarter, appendixNo: 1, rows: d5rows });
      title = 'ФІЗ-Д5 (прийняття і звільнення)';
    }
    files.push({ name: fileNameOf(a.head), title, xml: wrapXml(a.head, mainLink, body) });
  }
  if (d5rows.some(x => !x.kpCode)) warnings.push('ФІЗ-Д5: у картці працівника не вказано код професії за Класифікатором (графа 14)');
  if (!months.some(m => m.recs.length)) warnings.push('За квартал немає затверджених нарахувань');
  return { files, months, d5rows, warnings: [...new Set(warnings)] };
};

// ─── Внесок на підтримку працевлаштування осіб з інвалідністю ─────
// Закон «Про основи соціальної захищеності осіб з інвалідністю в Україні» від 21.03.1991
// № 875-XII (у редакції Закону № 4219-IX), форма звіту — наказ Мінфіну від 25.08.2026 № 453.
// Платник — роботодавець із середньою кількістю штатних працівників за квартал 8 і більше,
// який не виконав норматив: 8–25 працівників — 1 робоче місце, понад 25 — 4 %.
// Рядок 5 розділу І = рядок 3 − (рядок 4 − рядок 4.1) − 2 × рядок 4.1.
// Внесок = 40 % × середньомісячна зарплата на одного працівника × кількість місяців
// кварталу × рядок 5; під час воєнного стану — ще × 50 %.
export const DISABILITY_MIN_HEADCOUNT = 8;
export const calcDisabilityReport = ({ employees, records, year, quarter, martialLaw = true, overrides = {} }) => {
  const periods = quarterPeriods(year, quarter);
  const o = (k, v) => (overrides[k] !== undefined && overrides[k] !== '' ? +overrides[k] : v);
  const headcount = o('headcount', Math.round(avgHeadcountQuarter(employees, year, quarter)));
  const partTimers = o('partTimers', 0);
  const category = headcount >= 8 && headcount <= 25 ? '091' : headcount > 25 ? '092' : '';
  const norm = o('norm', headcount < DISABILITY_MIN_HEADCOUNT ? 0 : headcount <= 25 ? 1 : Math.round(headcount * 0.04));
  const withDisability = o('withDisability', Math.round(avgHeadcountQuarter(employees, year, quarter, e => e.hasDisability)));
  const heavy = o('heavy', 0);
  const gap = Math.max(0, norm - (withDisability - heavy) - 2 * heavy);
  const wages = o('wages', r2(records
    .filter(r => periods.includes(r.period) && r.status !== 'draft')
    .reduce((s, r) => s + (+r.totalGross || 0), 0)));
  const workers = headcount + partTimers;
  const avgWage = o('avgWage', workers > 0 ? r2(wages / workers / 3) : 0);
  const isPayer = headcount >= DISABILITY_MIN_HEADCOUNT && gap > 0;
  const contribution = isPayer ? r2(0.4 * avgWage * 3 * gap * (martialLaw ? 0.5 : 1)) : 0;
  return { year, quarter, headcount, partTimers, category, norm, withDisability, heavy, gap, wages, avgWage, isPayer, contribution, martialLaw };
};

const FORM_DIS = { cDoc: 'F05', cDocSub: '007', cDocVer: 1 };
export const buildDisabilityXml = ({ fop, calc, reportNum = 1 }) => {
  const h = baseHead(fop, FORM_DIS, { periodMonth: calc.quarter * 3, periodType: 2, periodYear: calc.year, cnt: reportNum });
  // Роботодавець, який не є платником внеску, розділи І–ІІІ і рядки 091–093 не заповнює
  const payerPart = calc.isPayer ? lines(
    calc.category ? `<R${calc.category}G3>1</R${calc.category}G3>` : '',
    `<R011G3>${calc.headcount}</R011G3>`,
    calc.partTimers ? `<R012G3>${calc.partTimers}</R012G3>` : '',
    `<R013G3>${calc.norm}</R013G3>`,
    `<R014G3>${calc.withDisability}</R014G3>`,
    calc.heavy ? `<R0141G3>${calc.heavy}</R0141G3>` : '',
    `<R015G3>${calc.gap}</R015G3>`,
    money('R021G3', calc.wages), money('R022G3', calc.avgWage), money('R023G3', calc.contribution),
  ) : '';
  const body = lines(
    '<HZ>1</HZ>',
    `<HZY>${calc.year}</HZY>`, `<HZKV>${calc.quarter}</HZKV>`, `<HNUM>${reportNum}</HNUM>`,
    `<HNAME>${esc(fop?.fullName || '')}</HNAME>`, `<HTIN>${esc(fop?.rnokpp || '')}</HTIN>`,
    `<HLOC>${esc(fop?.legalAddress || '')}</HLOC>`, `<HZIP>${esc(fop?.zipCode || '')}</HZIP>`,
    el('HTEL', fop?.phone), el('HEMAIL', fop?.email),
    `<HSTI>${esc(fop?.dpsName || '')}</HSTI>`,
    `<HKVED>${esc(fop?.mainKved || '')}</HKVED>`,
    payerPart,
    footer(fop, todayDps()),
  );
  return { name: fileNameOf(h), xml: wrapXml(h, [], body) };
};

// ─── Повідомлення про прийняття працівника на роботу ──────────────
// Графа 5 — категорія особи (1 — основне місце роботи, 2 — сумісництво),
// графа 9 — громадянство (1 — громадянин України, 0 — іноземець).
const FORM_HIRE = { cDoc: 'F30', cDocSub: '010', cDocVer: 5 };
export const buildHireNoticeXml = ({ fop, rows }) => {
  const d = new Date();
  const h = baseHead(fop, FORM_HIRE, {
    periodMonth: d.getMonth() + 1, periodType: 1, periodYear: d.getFullYear(), cnt: 1,
  });
  const body = lines(
    '<HPAGES>1</HPAGES>', '<H01>1</H01>',
    `<HTIN>${esc(fop?.rnokpp || '')}</HTIN>`, `<HNAME>${esc(fop?.fullName || '')}</HNAME>`,
    col('T1RXXXXG5', rows, x => x.category || 1),
    col('T1RXXXXG6S', rows, x => x.tin),
    col('T1RXXXXG81S', rows, x => x.last),
    col('T1RXXXXG82S', rows, x => x.first),
    col('T1RXXXXG83S', rows, x => x.middle),
    col('T1RXXXXG9', rows, x => (x.citizen === 0 ? 0 : 1)),
    col('T1RXXXXG10S', rows, x => x.orderNumber),
    col('T1RXXXXG11D', rows, x => dmy(x.orderDate)),
    col('T1RXXXXG12D', rows, x => dmy(x.startDate)),
    footer(fop, todayDps()),
  );
  return { name: fileNameOf(h), xml: wrapXml(h, [], body) };
};

export const hireNoticeRow = (emp, hrOrders = []) => {
  const o = hrOrders.filter(x => x.employeeId === emp.id && x.orderType === 'hire')
    .sort((a, b) => String(b.orderDate).localeCompare(String(a.orderDate)))[0];
  return {
    ...splitName(emp.fullName), tin: emp.rnokpp || '', category: 1, citizen: emp.isForeigner ? 0 : 1,
    orderNumber: o?.orderNumber || '', orderDate: o?.orderDate || emp.hireDate || '',
    startDate: o?.effectiveDate || emp.hireDate || '',
  };
};
