import {
  MIN_WAGE, ESV_MAX_BASE,
  PERSON_TYPE_EMPLOYEE, PERSON_TYPE_DISABILITY,
} from '../constants/payrollTypes';

// Генерація XML Єдиної звітності (Додатки 1 і 4ДФ).
// Схема J0501401 — місячна звітність роботодавця.
// Формат відповідає вимогам ДПС станом на 2025 р.
// Перед подачею звіряйте версію схеми з Порталом ДПС —
// при зміні наказу поле C_DOC_VER потрібно оновити у налаштуваннях.

const esc = (str) => String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmtDate = (iso) => iso ? iso.split('-').reverse().join('.') : '';

// ─── Додаток 4ДФ: ПДФО і ВЗ ────────────────────────────────────────
const buildAppendix4DF = (records, employees) => {
  const totalIncome = records.reduce((s,r)=>s+(+r.totalGross||0),0);
  const totalPdfo   = records.reduce((s,r)=>s+(+r.pdfo||0),0);
  const totalVz     = records.reduce((s,r)=>s+(+r.vz||0),0);

  const rows = records.map((r, i) => {
    const emp = employees.find(e => e.id === r.employeeId);
    return `
    <ROW ROWNUM="${i+1}">
      <HTIN>${esc(emp?.rnokpp)}</HTIN>
      <HKIND>101</HKIND>
      <HOZNAKOS>1</HOZNAKOS>
      <HKINDNDR>0</HKINDNDR>
      <HNARAM>${(+r.totalGross||0).toFixed(2)}</HNARAM>
      <HNVYP>${(+r.netPay||0).toFixed(2)}</HNVYP>
      <HPDFO>${(+r.pdfo||0).toFixed(2)}</HPDFO>
      <HVZ>${(+r.vz||0).toFixed(2)}</HVZ>
    </ROW>`;
  }).join('');

  return `
  <APPEND4DF>
    <HSUM>${totalIncome.toFixed(2)}</HSUM>
    <HPDFOSUM>${totalPdfo.toFixed(2)}</HPDFOSUM>
    <HVZSUM>${totalVz.toFixed(2)}</HVZSUM>
    <TABLE>${rows}
    </TABLE>
  </APPEND4DF>`;
};

// ─── Додаток 1: ЄСВ ─────────────────────────────────────────────────
const buildAppendix1 = (records, employees, period) => {
  const [year, month] = period.split('-');
  const totalEsv = records.reduce((s,r)=>s+(+r.esv||0),0);

  const rows = records.map((r, i) => {
    const emp = employees.find(e => e.id === r.employeeId);
    // Мінімальна база ЄСВ (МЗП) не застосовується до працівників з інвалідністю
    // (для них ставка 8,41%). Максимальна база — 20 МЗП — діє для всіх.
    const disabled = !!(r.hasDisability || emp?.hasDisability);
    const gross = Math.max(+r.totalGross||0, 0);
    const base = disabled
      ? Math.min(gross, ESV_MAX_BASE)
      : Math.min(Math.max(gross, MIN_WAGE), ESV_MAX_BASE);
    return `
    <ROW ROWNUM="${i+1}">
      <HTIN>${esc(emp?.rnokpp)}</HTIN>
      <HKATO>${disabled ? PERSON_TYPE_DISABILITY : PERSON_TYPE_EMPLOYEE}</HKATO>
      <HKINDNDR>1</HKINDNDR>
      <HPERIOD>${month}.${year}</HPERIOD>
      <HSUM>${base.toFixed(2)}</HSUM>
      <HMAXSUM>${ESV_MAX_BASE.toFixed(2)}</HMAXSUM>
      <HESVSUM>${(+r.esv||0).toFixed(2)}</HESVSUM>
    </ROW>`;
  }).join('');

  return `
  <APPEND1>
    <HESVTOTAL>${totalEsv.toFixed(2)}</HESVTOTAL>
    <TABLE>${rows}
    </TABLE>
  </APPEND1>`;
};

// ─── Головний документ ───────────────────────────────────────────────
export const generatePayrollXml = ({ records, employees, fop, period, docVer = '01' }) => {
  if (!records.length || !fop) return null;

  const [year, month] = (period || '').split('-');
  const today = new Date().toISOString().slice(0,10);

  const head = `
  <DECLARHEAD>
    <TIN>${esc(fop.rnokpp)}</TIN>
    <C_DOC>J05</C_DOC>
    <C_DOC_SUB>014</C_DOC_SUB>
    <C_DOC_VER>${esc(docVer)}</C_DOC_VER>
    <C_DOC_TYPE>0</C_DOC_TYPE>
    <C_DOC_CNT>1</C_DOC_CNT>
    <PERIOD_MONTH>${+month}</PERIOD_MONTH>
    <PERIOD_YEAR>${year}</PERIOD_YEAR>
    <HNAME>${esc(fop.fullName)}</HNAME>
    <HTIN>${esc(fop.rnokpp)}</HTIN>
    <HDATEQ>${fmtDate(today)}</HDATEQ>
    <HNAZVAP>${esc(fop.fullName)}</HNAZVAP>
    <HKVED>${esc(fop.mainKved)}</HKVED>
  </DECLARHEAD>`;

  const xml = `<?xml version="1.0" encoding="windows-1251"?>
<DECLAR>
  ${head}
  ${buildAppendix4DF(records, employees)}
  ${buildAppendix1(records, employees, period)}
</DECLAR>`;

  return xml;
};

// ─── Завантаження XML-файлу ──────────────────────────────────────────
export const downloadXml = (xmlString, filename) => {
  // Конвертуємо UTF-8 → Windows-1251 через blob (браузер підтримує)
  const blob = new Blob([xmlString], { type: 'application/xml;charset=windows-1251' });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href    = url;
  a.download= filename;
  a.click();
  URL.revokeObjectURL(url);
};
