// Друковані форми зарплатного блоку: табель, розрахунково-платіжна відомість,
// повідомлення про прийняття працівника, розрахунок лікарняних, звіт про внесок.
// Табель і відомість побудовано за типовими формами № П-5 і № П-6
// (наказ Держкомстату від 05.12.2008 № 489); вони мають рекомендаційний характер.
import { fmtMoney } from './documentLogic';
import { TS_CODES } from './timesheet';

const MONTHS = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень',
  'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'];
export const periodLabel = (period) => {
  const [y, m] = String(period).split('-').map(Number);
  return `${MONTHS[m - 1] || ''} ${y} р.`;
};
const dots = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('.') : '');
const today = () => dots(new Date().toISOString().slice(0, 10));
const h = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const page = (title, body, landscape = false) => `<!DOCTYPE html><html lang="uk"><head><meta charset="UTF-8"><title>${h(title)}</title>
<style>
body{font-family:Arial,sans-serif;font-size:11px;margin:16px;color:#111}
h2{font-size:15px;text-align:center;margin:6px 0}h3{font-size:12px;text-align:center;margin:2px 0;font-weight:normal}
table{border-collapse:collapse;width:100%;margin-top:10px}
th,td{border:1px solid #333;padding:2px 3px;text-align:center}
td.l,th.l{text-align:left}td.r{text-align:right;white-space:nowrap}
.we{background:#e8e8e8}.small{font-size:9px;color:#444}.sig{margin-top:28px;display:flex;justify-content:space-between}
.form-ref{text-align:right;font-size:9px;color:#444}
@page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:10mm}
</style></head><body>${body}</body></html>`;

const fopLine = (fop) => `ФОП ${h(fop?.fullName || '')}, РНОКПП ${h(fop?.rnokpp || '')}`;

// ─── Табель обліку робочого часу ──────────────────────────────────
export const buildTimesheetHtml = ({ sheets, period, fop }) => {
  const n = sheets[0]?.days.length || 31;
  const dayHead = Array.from({ length: n }, (_, i) =>
    `<th class="${sheets[0]?.days[i]?.weekend ? 'we' : ''}">${i + 1}</th>`).join('');
  const rows = sheets.map((t, i) => `<tr>
<td>${i + 1}</td><td class="l">${h(t.employee.fullName)}<br><span class="small">${h(t.employee.position || '')}</span></td>
${t.days.map(d => `<td class="${d.weekend ? 'we' : ''}">${d.off ? '×' : d.code ? `${d.code}${d.hours ? `<br>${d.hours}` : ''}` : ''}</td>`).join('')}
<td>${t.workDays}</td><td>${t.hours}</td><td>${t.annual || ''}</td><td>${t.unpaid || ''}</td><td>${t.sick || ''}</td>
</tr>`).join('');
  return page(`Табель ${period}`, `
<div class="form-ref">За типовою формою № П-5</div>
<h3>${fopLine(fop)}</h3>
<h2>ТАБЕЛЬ ОБЛІКУ ВИКОРИСТАННЯ РОБОЧОГО ЧАСУ</h2>
<h3>за ${periodLabel(period)}</h3>
<table>
<thead><tr><th rowspan="2">№</th><th rowspan="2" class="l">ПІБ, посада</th><th colspan="${n}">Числа місяця: позначка і години</th>
<th colspan="2">Відпрацьовано</th><th colspan="3">Неявки, календарних днів</th></tr>
<tr>${dayHead}<th>днів</th><th>годин</th><th>${TS_CODES.annual}</th><th>${TS_CODES.unpaid}</th><th>${TS_CODES.sick}</th></tr></thead>
<tbody>${rows}</tbody></table>
<p class="small">Позначки: Р — години роботи; В — щорічна основна відпустка; НА — відпустка без збереження заробітної плати
за згодою сторін; ТН — оплачувана тимчасова непрацездатність; × — не перебував у трудових відносинах. Вихідні дні затемнено.</p>
<div class="sig"><div>Відповідальна особа ___________________</div><div>ФОП ___________________ ${h(fop?.fullName || '')}</div><div>${today()}</div></div>`, true);
};

// ─── Розрахунково-платіжна відомість ──────────────────────────────
export const buildPayrollSheetHtml = ({ records, employees, period, fop }) => {
  const cols = [
    // оклад за відпрацьований час = усе нараховане мінус решта складових
    ['Оклад за відпрац. час', r => (+r.totalGross || 0) - (+r.indexationAmount || 0) - (+r.leavePayAmount || 0)
      - (+r.compensationAmount || 0) - (+r.sickPayAmount || 0) - (+r.sickPfuAmount || 0) - (+r.otherAccruals || 0)],
    ['Індексація', r => +r.indexationAmount || 0],
    ['Відпускні', r => (+r.leavePayAmount || 0) + (+r.compensationAmount || 0)],
    ['Лікарняні (роботодавець)', r => +r.sickPayAmount || 0],
    ['Лікарняні (ПФУ)', r => +r.sickPfuAmount || 0],
    ['Інші нарахування', r => +r.otherAccruals || 0],
    ['Усього нараховано', r => +r.totalGross || 0],
    ['ПДФО', r => +r.pdfo || 0],
    ['ВЗ', r => +r.vz || 0],
    ['Інші утримання', r => +r.totalDeductions || 0],
    ['Аванс', r => +r.advanceAmount || 0],
    ['До виплати', r => (+r.netPay || 0) - (+r.advanceAmount || 0)],
    ['ЄСВ роботодавця', r => +r.esv || 0],
  ];
  const tot = cols.map(() => 0);
  const rows = records.map((r, i) => {
    const emp = employees.find(e => e.id === r.employeeId);
    return `<tr><td>${i + 1}</td><td class="l">${h(emp?.fullName || '—')}<br><span class="small">${h(emp?.position || '')}</span></td>
${cols.map(([, f], k) => { const v = Math.round(f(r) * 100) / 100; tot[k] += v; return `<td class="r">${v ? fmtMoney(v) : ''}</td>`; }).join('')}
<td style="min-width:60px"></td></tr>`;
  }).join('');
  return page(`Відомість ${period}`, `
<div class="form-ref">За типовою формою № П-6</div>
<h3>${fopLine(fop)}</h3>
<h2>РОЗРАХУНКОВО-ПЛАТІЖНА ВІДОМІСТЬ</h2>
<h3>за ${periodLabel(period)}</h3>
<table><thead><tr><th>№</th><th class="l">ПІБ, посада</th>${cols.map(([c]) => `<th>${c}</th>`).join('')}<th>Підпис</th></tr></thead>
<tbody>${rows}
<tr><td colspan="2" class="l"><b>Разом</b></td>${tot.map(v => `<td class="r"><b>${v ? fmtMoney(v) : ''}</b></td>`).join('')}<td></td></tr>
</tbody></table>
<div class="sig"><div>Склав ___________________</div><div>ФОП ___________________ ${h(fop?.fullName || '')}</div><div>${today()}</div></div>`, true);
};

// ─── Повідомлення про прийняття працівника на роботу ──────────────
export const buildHireNoticeHtml = ({ rows, fop }) => page('Повідомлення про прийняття працівника', `
<div class="form-ref">Додаток 1 до постанови Кабінету Міністрів України від 17 червня 2015 р. № 413<br>
(в редакції постанови від 21 лютого 2025 р. № 184)</div>
<h2>ПОВІДОМЛЕННЯ<br>про прийняття працівника (домашнього працівника) на роботу / укладення гіг-контракту</h2>
<p>1. Тип: <b>початкове</b> &nbsp; 2. Податковий номер роботодавця: <b>${h(fop?.rnokpp || '')}</b><br>
3. Роботодавець: <b>${h(fop?.fullName || '')}</b></p>
<table><thead><tr><th>4. № з/п</th><th>5. Категорія особи</th><th>6. Податковий номер</th><th>7. Номер запису в ЄДДР</th>
<th class="l">8. Прізвище, ім'я, по батькові</th><th>9. Громадянство</th><th>10. Номер наказу</th><th>11. Дата наказу</th><th>12. Дата початку роботи</th></tr></thead>
<tbody>${rows.map((x, i) => `<tr><td>${i + 1}</td><td>${x.category || 1}</td><td>${h(x.tin)}</td><td></td>
<td class="l">${h([x.last, x.first, x.middle].filter(Boolean).join(' '))}</td><td>${x.citizen === 0 ? 0 : 1}</td>
<td>${h(x.orderNumber)}</td><td>${dots(x.orderDate)}</td><td>${dots(x.startDate)}</td></tr>`).join('')}</tbody></table>
<p class="small">Категорія особи: 1 — наймані працівники за основним місцем роботи; 2 — працівники за сумісництвом.
Громадянство: 1 — громадянин України; 0 — іноземець або особа без громадянства.</p>
<p>13. Дата формування: ${today()}</p>
<div class="sig"><div>14. ФОП ___________________ ${h(fop?.fullName || '')} (${h(fop?.rnokpp || '')})</div></div>`, true);

// ─── Розрахунок лікарняних ────────────────────────────────────────
export const buildSickCalcHtml = ({ record, employee, fop }) => page('Розрахунок лікарняних', `
<h3>${fopLine(fop)}</h3>
<h2>РОЗРАХУНОК ОПЛАТИ ТИМЧАСОВОЇ НЕПРАЦЕЗДАТНОСТІ</h2>
<h3>${h(employee?.fullName || '')}, РНОКПП ${h(employee?.rnokpp || '')}, за ${periodLabel(record.period)}</h3>
<table>
<tr><td class="l">Середньоденна заробітна плата, грн</td><td class="r">${fmtMoney(record.sickDailyRate)}</td></tr>
<tr><td class="l">Відсоток за страховим стажем</td><td class="r">${+record.sickPayPercent || 100} %</td></tr>
<tr><td class="l">Денна виплата, грн</td><td class="r">${fmtMoney((+record.sickDailyRate || 0) * (+record.sickPayPercent || 100) / 100)}</td></tr>
<tr><td class="l">Календарних днів непрацездатності в місяці</td><td class="r">${+record.sickDays || 0}</td></tr>
<tr><td class="l">Оплата перших п'яти днів коштом роботодавця, грн</td><td class="r">${fmtMoney(record.sickPayAmount)}</td></tr>
<tr><td class="l">Допомога з шостого дня коштом Пенсійного фонду, грн</td><td class="r">${fmtMoney(record.sickPfuAmount)}</td></tr>
<tr><td class="l"><b>Разом, грн</b></td><td class="r"><b>${fmtMoney((+record.sickPayAmount || 0) + (+record.sickPfuAmount || 0))}</b></td></tr>
</table>
<p class="small">Середню обчислено за Порядком, затвердженим постановою Кабінету Міністрів України від 26.09.2001 № 1266.
Суму допомоги коштом Пенсійного фонду роботодавець заявляє у заяві-розрахунку на вебпорталі електронних послуг ПФУ.</p>
<div class="sig"><div>Розрахунок склав ___________________</div><div>${today()}</div></div>`);

// ─── Звіт про внесок на підтримку працевлаштування осіб з інвалідністю ──
export const buildDisabilityHtml = ({ calc, fop }) => {
  const v = (x) => (calc.isPayer ? x : '—');
  return page('Звіт про внесок', `
<div class="form-ref">Форма затверджена наказом Міністерства фінансів України від 25.08.2026 № 453 (F0500701)</div>
<h2>ЗВІТ<br>про нарахування, обчислення та сплату внеску на підтримку працевлаштування осіб з інвалідністю</h2>
<p>01. Тип: <b>Звітний</b> &nbsp; 02. Звітний період: <b>${calc.year} рік, ${calc.quarter} квартал</b><br>
03. Роботодавець / платник: <b>${h(fop?.fullName || '')}</b> &nbsp; 04. Податковий номер: <b>${h(fop?.rnokpp || '')}</b><br>
06. ${h(fop?.zipCode || '')} ${h(fop?.legalAddress || '')} ${h(fop?.phone || '')} ${h(fop?.email || '')}<br>
07. Звіт подається до: ${h(fop?.dpsName || '')} &nbsp; 08. КВЕД: ${h(fop?.mainKved || '')}<br>
09. Категорія платника внеску: ${calc.isPayer ? (calc.category === '091' ? '091 — від 8 до 25 працівників' : '092 — понад 25 працівників') : '—'}</p>
<table>
<tr><th colspan="3" class="l">І. Розрахунок нормативу робочих місць</th></tr>
<tr><td>1</td><td class="l">Середньооблікова кількість штатних працівників</td><td class="r">${v(calc.headcount)}</td></tr>
<tr><td>2</td><td class="l">Зовнішні сумісники в еквіваленті повної зайнятості</td><td class="r">${v(calc.partTimers)}</td></tr>
<tr><td>3</td><td class="l">Норматив робочих місць для працевлаштування осіб з інвалідністю</td><td class="r">${v(calc.norm)}</td></tr>
<tr><td>4</td><td class="l">Середньооблікова кількість штатних працівників з інвалідністю</td><td class="r">${v(calc.withDisability)}</td></tr>
<tr><td>4.1</td><td class="l">з них І групи та/або ІІ групи з порушенням зору чи психічними розладами</td><td class="r">${v(calc.heavy)}</td></tr>
<tr><td>5</td><td class="l">Різниця між нормативом і кількістю працівників з інвалідністю</td><td class="r">${v(calc.gap)}</td></tr>
<tr><th colspan="3" class="l">ІІ. Обчислення та нарахування внеску, грн</th></tr>
<tr><td>1</td><td class="l">Нарахована заробітна плата за звітний період</td><td class="r">${calc.isPayer ? fmtMoney(calc.wages) : '—'}</td></tr>
<tr><td>2</td><td class="l">Середньомісячна заробітна плата на одного працівника</td><td class="r">${calc.isPayer ? fmtMoney(calc.avgWage) : '—'}</td></tr>
<tr><td>3</td><td class="l">Сума внеску, що підлягає сплаті</td><td class="r"><b>${calc.isPayer ? fmtMoney(calc.contribution) : '—'}</b></td></tr>
</table>
<p class="small">Рядок 3 розділу ІІ = 40 % × рядок 2 × 3 місяці × рядок 5 розділу І${calc.martialLaw ? ' × 50 % (на час воєнного стану)' : ''}.</p>
<div class="sig"><div>ФОП ___________________ ${h(fop?.fullName || '')}</div><div>${today()}</div></div>`);
};
