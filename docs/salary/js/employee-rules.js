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

  // ===== תוספת גלובלית בגין שעות נוספות =====
  // עובדים מסוימים מקבלים תוספת גלובלית קבועה שמכסה כמות שעות נוספות (סף).
  // הלוגיקה (לפי הסבר יילנה):
  //   1. אם total(125+150) <= threshold → כל השעות מועברות ל-100% (התוספת מכסה אותן).
  //   2. אם total(125+150) >  threshold → רק העודף נשאר ב-125/150,
  //      וההפצה פרופורציונלית לפי היחס המקורי.
  //
  // input:   reported125, reported150, reported100, threshold
  // output:  { effective_100, effective_125, effective_150, absorbed_by_bonus, total_extra }

  function applyGlobalBonusThreshold(reported125, reported150, reported100, threshold) {
    const r125 = Number(reported125) || 0;
    const r150 = Number(reported150) || 0;
    const r100 = Number(reported100) || 0;
    const t    = Number(threshold)   || 0;
    const totalExtra = r125 + r150;

    if (t <= 0) {
      return {
        effective_100: r100,
        effective_125: r125,
        effective_150: r150,
        absorbed_by_bonus: 0,
        total_extra: totalExtra,
      };
    }

    if (totalExtra <= t) {
      // כל ה-125/150 נבלעים בתוספת ועוברים ל-100%
      return {
        effective_100: round2(r100 + totalExtra),
        effective_125: 0,
        effective_150: 0,
        absorbed_by_bonus: round2(totalExtra),
        total_extra: round2(totalExtra),
      };
    }

    // יש עודף - מחלקים פרופורציונלי בין 125 ל-150
    const excess = totalExtra - t;
    const ratio125 = totalExtra > 0 ? r125 / totalExtra : 0;
    const ratio150 = totalExtra > 0 ? r150 / totalExtra : 0;
    return {
      effective_100: round2(r100 + t),
      effective_125: round2(excess * ratio125),
      effective_150: round2(excess * ratio150),
      absorbed_by_bonus: round2(t),
      total_extra: round2(totalExtra),
    };
  }

  function round2(n) { return parseFloat((+n || 0).toFixed(2)); }

  // ===== חוק רצף מחלה הישראלי =====
  // יום 1 ברצף מחלה = 1 יום קיזוז (0% תשלום)
  // ימים 2-3 ברצף = 0.5 קיזוז כל אחד (50% תשלום)
  // יום 4+ = 0 קיזוז (100% תשלום)
  //
  // רצף = ימים רצופים שסומנו 'מחלה'. סופי שבוע, חגים, ע.חג וחוה"מ באמצע
  // לא קוטעים את הספירה (אבל גם לא נחשבים כיום מחלה). רק יום אחר (עבודה/חופש/מילואים/וכו')
  // קוטע את הרצף ומאפס את הספירה.
  //
  // מחזיר: { total_kizuz, streaks: [{ start_day, end_day, length, kizuz }] }

  const NEUTRAL_DAY_TYPES = ['סופ"ש', 'חג', 'ערב חג', 'חול המועד'];

  function calculateSickKizuz(days) {
    if (!Array.isArray(days)) return { total_kizuz: 0, streaks: [] };
    // ודא סדר עולה לפי day_number (בלוקי Meckano כבר ממוינים, אבל ליתר ביטחון)
    const sorted = [...days].sort((a, b) => (a.day_number || 0) - (b.day_number || 0));

    let totalKizuz = 0;
    const streaks = [];
    let streakPos = 0;
    let currentStreak = null;

    sorted.forEach(d => {
      const sug = String(d.day_type || '').trim();
      const event = String(d.event || '').trim();
      const isSick = event.indexOf('מחלה') !== -1;
      const isNeutral = !isSick && NEUTRAL_DAY_TYPES.includes(sug);

      if (isSick) {
        streakPos++;
        let kizuz = 0;
        if (streakPos === 1) kizuz = 1.0;
        else if (streakPos === 2 || streakPos === 3) kizuz = 0.5;
        // streakPos >= 4 → kizuz = 0
        totalKizuz += kizuz;
        if (!currentStreak) {
          currentStreak = { start_day: d.day_number, end_day: d.day_number, length: 0, kizuz: 0, days: [] };
          streaks.push(currentStreak);
        }
        currentStreak.end_day = d.day_number;
        currentStreak.length++;
        currentStreak.kizuz = round2(currentStreak.kizuz + kizuz);
        currentStreak.days.push((d.day_letter || '') + '-' + String(d.day_number).padStart(2, '0'));
      } else if (isNeutral) {
        // שקוף - לא מתקדם, לא שובר
      } else {
        // יום אחר (עבודה רגילה / חופש / מילואים / וכו') - קוטע
        streakPos = 0;
        currentStreak = null;
      }
    });

    return { total_kizuz: round2(totalKizuz), streaks };
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

  // ===== חישוב ימי א-ה אפקטיביים פר-עובד (לוקח בחשבון start_date / end_date) =====
  // אם העובד התחיל / סיים באמצע החודש - max_work_days שלו קטן יותר.
  function effectiveMaxWorkDays(employee, periodYear, periodMonth) {
    if (typeof MonthConfig === 'undefined') return 22;
    const maxFull = MonthConfig.calculateMaxWorkDays(periodYear, periodMonth);
    if (!employee) return maxFull;

    const periodStart = new Date(periodYear, periodMonth - 1, 1);
    const periodEnd   = new Date(periodYear, periodMonth, 0);
    const start = employee.start_date ? new Date(employee.start_date) : null;
    const end   = employee.end_date   ? new Date(employee.end_date)   : null;

    let from = periodStart, to = periodEnd;
    if (start && start > periodStart) from = start;
    if (end   && end   < periodEnd)   to   = end;
    if (from > to) return 0;

    // אם הטווח האפקטיבי = החודש המלא, החזר את הספירה המוכנה
    if (from.getTime() === periodStart.getTime() && to.getTime() === periodEnd.getTime()) {
      return maxFull;
    }
    // ספירה ידנית של ימי א-ה (Sun=0..Thu=4) באזור האפקטיבי, פחות חגים
    let count = 0;
    const cur = new Date(from);
    const yearHolidays = (MonthConfig.HOLIDAYS_BY_YEAR && MonthConfig.HOLIDAYS_BY_YEAR[periodYear]) || {};
    while (cur <= to) {
      const dow = cur.getDay();
      if (dow !== 5 && dow !== 6) {
        const dateStr = cur.getFullYear() + '-' + String(cur.getMonth()+1).padStart(2,'0') + '-' + String(cur.getDate()).padStart(2,'0');
        if (!yearHolidays[dateStr]) count++;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  }

  // ===== החרגה אחידה מבדיקת חוסר סגירה (משותף ל-days-summary + closure-missing) =====
  // מחזיר { exclude: bool, reason: string } - אם exclude=true, להחריג את העובד
  // מבדיקת חוסר סגירה לחלוטין. בדיוק אותם תנאים עבור שני הדוחות.
  function shouldExcludeFromClosureCheck(block, employee, periodYear, periodMonth) {
    const empType = employee && employee.employee_type;
    const rules = empType ? getRules(empType) : null;

    // 1. סוג עובד פטור (קבלן/שעתי/מנכ"ל/פרויקט)
    if (rules && rules.check_closure_gap === false) {
      return { exclude: true, reason: empType + ' (לפי הגדרת סוג באינדקס)' };
    }

    // 2. תאונת עבודה לכל החודש (לפי האינדקס)
    const accident = calculateWorkAccidentStatus(employee, periodYear, periodMonth);
    const monthDays = new Date(periodYear, periodMonth, 0).getDate();
    if (accident.isActive && accident.days_in_this_month >= monthDays - 2) {
      return { exclude: true, reason: 'תאונת עבודה ' + accident.from_date + ' (לפי האינדקס)' };
    }

    // 3. תאונת עבודה לפי הבלוק (כל הימים מסומנים תאונת עבודה)
    const days = (block && block.days) || [];
    const allWorkAccident = days.length > 0 && days.every(d => {
      const e = String((d && d.event) || '').trim();
      const sug = String((d && d.day_type) || '').trim();
      return sug === 'סופ"ש' || e.indexOf('תאונת עבודה') !== -1;
    });
    if (allWorkAccident) {
      return { exclude: true, reason: 'תאונת עבודה כל החודש (לפי הדיווח היומי)' };
    }

    // 4. מילואים ממושכים (events.miluim >= 15)
    const miluim = (block && block.events && block.events.miluim) || 0;
    if (miluim >= 15) {
      return { exclude: true, reason: 'מילואים ממושכים (' + miluim + ' ימים)' };
    }

    return { exclude: false };
  }

  // computeExtraFakeDeficitFromDays:
  // סורק ימי החודש ומוצא ימי ע.חג (וגם חוה"מ) שיש בהם ניצול חופש >= 0.5
  // ושעות חוסר > 0. השעות האלה מדומות — מוסיפות ל-fake_deficit הכולל.
  //
  // הלוגיקה: בע.חג היום סטנדרטי 6 שעות (במקום 8.4). ניצול חופש 0.5 = 4.2 שעות.
  // אבל בפועל אין צורך בכלל לעבוד כי הניצול אמור לכסות. כל "שעות חוסר" באותה
  // שורה הן ארטיפקט של איך מקאנו מחשב — לא חוסר אמיתי.
  function computeExtraFakeDeficitFromDays(days) {
    if (!Array.isArray(days)) return 0;
    let extra = 0;
    days.forEach(d => {
      const dayType = (d.day_type || '').trim();
      const event   = (d.event || '').trim();
      const isEveHoliday = dayType.indexOf('ערב חג') !== -1 ||
                           dayType.indexOf('עחג') !== -1 ||
                           event.indexOf('ערב חג') !== -1 ||
                           event.indexOf('ע.חג') !== -1;
      const isCholHaMoed = dayType.indexOf('חוה"מ') !== -1 ||
                           dayType.indexOf('חול המועד') !== -1 ||
                           event.indexOf('חוה"מ') !== -1 ||
                           event.indexOf('חול המועד') !== -1;
      const hasVacation = event.indexOf('חופש') !== -1;
      const missing = parseFloat(d.hours_missing) || 0;
      if ((isEveHoliday || isCholHaMoed) && hasVacation && missing > 0) {
        extra += missing;
      }
    });
    return extra;
  }

  // החלת תיקונים ידניים על events של בלוק Meckano.
  // adjustments = { vacation_charged: +2, sick_kizuz: -1, ... } מ-ManualAdjustmentsStore.aggregateForEmployee
  // מחזיר אובייקט events חדש עם ה-deltas.
  function applyAdjustmentsToEvents(events, adjustments) {
    if (!adjustments || Object.keys(adjustments).length === 0) return events;
    const out = { ...events };
    Object.keys(adjustments).forEach(field => {
      out[field] = (out[field] || 0) + adjustments[field];
    });
    return out;
  }

  // החלת תיקון על summary (לדוגמה: days_paid, hours_paid, hours_missing)
  function applyAdjustmentsToSummary(summary, adjustments) {
    if (!adjustments || Object.keys(adjustments).length === 0) return summary;
    const out = { ...summary };
    ['days_paid', 'hours_paid', 'days_present',
     'hours_missing', 'fake_deficit', 'hours_missing_net',
     'hours_present', 'hours_standard'].forEach(field => {
      if (adjustments[field]) out[field] = (out[field] || 0) + adjustments[field];
    });
    return out;
  }

  return {
    getRules, shouldIncludeInReport, listTypes,
    calculateWorkAccidentStatus,
    countChalatBusinessDays,
    countAbsenceBusinessDays,
    countVacationOnEveHolidays,
    countVacationOnCholHaMoed,
    countHolidayDaysFromBlock,
    calculateSickKizuz,
    isHourlyEligibleForHolidayPay,
    applyGlobalBonusThreshold,
    shouldExcludeFromClosureCheck,
    effectiveMaxWorkDays,
    applyAdjustmentsToEvents,
    applyAdjustmentsToSummary,
    computeExtraFakeDeficitFromDays,
    HOURLY_OVERTIME_WEEKLY_THRESHOLD_HOURS,
    HOURLY_HOLIDAY_PAY_TENURE_MONTHS,
    WORK_ACCIDENT_NII_THRESHOLD_DAYS,
    RULES, DEFAULT_TYPE,
  };
})();
