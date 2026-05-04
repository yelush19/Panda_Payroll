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

  // ===== תאונת עבודה - חוקים מיוחדים =====
  // כשעובד בתאונת עבודה, ה-12 הימים הראשונים משולמים ע"י המעסיק.
  // מהיום ה-13 ואילך - הביטוח הלאומי משלם ישירות לעובד.
  // התאונה יכולה להיות יותר מחודש - חיוני לעקוב אחרי התאריך ההתחלתי
  // ב-special_status_from של האינדקס המרכזי, ולחשב ימים מצטברים על פני חודשים.
  const WORK_ACCIDENT_NII_THRESHOLD_DAYS = 12;

  // מחזיר אובייקט עם מצב תאונת עבודה לעובד בחודש מסוים.
  // employee:    אובייקט מהאינדקס המרכזי (special_status, special_status_from, special_status_to)
  // periodYear/Month: החודש שמעבדים (1-12)
  // מחזיר:       { isActive, daysFromStartTotal, daysInThisMonth, paidByEmployer, paidByNII, daysToEmployerInMonth, daysToNIIInMonth }
  function calculateWorkAccidentStatus(employee, periodYear, periodMonth) {
    if (!employee || employee.special_status !== 'תאונת עבודה') {
      return { isActive: false };
    }
    const fromStr = employee.special_status_from;
    const toStr   = employee.special_status_to;
    if (!fromStr) return { isActive: false, missing_from_date: true };

    const startDate = new Date(fromStr);
    if (isNaN(startDate.getTime())) return { isActive: false, invalid_from_date: true };

    // טווח החודש המעובד
    const periodStart = new Date(periodYear, periodMonth - 1, 1);
    const periodEnd   = new Date(periodYear, periodMonth, 0); // יום אחרון בחודש

    // האם התאונה חופפת את החודש?
    const endDate = toStr ? new Date(toStr) : null;
    if (endDate && endDate < periodStart) return { isActive: false, ended_before_period: true };
    if (startDate > periodEnd) return { isActive: false, starts_after_period: true };

    // ימים בחודש המעובד שבהם התאונה פעילה
    const overlapStart = startDate > periodStart ? startDate : periodStart;
    const overlapEnd   = (endDate && endDate < periodEnd) ? endDate : periodEnd;
    const daysInThisMonth = daysBetween(overlapStart, overlapEnd) + 1;

    // ימים מצטברים מתחילת התאונה עד תום ה-overlap (לקביעת מתי עוברים את הסף)
    const daysFromStartToOverlapEnd = daysBetween(startDate, overlapEnd) + 1;
    const daysFromStartToOverlapStart = daysBetween(startDate, overlapStart); // 0 אם החודש מתחיל בתאונה

    // חלוקה בין מעסיק לב"ל בחודש המעובד
    let daysToEmployerInMonth = 0, daysToNIIInMonth = 0;
    if (daysFromStartToOverlapEnd <= WORK_ACCIDENT_NII_THRESHOLD_DAYS) {
      // הכל עוד בטווח של 12 הימים הראשונים → מעסיק משלם
      daysToEmployerInMonth = daysInThisMonth;
    } else if (daysFromStartToOverlapStart >= WORK_ACCIDENT_NII_THRESHOLD_DAYS) {
      // עברנו את הסף לפני שהחודש התחיל → ב"ל משלם הכל
      daysToNIIInMonth = daysInThisMonth;
    } else {
      // הסף נופל באמצע החודש - חלוקה
      daysToEmployerInMonth = WORK_ACCIDENT_NII_THRESHOLD_DAYS - daysFromStartToOverlapStart;
      daysToNIIInMonth = daysInThisMonth - daysToEmployerInMonth;
    }

    return {
      isActive: true,
      from_date: fromStr,
      to_date:   toStr || null,
      days_from_start_total:    daysFromStartToOverlapEnd,
      days_in_this_month:       daysInThisMonth,
      days_paid_by_employer_in_month: daysToEmployerInMonth,
      days_paid_by_nii_in_month:      daysToNIIInMonth,
      passed_nii_threshold: daysFromStartToOverlapEnd > WORK_ACCIDENT_NII_THRESHOLD_DAYS,
    };
  }

  function daysBetween(a, b) {
    const ms = 1000 * 60 * 60 * 24;
    return Math.floor((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
                       Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / ms);
  }

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

  return {
    getRules, shouldIncludeInReport, listTypes,
    calculateWorkAccidentStatus,
    WORK_ACCIDENT_NII_THRESHOLD_DAYS,
    RULES, DEFAULT_TYPE,
  };
})();
