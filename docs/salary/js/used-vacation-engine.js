// used-vacation-engine.js
// מנוע הפקת "דוח 4: חופשה מנוצלת" - פירוט חופשה לחיוב לכל עובד.
//
// עמודות (לפי הגיליון הידני '6.חופשה מנוצלת'):
//   שם עובד | חופש קיים | חופש בע.חג | חופש בחוה"מ | חופשה לחיוב | פירוט

window.UsedVacationEngine = (function() {
  'use strict';

  const COLUMNS = [
    { key: 'employee_no',       label: "מס' עובד" },
    { key: 'employee_name',     label: 'שם עובד' },
    { key: 'department',        label: 'מחלקה' },
    { key: 'vacation_existing', label: 'חופש קיים' },
    { key: 'vacation_eve',      label: 'חופש בע.חג' },
    { key: 'vacation_chm',      label: 'חופש בחוה"מ' },
    { key: 'vacation_charged',  label: 'חופשה לחיוב' },
    { key: 'detail',            label: 'פירוט' },
  ];

  function dayLabel(d) {
    return (d.day_letter || '?') + ' - ' + String(d.day_number || 0).padStart(2, '0');
  }

  function buildDetail(days, vacExisting, vacEve, vacChm) {
    const parts = [];

    // ימי 'חופש' מלא
    days.forEach(d => {
      const event = String(d.event || '').trim();
      if (event === 'חופש' || event === 'חופשה לחיוב' || event === 'חופשה מרוכזת') {
        parts.push(dayLabel(d) + ': ' + event + ' -1');
      }
    });

    // ימי ערב חג שלא עבד בהם וללא אירוע חוסם
    days.forEach(d => {
      const sug = String(d.day_type || '').trim();
      if (sug !== 'ערב חג') return;
      if (isWorked(d)) return;
      if (hasBlockingEvent(d)) return;
      parts.push(dayLabel(d) + ': ע.חג -0.5');
    });

    // ימי חוה"מ שלא עבד בהם וללא אירוע חוסם
    days.forEach(d => {
      const sug = String(d.day_type || '').trim();
      if (sug !== 'חול המועד') return;
      if (isWorked(d)) return;
      if (hasBlockingEvent(d)) return;
      parts.push(dayLabel(d) + ': חוה"מ -1');
    });

    return parts.join('; ');
  }

  function isWorked(d) {
    return !!String(d.entry || '').trim() || !!String(d.exit || '').trim();
  }

  const VACATION_BLOCKERS = ['חופש','חל"ת','מילואים','מחלה','תאונת עבודה','חופש ללא תשלום','היעדרות'];
  function hasBlockingEvent(d) {
    const e = String(d.event || '').trim();
    if (!e) return false;
    return VACATION_BLOCKERS.some(b => e.indexOf(b) !== -1);
  }

  function build(parsedBlocks, employeesIndex, periodYear, periodMonth) {
    const empByNo = {};
    (employeesIndex || []).forEach(e => { empByNo[String(e.employee_no)] = e; });

    const rows = [];

    parsedBlocks.forEach(block => {
      const emp = empByNo[String(block.employee_no)] || null;
      const empType = emp && emp.employee_type ? emp.employee_type : 'גלובלי';
      const rules = (typeof EmployeeRules !== 'undefined') ? EmployeeRules.getRules(empType) : null;

      // קבלנים לא רלוונטיים לחופשה
      if (rules && rules.apply_vacation_kizuz === false && empType === 'קבלן') return;

      const events = block.events || {};
      const days   = block.days   || [];

      // עדיפות לערכים מ-Meckano. אם אין - חישוב מהימים.
      let vacExisting = events.vacation_existing;
      let vacEve      = events.vacation_eve;
      let vacChm      = events.vacation_chm;
      let vacCharged  = events.vacation_charged;

      if (vacExisting === null || vacExisting === undefined) vacExisting = 0;
      if (vacEve === null || vacEve === undefined) {
        vacEve = (typeof EmployeeRules !== 'undefined') ? EmployeeRules.countVacationOnEveHolidays(days) : 0;
      }
      if (vacChm === null || vacChm === undefined) {
        vacChm = (typeof EmployeeRules !== 'undefined') ? EmployeeRules.countVacationOnCholHaMoed(days) : 0;
      }
      if (vacCharged === null || vacCharged === undefined) {
        vacCharged = vacExisting + vacEve + vacChm;
      }

      // הצגה: גם אם אין חופשה כלל - להראות שורה (כדי שיהיה תיעוד)
      // אבל לסמן ב'פירוט' שאין חופשה
      let detail = buildDetail(days, vacExisting, vacEve, vacChm);
      if (!detail) {
        // האם לעובד יש סיבות אחרות שלא זימנו חופשה?
        const hasMiluim = (events.miluim || 0) > 0;
        const hasAccident = (events.work_accident || 0) > 0;
        if (hasMiluim && hasAccident) detail = 'תאונת עבודה / מילואים - לא רלוונטי';
        else if (hasMiluim) detail = 'מילואים - לא רלוונטי';
        else if (hasAccident) detail = 'תאונת עבודה - לא רלוונטי';
        else detail = '—';
      }

      rows.push({
        employee_no:        block.employee_no,
        employee_name:      block.employee_name || (emp && emp.full_name) || '',
        department:         (emp && emp.department) ? emp.department : (block.department || ''),
        vacation_existing:  vacExisting,
        vacation_eve:       vacEve,
        vacation_chm:       vacChm,
        vacation_charged:   vacCharged,
        detail:             detail,
        _employee_type:     empType,
      });
    });

    rows.sort((a, b) => {
      const na = parseInt(a.employee_no, 10), nb = parseInt(b.employee_no, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return String(a.employee_no).localeCompare(String(b.employee_no));
    });

    return {
      columns: COLUMNS,
      rows: rows,
      period: { year: periodYear, month: periodMonth },
      total_employees: rows.length,
      total_charged: rows.reduce((s, r) => s + (r.vacation_charged || 0), 0),
      generated_at: new Date().toISOString(),
    };
  }

  return { build, buildDetail, COLUMNS };
})();
