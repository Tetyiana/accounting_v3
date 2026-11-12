import React, { useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { useFop } from '../../context/FopContext';
import { buildTimesheet, TS_CODES } from '../../utils/timesheet';
import { buildTimesheetHtml } from '../../utils/payrollDocs';
import { openPrintWindow } from '../../utils/printWindow';

// Табель будується автоматично: робочі дні пн–пт по 8 годин, відпустки й лікарняні —
// із вкладки «Відпустки» (туди ж потрапляють відпустки з наказів), дати прийняття і звільнення — з картки.
const Timesheet = ({ period, setPeriod }) => {
  const { employees, leaveRecords } = useData();
  const { activeFop } = useFop();
  const sheets = useMemo(() => buildTimesheet(employees, period, leaveRecords), [employees, period, leaveRecords]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 14, flexWrap: 'wrap' }}>
        <div className="field">
          <label>Місяць</label>
          <input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ width: 160 }} />
        </div>
        <button className="btn btn--primary" disabled={!sheets.length}
          onClick={() => openPrintWindow(buildTimesheetHtml({ sheets, period, fop: activeFop }), { fop: activeFop })}>
          🖨 Друк табеля
        </button>
      </div>
      <p className="cell-muted" style={{ fontSize: '.83rem', marginBottom: 10 }}>
        Позначки: {TS_CODES.work} — робота, {TS_CODES.annual} — щорічна відпустка, {TS_CODES.unpaid} — відпустка
        без збереження зарплати, {TS_CODES.sick} — лікарняний. Щоб змінити табель, додайте відпустку
        або лікарняний на вкладці «Відпустки» чи наказом.
      </p>
      <div className="table-wrap">
        <table className="data-table" style={{ fontSize: '.78rem' }}>
          <thead>
            <tr>
              <th>Працівник</th>
              {(sheets[0]?.days || []).map(d => (
                <th key={d.d} style={{ padding: '4px 3px', textAlign: 'center', opacity: d.weekend ? .5 : 1 }}>{d.d}</th>
              ))}
              <th style={{ textAlign: 'right' }}>Днів</th>
              <th style={{ textAlign: 'right' }}>Годин</th>
            </tr>
          </thead>
          <tbody>
            {sheets.length === 0 ? (
              <tr><td colSpan={34} className="table-empty">У цьому місяці працівників немає</td></tr>
            ) : sheets.map(t => (
              <tr key={t.employee.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{t.employee.fullName}</td>
                {t.days.map(d => (
                  <td key={d.d} style={{
                    padding: '4px 3px', textAlign: 'center',
                    background: d.weekend ? 'var(--bg-muted, rgba(0,0,0,.05))' : undefined,
                    color: d.code && d.code !== TS_CODES.work ? 'var(--warning)' : undefined,
                  }}>{d.off ? '×' : d.code}</td>
                ))}
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{t.workDays}</td>
                <td style={{ textAlign: 'right' }}>{t.hours}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Timesheet;
