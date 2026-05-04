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

  // ===== חוקי שעתיים =====
  // עובד שעתי שלא משלים 42 שעות בשבוע - אין לו שעות נוספות (הכל 100%)
  const HOURLY_OVERTIME_WEEKLY_THRESHOLD_HOURS = 42;

  // עובד שעתי זכאי לתשלום ימי חג רק לאחר 3 חודשי וותק (חוק ישראלי)
  const HOURLY_HOLIDAY_PAY_TENURE_MONTHS = 3;

  function isHourlyEligibleForHolidayPay(employee, periodYear, periodMonth) {
    if (!employee || employee.employee_type !== 'שעתי') return false;
    if (!employee.start_date) return false; // לא נדע - לדרוש ידני
    const start = new Date(employee.start_date);
    if (isNaN(start.getTime())) return false;
    const periodStart = new Date(periodYear, periodMonth - 1, 1);
    const monthsDiff = (periodStart.getFullYear() - start.getFullYear()) * 12 +
                       (periodStart.getMonth() - start.getMonth());
    return monthsDiff >= HOURLY_HOLIDAY_PAY_TENURE_MONTHS;
  }

  // ===== ספירות מתוך נתונים יומיים (תואם נוסחאות אקסל המעודכנות) =====
  // חל"ת/היעדרות נספרים רק לימי עבודה - לא סופ"ש (תוקן ע"י יילנה ב-3 בלוקים).
  // הנוסחה המקבילה ב-Excel: SUMPRODUCT(--ISNUMBER(SEARCH("חל""ת",event))*(sug<>"סופ""ש"))

  function countEventOnBusinessDays(days, eventSubstring) {
    if (!Array.isArray(days)) return 0;
    let count = 0;
    days.forEach(d => {
      if (!d) return;
      const event = String(d.event || '').trim();
      const sug   = String(d.day_type || '').trim();
      if (sug === 'סופ"ש') return;                    // סופ"ש לא נספר
      if (event && event.indexOf(eventSubstring) !== -1) count++;
    });
    return count;
  }

  function countChalatBusinessDays(days)   { return countEventOnBusinessDays(days, 'חל"ת'); }
  function countAbsenceBusinessDays(days)  { return countEventOnBusinessDays(days, 'היעדרות'); }

  // ===== חופש בע.חג / חוה"מ =====
  // נספרים רק לימים ש:
  //  1. סוג היום הוא ערב חג / חול המועד
  //  2. אין כניסה ויציאה (לא עבד)
  //  3. אירוע אינו: חל"ת, מילואים, מחלה, תאונת עבודה, חופש ללא תשלום, היעדרות
  //  4. אירוע אינו "חופש" (נספר בנפרד כ-"חופש קיים" - אחרת ספירה כפולה)
  // חופש בע.חג: כל יום מתאים נספר כ-0.5; חופש בחוה"מ: כל יום נספר כ-1.

  const VACATION_DAY_EVENT_BLOCKERS = [
    'חופש',          // אם סומן 'חופש' זה כבר 'חופש קיים' - לא לספור פעמיים
    'חל"ת',
    'מילואים',
    'מחלה',
    'תאונת עבודה',
    'חופש ללא תשלום',
    'היעדרות',
  ];

  function isCleanNonWorkingDay(d) {
    const entry = String(d.entry || '').trim();
    const exit  = String(d.exit  || '').trim();
    if (entry || exit) return false;                  // עבד - לא נספר
    const event = String(d.event || '').trim();
    if (!event) return true;
    return !VACATION_DAY_EVENT_BLOCKERS.some(blocker => event.indexOf(blocker) !== -1);
  }

  function countVacationOnEveHolidays(days) {
    if (!Array.isArray(days)) return 0;
    let count = 0;
    days.forEach(d => {
      if (!d) return;
      const sug = String(d.day_type || '').trim();
      if (sug !== 'ערב חג') return;
      if (isCleanNonWorkingDay(d)) count++;
    });
    return count * 0.5;
  }

  function countVacationOnCholHaMoed(days) {
    if (!Array.isArray(days)) return 0;
    let count = 0;
    days.forEach(d => {
      if (!d) return;
      const sug = String(d.day_type || '').trim();
      if (sug !== 'חול המועד') return;
      if (isCleanNonWorkingDay(d)) count++;
    });
    return count * 1;
  }

  // ספירת ימי חג שמופיעים ביום מעובד (סוג=חג). שימושי לעובדים שעתיים שמקבלים חגים בנפרד.
  function countHolidayDaysFromBlock(days) {
    if (!Array.isArray(days)) return 0;
    let count = 0;
    days.forEach(d => {
      if (!d) return;
      const sug = String(d.day_type || '').trim();
      if (sug === 'חג') count++;
    });
    return count;
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
    countChalatBusinessDays,
    countAbsenceBusinessDays,
    countVacationOnEveHolidays,
    countVacationOnCholHaMoed,
    countHolidayDaysFromBlock,
    isHourlyEligibleForHolidayPay,
    HOURLY_OVERTIME_WEEKLY_THRESHOLD_HOURS,
    HOURLY_HOLIDAY_PAY_TENURE_MONTHS,
    WORK_ACCIDENT_NII_THRESHOLD_DAYS,
    RULES, DEFAULT_TYPE,
  };
})();
