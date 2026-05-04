// reserve-periods-engine.js
// חילוץ ימי מילואים מבלוקי Meckano + איחוד לתקופות רצופות.
//
// קלט:  parsedBlocks (מ-MeckanoReportParser), year, month
// פלט:  { raw: [...], periods: [...], stats: {...} }
//
// raw     = רשימת ימי מילואים (יום-יום) עם פרטי העובד
// periods = איחוד ימים רצופים לתקופות (שני ימים = רצופים אם הפרש קלנדרי ≤ 1)
// stats   = סיכום: מס' עובדים, סה"כ ימים, סה"כ תקופות

window.ReservePeriodsEngine = (function() {
  'use strict';

  // האם היום הוא יום מילואים? בודק את עמודת event ב-Meckano.
  function isReserveDay(d) {
    if (!d) return false;
    const event = String(d.event || '').trim();
    return event.indexOf('מילואים') !== -1;
  }

  // המרת day_number + year/month לאובייקט Date
  function toDate(year, month, dayNumber) {
    return new Date(year, month - 1, dayNumber);
  }

  // ספירת ימי א-ה בטווח (Sunday=0..Thursday=4 ב-JS, סופ"ש = Friday=5, Saturday=6)
  function countWorkDays(startDate, endDate) {
    let count = 0;
    const cur = new Date(startDate);
    while (cur <= endDate) {
      const dow = cur.getDay();
      if (dow !== 5 && dow !== 6) count++;
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  }

  // איחוד ימים רצופים לתקופות. days = מערך ממוין של {date: Date, ...}
  // רצופים = הפרש קלנדרי ≤ 1 יום (כלומר היום הבא או היום הסמוך). סופ"ש לא קוטע רצף.
  function groupConsecutive(days) {
    if (days.length === 0) return [];
    const periods = [];
    let cur = null;
    days.forEach(d => {
      if (!cur) {
        cur = { startDate: d.date, endDate: d.date, days: [d] };
      } else {
        // הפרש קלנדרי בימים מ-cur.endDate ל-d.date
        const diffMs = d.date - cur.endDate;
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays <= 3) {
          // עד 3 ימי הפרש - מוסיפים לאותה תקופה (בכדי שסופ"ש לא יקטע)
          cur.endDate = d.date;
          cur.days.push(d);
        } else {
          periods.push(cur);
          cur = { startDate: d.date, endDate: d.date, days: [d] };
        }
      }
    });
    if (cur) periods.push(cur);
    return periods;
  }

  function build(parsedBlocks, year, month) {
    const raw = [];

    parsedBlocks.forEach(block => {
      (block.days || []).forEach(d => {
        if (!isReserveDay(d)) return;
        raw.push({
          employee_no:   block.employee_no,
          employee_name: block.employee_name,
          national_id:   null,                       // יילקח מהאינדקס בעת shipping ל-Supabase
          department:    block.department || '',
          date:          toDate(year, month, d.day_number),
          date_str:      year + '-' + String(month).padStart(2,'0') + '-' + String(d.day_number).padStart(2,'0'),
          day_letter:    d.day_letter,
          day_number:    d.day_number,
          reserve_units: 1.0,                        // Meckano מסמן 1 ליום שלם
          source_event:  d.event,
        });
      });
    });

    // קיבוץ לפי עובד
    const byEmployee = {};
    raw.forEach(r => {
      if (!byEmployee[r.employee_no]) byEmployee[r.employee_no] = [];
      byEmployee[r.employee_no].push(r);
    });

    const periods = [];
    Object.entries(byEmployee).forEach(([empNo, days]) => {
      // מיון לפי תאריך
      days.sort((a, b) => a.date - b.date);
      const grouped = groupConsecutive(days);
      grouped.forEach(p => {
        const calendarDays = Math.round((p.endDate - p.startDate) / (1000*60*60*24)) + 1;
        const workDays    = countWorkDays(p.startDate, p.endDate);
        const weekendDays = calendarDays - workDays;
        periods.push({
          employee_no:    empNo,
          employee_name:  p.days[0].employee_name,
          department:     p.days[0].department,
          start_date:     toIsoDate(p.startDate),
          end_date:       toIsoDate(p.endDate),
          calendar_days:  calendarDays,
          work_days:      workDays,
          weekend_days:   weekendDays,
          days_in_meckano: p.days.length,             // כמה ימים סומנו בפועל ב-Meckano (כולל סופ"ש אם רלוונטי)
          source:         'meckano-monthly-' + year + '-' + String(month).padStart(2,'0'),
          status:         'draft',                    // יעלה ל-'submitted_to_bl' רק אחרי אישור משתמש
        });
      });
    });

    // מיון: לפי שם עובד ואז לפי תאריך התחלה
    periods.sort((a, b) => {
      const c = String(a.employee_name).localeCompare(String(b.employee_name), 'he');
      if (c !== 0) return c;
      return String(a.start_date).localeCompare(String(b.start_date));
    });

    const totalEmployees = Object.keys(byEmployee).length;
    const totalCalendarDays = periods.reduce((s, p) => s + p.calendar_days, 0);
    const totalWorkDays = periods.reduce((s, p) => s + p.work_days, 0);

    return {
      raw, periods,
      stats: {
        total_employees: totalEmployees,
        total_periods: periods.length,
        total_raw_days: raw.length,
        total_calendar_days: totalCalendarDays,
        total_work_days: totalWorkDays,
      },
      period: { year, month },
      generated_at: new Date().toISOString(),
    };
  }

  function toIsoDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  return { build, isReserveDay };
})();
