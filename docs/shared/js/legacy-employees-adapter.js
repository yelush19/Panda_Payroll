// legacy-employees-adapter.js
// אדפטר שממיר את האינדקס המרכזי (EmIndexStore) + ארכיון Meckano (MeckanoArchiveStore)
// למבנה הישן של employees_data.js שמודולים ה-legacy מצפים לו.
//
// שימוש במודול ישן (כגון basic-checks.html):
//
//   <script src="../payrollchecker/shared/employees_data.js"></script>  <!-- עדיין נטען כ-fallback -->
//   <script src="reserve/js/em-index-store.js"></script>
//   <script src="salary/js/meckano-archive-store.js"></script>
//   <script src="shared/js/legacy-employees-adapter.js"></script>
//   <script>
//     // לפני כל קוד שצורך employeesData:
//     LegacyAdapter.installGlobals('2026-04');  // או null - יבחר חודש אחרון
//     // אחרי הקריאה, window.employeesData ו-window.EmployeesData מסונכרנים
//   </script>

window.LegacyAdapter = (function() {
  'use strict';

  // המרה של עובד מהאינדקס + בלוק Meckano למבנה employees_data.js
  function adaptEmployee(emp, block) {
    const summary = (block && block.summary) || {};
    const events  = (block && block.events)  || {};

    const isHourly = emp.employee_type === 'שעתי';
    const workDaysActual = summary.days_present || 0;
    const mealPerDay = emp.meal_allowance_per_day || 40;

    return {
      // פרטי בסיס
      name:           emp.full_name || '',
      dept:           emp.department || '',
      id:             emp.national_id || '',
      hasPayslip:     true,
      startDate:      emp.start_date || '',
      isShareholder:  false,

      // נתוני נוכחות (מ-Meckano summary + events)
      workDaysActual:     workDaysActual,
      vacationDaysUsed:   events.vacation_existing || 0,
      sickDaysUnpaid:     0,
      sickDaysPaid:       events.sick || 0,
      reserveDays:        events.miluim || 0,
      holidaysPaid:       events.holiday || 0,
      eveHolidays:        events.eve_holiday || 0,

      // נתוני תלוש - אנו לא מחזיקים תלוש בנפרד; משתמשים ב-Meckano כפרוקסי
      workDaysPaid:       summary.days_paid || 0,
      hoursInPayslip:     summary.hours_paid || 0,
      paidHoursInMecano:  summary.hours_paid || 0,
      mealAllowance:      mealPerDay * workDaysActual,

      // שעות נוספות
      hasIntensiveWork:   !!emp.has_intensive_work_bonus,
      hasGlobalBonus:     !!emp.has_global_bonus || (Number(emp.global_overtime_hours) || 0) > 0,
      intensiveHours:     emp.intensive_work_hours || 0,
      overtime125:        summary.hours_125 || 0,
      overtime150:        summary.hours_150 || 0,

      // מחלה - תשלום
      sickLeavePayment:   0,                                   // לא בנתונים שלנו
      isHourlyEmployee:   isHourly,

      // הבראה - מהאינדקס
      isEligibleForRecovery: emp.is_eligible_for_recovery !== false,
      recoveryBalance:    emp.recovery_balance_amount || 0,
      recoveryUsed:       emp.recovery_used_amount || 0,
      recoveryReset:      0,

      // מילואים מיוחד
      reserveWorkSameDayHours: summary.miluim_work_hours || 0,
      reserveDoublePayComponent: 0,                            // לא בנתונים שלנו

      // הפרשות (חישוב מתוקן לפי שיעורים מהאינדקס + base_salary)
      baseSalary:                 emp.base_salary || 0,
      pensionEmployer:            0,                            // נמשוך מתלוש בעתיד
      pensionRequired:            Math.round((emp.base_salary || 0) * (emp.pension_rate_employer || 0.065)),
      compensationEmployer:       0,
      compensationRequired:       Math.round((emp.base_salary || 0) * (emp.compensation_rate || 0.0833)),
      advancedStudyEmployer:      0,
      advancedStudyRequired:      emp.has_advanced_study_in_contract
        ? Math.round((emp.base_salary || 0) * (emp.advanced_study_rate_employer || 0.075))
        : 0,
      hasAdvancedStudyInContract: !!emp.has_advanced_study_in_contract,

      // דוח חריגים
      exceptionsReport:   'אין',
      exceptionCategory:  '',
      exceptionAmount:    0,

      specialNotes:       emp.notes || '',

      // מטא לזיהוי
      _employee_no:       emp.employee_no,
      _employee_type:     emp.employee_type || '',
      _from_adapter:      true,
      _period:            null,                                // יוגדר בעת installGlobals
    };
  }

  // בונה את אובייקט employeesData מלא לפי האינדקס + הארכיון של חודש מסוים.
  // period: 'YYYY-MM' או null (= חודש אחרון בארכיון).
  function buildLegacyEmployees(period) {
    if (typeof EmIndexStore === 'undefined') {
      console.warn('LegacyAdapter: EmIndexStore not loaded');
      return null;
    }
    const employees = EmIndexStore.loadAll();
    if (!employees || employees.length === 0) return null;

    // טען בלוקים מהארכיון אם זמין
    let blocks = {};
    if (typeof MeckanoArchiveStore !== 'undefined') {
      let actualPeriod = period;
      if (!actualPeriod) {
        const idx = MeckanoArchiveStore.loadIndex();
        if (idx.length > 0) actualPeriod = idx[0].period;
      }
      if (actualPeriod) {
        const arc = MeckanoArchiveStore.loadByPeriod(actualPeriod);
        if (arc && arc.blocks) {
          arc.blocks.forEach(b => { blocks[String(b.employee_no)] = b; });
        }
      }
      period = actualPeriod;
    }

    const result = {};
    employees.forEach(emp => {
      const block = blocks[String(emp.employee_no)];
      const obj = adaptEmployee(emp, block);
      obj._period = period;
      // המפתח: מספר עובד (מטופל כ-string)
      result[String(emp.employee_no)] = obj;
    });
    return result;
  }

  // החלפת הגלובלים window.employeesData ו-window.EmployeesData בערכים החדשים.
  // מחזיר את האובייקט שיצר, או null אם לא היה אינדקס/ארכיון.
  function installGlobals(period) {
    const data = buildLegacyEmployees(period);
    if (!data) return null;
    window.employeesData = data;
    window.EmployeesData = Object.values(data);
    return data;
  }

  // רשימת תקופות זמינות בארכיון (ל-period selector)
  function listAvailablePeriods() {
    if (typeof MeckanoArchiveStore === 'undefined') return [];
    return MeckanoArchiveStore.loadIndex();
  }

  return {
    buildLegacyEmployees,
    installGlobals,
    listAvailablePeriods,
    adaptEmployee,
  };
})();
