// employee-rules.js
// כללים עסקיים מבוססי סוג עובד - מקור-אמת מרכזי לכל המודולים.
// נטען ע"י דוח 1, דוח 2, מנוע החוקים (Phase F), המודולים הקיימים שיותאמו.
//
// חשוב: ה-employee_type מגיע מהאינדקס המרכזי (EmIndexStore) שמולא ידנית או דרך
// פעולה מרובה. כל מודול שמחיל חוקים חייב לקרוא קודם את הסוג ולהשתמש בכללים האלה.

window.EmployeeRules = (function() {
  'use strict';

  // הגדרת התנהגות פר סוג עובד
  // null = לא רלוונטי / לא לחשב / לא להציג בדוח
  const RULES = {
    'גלובלי': {
      label:                   'גלובלי',
      apply_vacation_kizuz:    true,    // קיזוז חופשה מימים משולמים
      apply_sick_kizuz:        true,    // קיזוז מחלה לפי חוק (1/0.5/0.5/0)
      apply_chalat_kizuz:      true,    // קיזוז חל"ת
      apply_absence_kizuz:     true,    // קיזוז היעדרות
      pay_holidays_separately: false,   // חגים כלולים בשכר הבסיסי
      check_closure_gap:       true,    // לבדוק חוסר סגירה (פער ≠ 0)
      include_in_days_report:  true,    // להופיע בדוח 1 (סיכום ימים)
      include_in_worksheet:    true,    // להופיע בדוח 2 (נייר עבודה)
      tracks_overtime:         true,    // עוקב 100/125/150
    },

    'שעתי': {
      label:                   'שעתי',
      apply_vacation_kizuz:    false,   // אין קיזוזי חופשה (משלם רק על ימי עבודה)
      apply_sick_kizuz:        false,   // אין קיזוזי מחלה
      apply_chalat_kizuz:      false,
      apply_absence_kizuz:     false,
      pay_holidays_separately: true,    // חגים משולמים בנפרד (ידנית)
      check_closure_gap:       false,   // אין בדיקת '22 ימים'
      include_in_days_report:  true,    // מופיע בדוח 1 אבל עם עמודות מצומצמות
      include_in_worksheet:    true,
      tracks_overtime:         true,    // 100% רלוונטי לשעתיים
    },

    'קבלן': {
      label:                   'קבלן',
      apply_vacation_kizuz:    false,
      apply_sick_kizuz:        false,
      apply_chalat_kizuz:      false,
      apply_absence_kizuz:     false,
      pay_holidays_separately: false,
      check_closure_gap:       false,
      include_in_days_report:  false,   // לא מופיע בדוחות הסיכום (חשבונית)
      include_in_worksheet:    false,
      tracks_overtime:         false,   // קבלן - רק שעות עבודה לחשבונית
    },

    'מנכ"ל': {
      label:                   'מנכ"ל',
      apply_vacation_kizuz:    true,
      apply_sick_kizuz:        true,
      apply_chalat_kizuz:      true,
      apply_absence_kizuz:     true,
      pay_holidays_separately: false,
      check_closure_gap:       false,   // פטור מבדיקת חוסר סגירה
      include_in_days_report:  true,
      include_in_worksheet:    true,
      tracks_overtime:         false,
    },

    'פרויקט': {
      label:                   'פרויקט',
      apply_vacation_kizuz:    true,
      apply_sick_kizuz:        true,
      apply_chalat_kizuz:      true,
      apply_absence_kizuz:     true,
      pay_holidays_separately: false,
      check_closure_gap:       false,   // פטור מבדיקת חוסר סגירה
      include_in_days_report:  true,
      include_in_worksheet:    true,
      tracks_overtime:         true,
    },
  };

  // ברירת מחדל - אם הסוג לא הוגדר, מתנהג כמו 'גלובלי' (החמורה ביותר)
  const DEFAULT_TYPE = 'גלובלי';

  function getRules(employeeType) {
    if (!employeeType || !RULES[employeeType]) return RULES[DEFAULT_TYPE];
    return RULES[employeeType];
  }

  // בדיקה האם עובד אמור להיכלל בדוח X לפי סוגו
  function shouldIncludeInReport(employeeType, reportKey) {
    const r = getRules(employeeType);
    return !!r[reportKey];
  }

  // עזר: רשימת כל סוגי העובד הידועים
  function listTypes() { return Object.keys(RULES); }

  return { getRules, shouldIncludeInReport, listTypes, RULES, DEFAULT_TYPE };
})();
