// worksheet-engine.js
// מנוע הפקת "דוח 2: נייר עבודה" - 23 עמודות (22 לפי הגיליון הידני + מחלקה).
//
// קלט:
//   - בלוקי Meckano (מ-MeckanoReportParser)
//   - אינדקס עובדים (EmIndexStore)
//   - שנה + חודש מעובד
// פלט:
//   { columns: [...], rows: [...], period }
//
// הצפוי/פער:
//   צפוי = max_work_days - חל"ת - היעדרות - מחלה לקיזוז (Phase F יספק)
//   פער  = ימים משולמים - צפוי
//   פער ≠ 0 → דורש בדיקה (חוסר סגירה / מחלה לקיזוז שטרם חושבה).

window.WorksheetEngine = (function() {
  'use strict';

  // 23 עמודות בסדר זהה לגיליון 'נייר עבודה' של יילנה + מחלקה (עמודה 3).
  const COLUMNS = [
    // קבוצת פרטי עובד (כחול)
    { key: 'employee_no',   label: "מס' עובד",   group: 'employee' },
    { key: 'employee_name', label: 'שם עובד',     group: 'employee' },
    { key: 'department',    label: 'מחלקה',       group: 'employee' },     // חדש - לפי בקשת המשתמשת

    // קבוצת ימים (ירוק)
    { key: 'days_present',  label: 'ימי נוכחות',   group: 'days' },
    { key: 'days_paid',     label: 'ימים משולמים', group: 'days' },
    { key: 'vacation_charged', label: 'חופשה לחיוב', group: 'days' },
    { key: 'sick',          label: 'ימי מחלה',     group: 'days' },
    { key: 'miluim',        label: 'ימי מילואים',  group: 'days' },

    // קבוצת שעות (ירוק)
    { key: 'hours_attendance', label: 'שעות נוכחות', group: 'hours' },
    { key: 'hours_standard',   label: 'שעות תקן',    group: 'hours' },
    { key: 'hours_paid',    label: 'סה"כ שעות (משולמות)', group: 'hours' },
    { key: 'break_time',    label: 'הפסקה',         group: 'hours' },
    { key: 'hours_100',     label: 'שעות 100%',           group: 'hours' },
    { key: 'hours_125',     label: 'שעות 125%',           group: 'hours' },
    { key: 'hours_150',     label: 'שעות 150%',           group: 'hours' },
    { key: 'miluim_work_hours', label: 'שעות עבודה במילואים', group: 'hours' },
    { key: 'global_overtime_hours', label: 'תוספת גלובלית', group: 'hours' },
    { key: 'global_overtime_used',  label: 'ניצול תוספת',   group: 'hours' },

    // קבוצת חוסר שעות (כתום) — חישוב לפי "הטעויות" של Meckano
    { key: 'hours_missing',     label: 'שעות חוסר',         group: 'deficit' },
    { key: 'fake_deficit',      label: 'הפחתה מדומה (ע.חג)', group: 'deficit' },
    { key: 'hours_missing_net', label: 'סה"כ חוסר מעודכן',  group: 'deficit' },

    // קבוצת קיזוזים (אדום)
    { key: 'sick_kizuz',    label: 'מחלה לקיזוז',  group: 'deduct' },
    { key: 'chalat',        label: 'חל"ת',          group: 'deduct' },
    { key: 'absence',       label: 'היעדרות',      group: 'deduct' },

    // קבוצת אירועים (חום)
    { key: 'holiday',       label: 'חג',           group: 'events' },
    { key: 'eve_holiday',   label: 'ע.חג',         group: 'events' },
    { key: 'chol_hamoed',   label: 'חוה"מ',        group: 'events' },
    { key: 'work_accident', label: 'ת.עבודה',      group: 'events' },
    { key: 'vacation_existing', label: 'חופש קיים', group: 'events' },

    // מאזן (כחול בולט)
    { key: 'expected',      label: 'צפוי',         group: 'balance' },
    { key: 'gap',           label: 'פער',          group: 'balance' },
  ];

  function buildRow(block, employee, periodYear, periodMonth, maxWorkDays) {
    const empType = (employee && employee.employee_type) || 'גלובלי';
    const rules   = (typeof EmployeeRules !== 'undefined') ? EmployeeRules.getRules(empType) : null;

    let summary = block.summary || {};
    let events  = block.events  || {};
    const days    = block.days    || [];

    // החלת תיקונים ידניים (אם קיימים)
    if (typeof ManualAdjustmentsStore !== 'undefined' && typeof EmployeeRules !== 'undefined' && EmployeeRules.applyAdjustmentsToEvents) {
      const period = ManualAdjustmentsStore.periodKey(periodYear, periodMonth);
      const adj = ManualAdjustmentsStore.aggregateForEmployee(block.employee_no, period);
      if (Object.keys(adj).length > 0) {
        events = EmployeeRules.applyAdjustmentsToEvents(events, adj);
        summary = EmployeeRules.applyAdjustmentsToSummary(summary, adj);
      }
    }

    // חל"ת והיעדרות - עדיף לחשב מחדש מהימים (לא לכלול סופ"ש) - לפי החוק החדש
    const chalatComputed  = (typeof EmployeeRules !== 'undefined')
      ? EmployeeRules.countChalatBusinessDays(days)
      : (events.chalat || 0);
    const absenceComputed = (typeof EmployeeRules !== 'undefined')
      ? EmployeeRules.countAbsenceBusinessDays(days)
      : (events.absence || 0);

    // תאונת עבודה - עדיפות לאינדקס המרכזי (כולל סף 12 ימים)
    const accident = (typeof EmployeeRules !== 'undefined' && employee)
      ? EmployeeRules.calculateWorkAccidentStatus(employee, periodYear, periodMonth)
      : { isActive: false };
    const workAccidentDays = accident.isActive
      ? accident.days_in_this_month
      : (events.work_accident || 0);

    // החלת תוספת גלובלית על 100/125/150 (אם הוגדר באינדקס)
    const globalThreshold = (employee && Number(employee.global_overtime_hours)) || 0;
    const otAdj = (typeof EmployeeRules !== 'undefined')
      ? EmployeeRules.applyGlobalBonusThreshold(
          summary.hours_125 || 0,
          summary.hours_150 || 0,
          summary.hours_100 || 0,
          globalThreshold
        )
      : { effective_100: summary.hours_100 || 0, effective_125: summary.hours_125 || 0, effective_150: summary.hours_150 || 0, absorbed_by_bonus: 0 };

    const daysPaid = summary.days_paid || 0;

    // חישוב מחלה לקיזוז (חוק רצף 1/0.5/0.5/0)
    const sickResult = (typeof EmployeeRules !== 'undefined' && EmployeeRules.calculateSickKizuz)
      ? EmployeeRules.calculateSickKizuz(days)
      : { total_kizuz: 0, streaks: [] };
    const sickKizuz = sickResult.total_kizuz;

    // הפחתה מדומה נוספת — ימי ע.חג/חוה"מ עם ניצול חופש שיש בהם חוסר תקן
    // (החוסר מדומה — לא צריך לקזז)
    const extraFake = (typeof EmployeeRules !== 'undefined' && EmployeeRules.computeExtraFakeDeficitFromDays)
      ? EmployeeRules.computeExtraFakeDeficitFromDays(days)
      : 0;

    // עובדים שלא צריכים סגירה (קבלן/שעתי/מנכ"ל) — שעות חוסר לא רלוונטי להם
    const skipHoursMissing = rules && rules.check_closure_gap === false;

    // צפוי = max_work_days - חל"ת - היעדרות - מחלה לקיזוז
    // (תאונת עבודה לכל החודש = max_work_days, ללא ניכויים)
    let expected;
    if (accident.isActive && accident.days_in_this_month >= maxWorkDays - 1) {
      expected = maxWorkDays;
    } else {
      expected = maxWorkDays - chalatComputed - absenceComputed - sickKizuz;
    }
    const gap = round2(daysPaid - expected);

    return {
      employee_no:        block.employee_no,
      employee_name:      block.employee_name || (employee && employee.full_name) || '',
      department:         (employee && employee.department) ? employee.department : (block.department || ''),

      days_present:       summary.days_present || 0,
      days_paid:          daysPaid,
      vacation_charged:   events.vacation_charged   || 0,
      sick:               events.sick               || 0,
      miluim:             events.miluim             || 0,

      hours_attendance:   summary.hours_present || summary.hours_total || 0,
      hours_standard:     summary.hours_standard || 0,
      hours_paid:         summary.hours_paid || 0,
      break_time:         summary.break_total || 0,
      hours_100:          otAdj.effective_100,
      hours_125:          otAdj.effective_125,
      hours_150:          otAdj.effective_150,
      miluim_work_hours:  summary.miluim_work_hours || 0,
      global_overtime_hours: globalThreshold || 0,
      global_overtime_used:  otAdj.absorbed_by_bonus,

      // חוסר שעות עם תיקון "הפחתה מדומה" של ע.חג/חוה"מ + תיקון ל-ע.חג/חוה"מ עם חופש
      // קבלנים/שעתיים/מנכ"לים — לא רלוונטי להם, אז משאירים ריק
      hours_missing:      skipHoursMissing ? null : (summary.hours_missing || 0),
      fake_deficit:       skipHoursMissing ? null : round2(((summary.fake_deficit || 0) - extraFake) || 0),
      hours_missing_net:  skipHoursMissing ? null : round2(((summary.hours_missing || 0) - Math.abs((summary.fake_deficit || 0)) - extraFake) || 0),

      sick_kizuz:         sickKizuz,
      chalat:             chalatComputed,
      absence:            absenceComputed,

      holiday:            events.holiday     || 0,
      eve_holiday:        events.eve_holiday || 0,
      chol_hamoed:        events.chol_hamoed || 0,
      work_accident:      workAccidentDays,
      vacation_existing:  events.vacation_existing || 0,

      expected:           expected,
      gap:                gap,

      // מטא לשימוש פנימי (UI יציג סטטוס לפי זה)
      _employee_type:     empType,
      _rules:             rules,
      _accident:          accident,
      _has_gap:           Math.abs(gap) >= 0.01,
    };
  }

  function build(parsedBlocks, employeesIndex, periodYear, periodMonth) {
    const empByNo = {};
    (employeesIndex || []).forEach(e => { empByNo[String(e.employee_no)] = e; });

    const maxWorkDays = (typeof MonthConfig !== 'undefined' && MonthConfig.calculateMaxWorkDays)
      ? MonthConfig.calculateMaxWorkDays(periodYear, periodMonth)
      : 22;

    const rows = [];
    parsedBlocks.forEach(block => {
      const emp = empByNo[String(block.employee_no)] || null;
      const empType = emp && emp.employee_type ? emp.employee_type : 'גלובלי';
      const rules = (typeof EmployeeRules !== 'undefined') ? EmployeeRules.getRules(empType) : null;
      if (rules && rules.include_in_worksheet === false) return;
      rows.push(buildRow(block, emp, periodYear, periodMonth, maxWorkDays));
    });

    rows.sort((a, b) => {
      const na = parseInt(a.employee_no, 10);
      const nb = parseInt(b.employee_no, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return String(a.employee_no).localeCompare(String(b.employee_no));
    });

    return {
      columns: COLUMNS,
      rows: rows,
      period: { year: periodYear, month: periodMonth, max_work_days: maxWorkDays },
      generated_at: new Date().toISOString(),
    };
  }

  function round2(n) { return parseFloat((+n || 0).toFixed(2)); }

  return { build, buildRow, COLUMNS };
})();
