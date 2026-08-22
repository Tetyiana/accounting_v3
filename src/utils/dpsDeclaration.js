// Розрахунок показників податкової декларації платника єдиного податку –
// фізичної особи – підприємця за формою, затвердженою наказом Мінфіну
// від 19.06.2015 № 578 у редакції наказу від 31.01.2025 № 57
// (ідентифікатор електронної форми F0103309).
//
// Коди рядків тут відповідають ОФІЦІЙНОМУ бланку, не довільній нумерації.
// Розділи:
//   I    — загальні показники (чисельність, КВЕДи)
//   II   — група 1: рядки 01, 02
//   III  — група 2: рядки 03, 04
//   IV   — група 3: рядки 05 (3%), 06 (5%), 07 (15%)
//   V    — зобов'язання з ЄП: 08–14
//   VI   — виправлення самостійно виявлених помилок: 15–20
//   VII  — ЄСВ: 21
//   VIII — військовий збір: 22–29
//
// Декларація заповнюється НАРОСТАЮЧИМ ПІДСУМКОМ з початку року
// (виноска 4 до бланка).

const round2 = (n) => Math.round((+n || 0) * 100) / 100;

export const DECL_FORM_ID   = 'F0103309';
export const DECL_APP1_ID   = 'F0133109'; // Додаток 1 (ЄСВ)
export const DECL_APP2_ID   = 'F0133209'; // Додаток 2 (МПЗ)
export const DECL_ORDER     = 'наказ Мінфіну від 19.06.2015 № 578 '
                            + '(у редакції наказу від 31.01.2025 № 57)';

export const MONTHS_UA = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
];

// Періоди. Для груп 1, 2 звітний період — рік; для групи 3 — квартал
// наростаючим підсумком (п. 296.2, 296.3 ПКУ).
export const DECL_PERIODS = [
  { id: 1, label: 'І квартал',    upToMonth: 3,  mark: '01' },
  { id: 2, label: 'півріччя',     upToMonth: 6,  mark: '02' },
  { id: 3, label: 'три квартали', upToMonth: 9,  mark: '03' },
  { id: 4, label: 'рік',          upToMonth: 12, mark: '04' },
];

/**
 * @param {object} p
 * @param {number[]} p.incomeByMonth   дохід за 12 місяців року, без ПДВ
 * @param {number[]} p.excessByMonth   дохід понад граничний обсяг (оподатк. 15%)
 * @param {string}   p.taxGroup        '1' | '2' | '3_5' | '3_3_vat'
 * @param {number}   p.periodId        1..4 (див. DECL_PERIODS)
 * @param {number}   p.minWage         МЗП на 01.01 звітного року
 * @param {number}   p.esvRate         ставка ЄСВ (0.22)
 * @param {number[]} p.esvBaseByMonth  самостійно визначена база ЄСВ по місяцях
 * @param {boolean[]} p.monthsOnSimplified  чи перебував на спрощеній у місяці
 * @param {boolean[]} p.vzExemptMonths  місяці звільнення від ВЗ (груп 1, 2)
 * @param {number}   p.prevRow12       рядок 12 декларації попереднього періоду
 * @param {number}   p.prevRow23       рядок 23 декларації попереднього періоду
 */
export function buildDeclaration({
  incomeByMonth = [],
  excessByMonth = [],
  taxGroup = '3_5',
  periodId = 4,
  minWage = 8647,
  esvRate = 0.22,
  esvBaseByMonth = [],
  monthsOnSimplified = [],
  vzExemptMonths = [],
  prevRow12 = 0,
  prevRow23 = 0,
} = {}) {
  const period = DECL_PERIODS.find((p) => p.id === periodId) || DECL_PERIODS[3];
  const upTo   = period.upToMonth;
  const sum    = (arr) => round2(arr.slice(0, upTo).reduce((s, v) => s + (+v || 0), 0));

  const isG1  = taxGroup === '1';
  const isG2  = taxGroup === '2';
  const isG3  = taxGroup === '3_5' || taxGroup === '3_3_vat';
  const rate3 = taxGroup === '3_3_vat';
  const rate5 = taxGroup === '3_5';

  const income = sum(incomeByMonth);
  const excess = sum(excessByMonth);

  // ── Розділи II–IV: обсяги доходу за групами ──────────────────────
  const r = {};
  r['01'] = isG1 ? income : 0;                 // гр. 1, обсяг доходу
  r['02'] = isG1 ? excess : 0;                 // гр. 1, дохід за ставкою 15%
  r['03'] = isG2 ? income : 0;                 // гр. 2, обсяг доходу
  r['04'] = isG2 ? excess : 0;                 // гр. 2, дохід за ставкою 15%
  r['05'] = rate3 ? income : 0;                // гр. 3, дохід за ставкою 3%
  r['06'] = rate5 ? income : 0;                // гр. 3, дохід за ставкою 5%
  r['07'] = isG3 ? excess : 0;                 // гр. 3, дохід за ставкою 15%

  // ── Розділ V: зобов'язання з єдиного податку ─────────────────────
  r['08'] = round2(r['01'] + r['02'] + r['03'] + r['04'] + r['05'] + r['06'] + r['07']);
  r['09'] = round2((r['02'] + r['04'] + r['07']) * 0.15);
  r['10'] = round2(r['05'] * 0.03);
  r['11'] = round2(r['06'] * 0.05);
  r['12'] = round2(r['09'] + r['10'] + r['11']);
  r['13'] = round2(prevRow12);
  r['14.1'] = round2(r['12'] - r['13']);
  r['14.2'] = 0;                               // МПЗ — лише для сільгоспземель (Додаток 2)
  r['14']   = round2(r['14.1'] + r['14.2']);

  // ── Розділ VI: виправлення самостійно виявлених помилок ──────────
  // Заповнюється лише в уточнюючій декларації.
  r['15'] = 0; r['16'] = 0; r['17'] = 0; r['18'] = 0; r['19'] = 0; r['20'] = 0;

  // ── Додаток 1 + розділ VII: ЄСВ ──────────────────────────────────
  const esvRows = MONTHS_UA.map((name, i) => {
    const active = monthsOnSimplified[i] !== false && i < upTo;
    const base   = active ? round2(esvBaseByMonth[i] ?? minWage) : 0;
    return {
      month: name,
      base,                                     // графа 2
      ratePercent: active ? round2(esvRate * 100) : 0, // графа 3
      amount: active ? round2(base * esvRate) : 0,     // графа 4
    };
  });
  const esvTotal = round2(esvRows.reduce((s, x) => s + x.amount, 0));
  r['21'] = esvTotal;

  // ── Розділ VIII: військовий збір ─────────────────────────────────
  // Груп 1, 2 — фіксований: МЗП × 10% × кількість місяців на спрощеній,
  // за винятком місяців, у яких платник має право на звільнення.
  const vzMonthMarks = MONTHS_UA.map((_, i) =>
    (isG1 || isG2) && i < upTo
      && monthsOnSimplified[i] !== false
      && vzExemptMonths[i] !== true);
  const vzMonthsCount = vzMonthMarks.filter(Boolean).length;

  r['22'] = (isG1 || isG2) ? round2(minWage * 0.10 * vzMonthsCount) : 0;
  r['23'] = isG3 ? round2((r['05'] + r['06'] + r['07']) * 0.01) : 0;
  r['24'] = isG3 ? round2(prevRow23) : 0;
  r['25'] = isG3 ? round2(r['23'] - r['24']) : 0;
  r['26'] = 0; r['27'] = 0; r['28'] = 0; r['29'] = 0;

  return {
    rows: r,
    period,
    esvRows,
    esvTotal,
    vzMonthMarks,
    vzMonthsCount,
    meta: {
      formId: DECL_FORM_ID,
      order: DECL_ORDER,
      // Гр. 1, 2 звітують раз на рік, гр. 3 — щокварталу
      isAnnualOnly: isG1 || isG2,
      insuredPersonCategory: '6', // ФОП на спрощеній системі (виноска 11 Додатка 1)
    },
  };
}
