// days-summary-engine.js
// מנוע הפקת "דוח 1: סיכום ימים" מתוך:
//   - מערך בלוקי המקאנו (שיוצא מ-MeckanoReportParser)
//   - אינדקס העובדים המרכזי (EmIndexStore)
//   - חוקי סוג עובד (EmployeeRules)
//
// פלט: מערך שורות מוכנות לטבלה / Excel, בדיוק לפי 18 העמודות של גיליון
// '1.סיכום ימים' של יילנה.

window.DaysSummaryEngine = (function() {
  'use strict';

  // העמודות בסדר זהה לגיליון '1.סיכום ימים'
  const COLUMNS = [
    { key: 'employee_no',    label: "מס' עובד" },
    { key: 'employee_name',  label: 'שם עובד' },
    { key: 'days_present',   label: 'ימי נוכחות' },
    { key: 'vacation_existing', label: 'חופש קיים' },
    { key: 'vacation_charged',  label: 'חופשה לחיוב' },
    { key: 'vacation_total',    label: 'סה"כ חופשה' },
    { key: 'miluim',         label: 'מילואים' },
    { key: 'work_accident',  label: 'תאונת עבודה' },
    { key: 'sick',           label: 'ימי מחלה' },
    { key: 'sick_kizuz',     label: 'מחלה לקיזוז' },
    { key: 'holiday',        label: 'חג' },
    { key: 'eve_holiday',    label: 'ערב חג' },
    { key: 'chol_hamoed',    label: 'חוה"מ' },
    { key: 'days_paid',      label: 'ימים משולמים' },
    { key: 'status',         label: 'סטטוס' },
    { key: 'notes',          label: 'הערה' },
    { key: 'chalat',         label: 'חל"ת' },
    { key: 'absence',        label: 'היעדרות' },
  ];

  // המרת בלוק Meckano + עובד מהאינדקס + חודש → שורת דוח 1
  function buildRow(block, employee, periodYear, periodMonth) {
    const empType = (employee && employee.employee_type) || 'גלובלי';
    const rules   = (typeof EmployeeRules !== 'undefined') ? EmployeeRules.getRules(empType) : null;

    const summary = block.summary || {};
    const events  = block.events  || {};

    // מצב תאונת עבודה מהאינדקס (אם הוגדר special_status)
    const accidentStatus = (typeof EmployeeRules !== 'undefined' && employee)
      ? EmployeeRules.calculateWorkAccidentStatus(employee, periodYear, periodMonth)
      : { isActive: false };

    // ערך 'תאונת עבודה' לדוח: עדיפות לאינדקס; אם לא הוגדר, נופל לאירועי הבלוק
    const workAccidentDays = accidentStatus.isActive
      ? accidentStatus.days_in_this_month
      : (events.work_accident || 0);

    const vacationExisting = events.vacation_existing || 0;
    const vacationCharged  = events.vacation_charged  || 0;
    // 'חופשה לחיוב' של Meckano כבר אגרגציה של חופש קיים + חופש בע.חג + חופש בחוה"מ
    // לכן 'סה"כ חופשה' בגיליון הידני שווה ל-vacation_charged בלבד (לא חיבור).
    const vacationTotal    = vacationCharged;

    // חישוב מחלה לקיזוז (חוק רצף 1/0.5/0.5/0)
    const sickResult = (typeof EmployeeRules !== 'undefined' && EmployeeRules.calculateSickKizuz)
      ? EmployeeRules.calculateSickKizuz(block.days || [])
      : { total_kizuz: 0, streaks: [] };
    const sickKizuz = sickResult.total_kizuz;

    // הערות אוטומטיות
    const notesParts = [];
    if (accidentStatus.isActive && accidentStatus.passed_nii_threshold) {
      const niiDays = accidentStatus.days_paid_by_nii_in_month;
      const empDays = accidentStatus.days_paid_by_employer_in_month;
      notesParts.push('תאונת עבודה: ' + empDays + ' מעסיק + ' + niiDays + ' ב"ל ישירות');
    } else if (accidentStatus.isActive) {
      notesParts.push('תאונת עבודה: ' + accidentStatus.days_in_this_month + ' ימים מעסיק (תחת סף 12)');
    }
    if (block.unknown_columns && block.unknown_columns.length > 0) {
      notesParts.push('הערה ידנית: ' + block.unknown_columns.map(u => u.value).join(' | '));
    }

    // סטטוס: שימוש בעזר המשותף עם closure-missing - כך ששני הדוחות עקביים
    let status = '';
    const exclusion = (typeof EmployeeRules !== 'undefined' && EmployeeRules.shouldExcludeFromClosureCheck)
      ? EmployeeRules.shouldExcludeFromClosureCheck(block, employee, periodYear, periodMonth)
      : { exclude: false };

    if (exclusion.exclude) {
      status = '— ' + exclusion.reason;
    } else {
      const maxWorkDays = (typeof MonthConfig !== 'undefined' && MonthConfig.calculateMaxWorkDays)
        ? MonthConfig.calculateMaxWorkDays(periodYear, periodMonth)
        : 22;
      const expected = maxWorkDays - (events.chalat || 0) - (events.absence || 0) - sickKizuz;
      const actual   = summary.days_paid || 0;
      const diff = actual - expected;
      if (Math.abs(diff) < 0.01) {
        status = '✓';
      } else if (diff < 0) {
        status = '⚠ ' + diff.toFixed(1) + ' (חוסר סגירה?)';
      } else {
        status = '⚠ +' + diff.toFixed(1) + ' (חריגה - בדקי)';
      }
    }

    return {
      employee_no:        block.employee_no,
      employee_name:      block.employee_name || (employee && employee.full_name) || '',
      days_present:       summary.days_present       || 0,
      vacation_existing:  vacationExisting,
      vacation_charged:   vacationCharged,
      vacation_total:     vacationTotal,
      miluim:             events.miluim              || 0,
      work_accident:      workAccidentDays,
      sick:               events.sick                || 0,
      sick_kizuz:         sickKizuz,
      holiday:            events.holiday             || 0,
      eve_holiday:        events.eve_holiday         || 0,
      chol_hamoed:        events.chol_hamoed         || 0,
      days_paid:          summary.days_paid          || 0,
      status:             status,
      notes:              notesParts.join(' • '),
      chalat:             events.chalat              || 0,
      absence:            events.absence             || 0,

      // מטא לשימוש פנימי
      _employee_type:     empType,
      _rules:             rules,
      _accident:          accidentStatus,
    };
  }

  // הפקת הדוח המלא לתקופה
  function build(parsedBlocks, employeesIndex, periodYear, periodMonth) {
    const empByNo = {};
    (employeesIndex || []).forEach(e => { empByNo[String(e.employee_no)] = e; });

    const rows = [];
    parsedBlocks.forEach(block => {
      const emp = empByNo[String(block.employee_no)] || null;
      const empType = emp && emp.employee_type ? emp.employee_type : 'גלובלי';
      const rules = (typeof EmployeeRules !== 'undefined') ? EmployeeRules.getRules(empType) : null;

      // סינון: עובד שלא נכלל בדוח 1 (קבלנים) → לא מופיע
      if (rules && rules.include_in_days_report === false) return;

      rows.push(buildRow(block, emp, periodYear, periodMonth));
    });

    // מיון: לפי מס' עובד מספרית אם אפשר
    rows.sort((a, b) => {
      const na = parseInt(a.employee_no, 10);
      const nb = parseInt(b.employee_no, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return String(a.employee_no).localeCompare(String(b.employee_no));
    });

    return {
      columns: COLUMNS,
      rows:    rows,
      period:  { year: periodYear, month: periodMonth },
      generated_at: new Date().toISOString(),
    };
  }

  return { build, buildRow, COLUMNS };
})();
