// closure-missing-engine.js
// מנוע הפקת "דוח 3: חוסר סגירה" - עובדים עם ימים שאין בהם כניסה/יציאה
// וגם אין אירוע מסביר.
//
// מקור: בלוקי Meckano (מ-MeckanoReportParser) + אינדקס עובדים (לסינון לפי סוג).
// פלט: רשימת עובדים עם ימים בעייתיים, עם פירוט תאריכים ומה חסר.

window.ClosureMissingEngine = (function() {
  'use strict';

  // אירועים שמסבירים יום ללא כניסה/יציאה (לא חוסר סגירה)
  const COVERING_EVENTS = [
    'חופש',
    'חופשה לחיוב',
    'חופשה מרוכזת',
    'מחלה',
    'מילואים',
    'חל"ת',
    'היעדרות',
    'תאונת עבודה',
    'חופש ללא תשלום',
    'חופש בע.חג',
    'חופש בחוה"מ',
  ];

  // חוסר סגירה רלוונטי רק ל"יום חול" - ערב חג / חוה"מ ללא ניקוב נספרים
  // אוטומטית כחופש לחיוב ע"י Meckano (לפי הפעולה הידנית של יילנה).
  // סופ"ש וחג - לא רלוונטיים בכלל.
  const CLOSURE_RELEVANT_DAY_TYPES = ['יום חול'];

  function isCoveringEvent(eventStr) {
    if (!eventStr) return false;
    const trimmed = String(eventStr).trim();
    if (!trimmed) return false;
    return COVERING_EVENTS.some(e => trimmed.indexOf(e) !== -1);
  }

  function dayLabel(d) {
    return (d.day_letter || '?') + ' - ' + String(d.day_number || 0).padStart(2, '0');
  }

  function whatIsMissing(d) {
    const hasEntry = !!String(d.entry || '').trim();
    const hasExit  = !!String(d.exit  || '').trim();
    if (!hasEntry && !hasExit) return 'שניהם (כניסה ויציאה)';
    if (!hasEntry) return 'כניסה בלבד';
    if (!hasExit)  return 'יציאה בלבד';
    return null; // לא חסר
  }

  // האם ביום הזה יש חוסר סגירה?
  // תנאים:
  //   - סוג היום הוא יום עבודה רגיל (יום חול, ערב חג, חוה"מ - לא סופ"ש/חג)
  //   - יש כניסה/יציאה חסרים
  //   - אין אירוע שמסביר
  function isClosureMissing(d) {
    if (!d) return false;
    const sug = String(d.day_type || '').trim();
    if (!CLOSURE_RELEVANT_DAY_TYPES.includes(sug)) return false;
    const missing = whatIsMissing(d);
    if (!missing) return false;
    if (isCoveringEvent(d.event)) return false;
    return true;
  }

  function buildEmployeeReport(block, employee, periodYear, periodMonth) {
    const days = block.days || [];

    // ימים לפני start_date של העובד / אחרי end_date - לא נספרים
    const startDate = employee && employee.start_date ? new Date(employee.start_date) : null;
    const endDate   = employee && employee.end_date   ? new Date(employee.end_date)   : null;

    // ימים בתוך תקופת סטטוס מיוחד (חופשת לידה / חל"ת ארוך / וכד') - לא נספרים
    const ssFrom = employee && employee.special_status && employee.special_status_from
      ? new Date(employee.special_status_from) : null;
    const ssTo   = employee && employee.special_status && employee.special_status_to
      ? new Date(employee.special_status_to)   : null;

    function isInRange(dayNum, from, to) {
      if (!from && !to) return false;
      const d = new Date(periodYear, periodMonth - 1, dayNum);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    }
    function beforeStart(dayNum) {
      if (!startDate) return false;
      const d = new Date(periodYear, periodMonth - 1, dayNum);
      return d < startDate;
    }
    function afterEnd(dayNum) {
      if (!endDate) return false;
      const d = new Date(periodYear, periodMonth - 1, dayNum);
      return d > endDate;
    }

    const issues = [];
    days.forEach(d => {
      if (!isClosureMissing(d)) return;
      if (beforeStart(d.day_number)) return;
      if (afterEnd(d.day_number)) return;
      if (ssFrom || ssTo) {
        if (isInRange(d.day_number, ssFrom, ssTo)) return;
      }
      issues.push({
        day_label: dayLabel(d),
        day_type:  d.day_type,
        missing:   whatIsMissing(d),
        event:     d.event || '',
        note:      d.note  || '',
      });
    });

    return {
      employee_no:    block.employee_no,
      employee_name:  employee && employee.full_name ? employee.full_name : block.employee_name,
      department:     (employee && employee.department) ? employee.department : (block.department || ''),
      employee_type:  employee && employee.employee_type ? employee.employee_type : 'גלובלי',
      issues,
    };
  }

  function build(parsedBlocks, employeesIndex, periodYear, periodMonth) {
    const empByNo = {};
    (employeesIndex || []).forEach(e => { empByNo[String(e.employee_no)] = e; });

    const rows = [];
    const excluded = []; // עובדים שיוחרגו מהדוח (קבלנים / שעתיים / אינם פעילים)

    parsedBlocks.forEach(block => {
      const emp = empByNo[String(block.employee_no)] || null;
      const empType = emp && emp.employee_type ? emp.employee_type : 'גלובלי';
      const rules = (typeof EmployeeRules !== 'undefined') ? EmployeeRules.getRules(empType) : null;

      // דלג על מי שפטור מבדיקת חוסר סגירה (קבלן/שעתי/מנכ"ל/פרויקט)
      if (rules && rules.check_closure_gap === false) {
        excluded.push({
          employee_no: block.employee_no,
          employee_name: emp && emp.full_name ? emp.full_name : block.employee_name,
          reason: empType + ' - פטור מבדיקה'
        });
        return;
      }

      // דלג על תאונת עבודה מלאה לחודש
      const accident = (typeof EmployeeRules !== 'undefined' && emp)
        ? EmployeeRules.calculateWorkAccidentStatus(emp, periodYear, periodMonth)
        : { isActive: false };
      const maxWork = (typeof MonthConfig !== 'undefined') ? MonthConfig.calculateMaxWorkDays(periodYear, periodMonth) : 22;
      if (accident.isActive && accident.days_in_this_month >= maxWork - 1) {
        excluded.push({
          employee_no: block.employee_no,
          employee_name: emp && emp.full_name ? emp.full_name : block.employee_name,
          reason: 'תאונת עבודה לכל החודש'
        });
        return;
      }

      // דלג על עובדים שלא ניקבו ולו יום אחד בחודש (כנראה לא חייבים בדיווח שעון)
      const daysPresent = (block.summary && block.summary.days_present) || 0;
      if (daysPresent === 0) {
        excluded.push({
          employee_no: block.employee_no,
          employee_name: emp && emp.full_name ? emp.full_name : block.employee_name,
          reason: 'לא ניקב כלל בחודש (לבדוק - בעל תפקיד / חופשה ארוכה / עזיבה)'
        });
        return;
      }

      const r = buildEmployeeReport(block, emp, periodYear, periodMonth);
      if (r.issues.length > 0) rows.push(r);
    });

    // מיון: מי שיש לו יותר ימים חסרים - בראש
    rows.sort((a, b) => b.issues.length - a.issues.length);

    const totalDays = rows.reduce((s, r) => s + r.issues.length, 0);

    return {
      period: { year: periodYear, month: periodMonth },
      total_employees_with_issues: rows.length,
      total_days_missing: totalDays,
      rows: rows,
      excluded: excluded,
      generated_at: new Date().toISOString(),
    };
  }

  return { build, isClosureMissing, COVERING_EVENTS };
})();
