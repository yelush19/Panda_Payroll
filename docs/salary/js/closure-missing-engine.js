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
    'טרם תחילת עבודה',     // מיכאל קייטלין - לפני start_date
    'לפני תחילת עבודה',
    'אחרי סיום עבודה',
    'לפני קליטה',
  ];

  // אם events.miluim >= הסף הזה - העובד במילואים ממושכים והדיווח היומי
  // עשוי לא לכלול תיוג 'מילואים' פר-יום. נחריג אותו לחלוטין מהדוח.
  const MILUIM_EXTENDED_THRESHOLD_DAYS = 15;

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

  // האם תאריך הוא חג ידוע מ-MonthConfig.HOLIDAYS_BY_YEAR?
  // משמש לתפיסת מקרים שבהם Meckano תייגה יום חג כ"יום חול" בטעות.
  function isKnownHoliday(year, month, dayNumber) {
    if (typeof MonthConfig === 'undefined' || !MonthConfig.HOLIDAYS_BY_YEAR) return false;
    const dateStr = year + '-' + String(month).padStart(2, '0') + '-' + String(dayNumber).padStart(2, '0');
    const yearHolidays = MonthConfig.HOLIDAYS_BY_YEAR[year] || {};
    return !!yearHolidays[dateStr];
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
      // אם התאריך הוא חג ידוע - להחריג. (Meckano מתייגת לפעמים חג כ"יום חול".)
      if (isKnownHoliday(periodYear, periodMonth, d.day_number)) return;
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
      employee_name:  block.employee_name || (employee && employee.full_name) || '',
      department:     (employee && employee.department) ? employee.department : (block.department || ''),
      employee_type:  employee && employee.employee_type ? employee.employee_type : 'גלובלי',
      issues,
    };
  }

  function build(parsedBlocks, employeesIndex, periodYear, periodMonth) {
    const empByNo = {};
    (employeesIndex || []).forEach(e => { empByNo[String(e.employee_no)] = e; });

    const rows = [];
    const excluded     = []; // הוחרג בוודאות (קבלן / מנכ"ל / תאונה מלאה)
    const needsReview  = []; // מקרים שדורשים אישור משתמשת לפני סגירה

    parsedBlocks.forEach(block => {
      const emp = empByNo[String(block.employee_no)] || null;
      const empType = emp && emp.employee_type ? emp.employee_type : null;
      const empName = block.employee_name || (emp && emp.full_name) || '';

      // החרגה אחידה - אותה לוגיקה כמו days-summary (משותף ב-employee-rules.js)
      const exclusion = (typeof EmployeeRules !== 'undefined' && EmployeeRules.shouldExcludeFromClosureCheck)
        ? EmployeeRules.shouldExcludeFromClosureCheck(block, emp, periodYear, periodMonth)
        : { exclude: false };
      if (exclusion.exclude) {
        excluded.push({
          employee_no: block.employee_no,
          employee_name: empName,
          reason: exclusion.reason,
        });
        return;
      }

      // הערה ידנית בכותרות הבלוק - דורש בדיקה (יילנה כתבה משהו ב-Meckano)
      const hasAnnotation = block.unknown_columns && block.unknown_columns.length > 0;
      let events = block.events || {};

      // החלת תיקונים ידניים מ-ManualAdjustmentsStore
      let manualAdjustments = {};
      if (typeof ManualAdjustmentsStore !== 'undefined' && typeof EmployeeRules !== 'undefined' && EmployeeRules.applyAdjustmentsToEvents) {
        const period = ManualAdjustmentsStore.periodKey(periodYear, periodMonth);
        manualAdjustments = ManualAdjustmentsStore.aggregateForEmployee(block.employee_no, period);
        if (Object.keys(manualAdjustments).length > 0) {
          events = EmployeeRules.applyAdjustmentsToEvents(events, manualAdjustments);
        }
      }

      // הפקת הדוח לעובד
      const r = buildEmployeeReport(block, emp, periodYear, periodMonth);
      const daysPresent = (block.summary && block.summary.days_present) || 0;

      // "תקציב הסבר" - ימי חל"ת + היעדרות שמופיעים בסיכום החודשי גם אם לא
      // מתויגים פר-יום. אם מספר הימים החסרים <= תקציב, אנחנו מניחים שהם
      // הוסברו ע"י הסיכום ולא מתריעים. (תפס מקרים כמו לוי דביש שיש לו
      // events.absence=2 והדיווח היומי ריק.)
      const explainBudget = (events.chalat || 0) + (events.absence || 0);
      if (r.issues.length > 0 && r.issues.length <= explainBudget) {
        excluded.push({
          employee_no: block.employee_no,
          employee_name: empName,
          reason: 'ימים חסרים מוסברים בסיכום (חל"ת=' + (events.chalat||0) + ', היעדרות=' + (events.absence||0) + ')',
        });
        return;
      }

      // 6. אין סוג עובד הוגדר באינדקס + days_present=0 → דורש בדיקה (לא לסגור אוטומטית)
      if (!empType && daysPresent === 0) {
        needsReview.push({
          employee_no: block.employee_no,
          employee_name: empName,
          reason: 'לא ניקב כלל ולא הוגדר סוג עובד באינדקס. סמני סוג / סטטוס מיוחד.',
          potential_issues: r.issues.length,
        });
        return;
      }

      // 7. אין סוג עובד הוגדר + הערה ידנית בבלוק → דורש בדיקה
      if (!empType && hasAnnotation) {
        needsReview.push({
          employee_no: block.employee_no,
          employee_name: empName,
          reason: 'הערה ידנית בכותרות הבלוק: ' + block.unknown_columns.map(u => u.value).join(' | '),
          potential_issues: r.issues.length,
        });
        return;
      }

      if (r.issues.length > 0) rows.push(r);
    });

    rows.sort((a, b) => b.issues.length - a.issues.length);

    const totalDays = rows.reduce((s, r) => s + r.issues.length, 0);

    return {
      period: { year: periodYear, month: periodMonth },
      total_employees_with_issues: rows.length,
      total_days_missing: totalDays,
      rows: rows,
      excluded: excluded,
      needs_review: needsReview,
      generated_at: new Date().toISOString(),
    };
  }

  return { build, isClosureMissing, COVERING_EVENTS, MILUIM_EXTENDED_THRESHOLD_DAYS };
})();
