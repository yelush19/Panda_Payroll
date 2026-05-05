// shiklulit-to-hr-sync.js
// סנכרון אוטומטי מנתוני שיקלולית לאינדקס המרכזי (employees_master).
//
// מה מסונכרן (אחרי קליטת תלושים בPayslipStore):
//   • דוח העדרויות → vacation_balance_days, sick_balance_days, recovery_balance_amount
//     (יתרת סגירה של החודש האחרון = נקודת ההתחלה לחודש הבא)
//   • רכיבים לעובדים → base_salary (אם חסר באינדקס)
//
// מתי רץ: אחרי PayslipStore.saveAndSync(), קוראים ל-syncFromShiklulit(year, month)
// או אוטומטית (אם enableAutoSync = true).

window.ShiklulitToHrSync = (function() {
  'use strict';

  function syncFromShiklulit(year, month, options) {
    options = options || {};
    if (typeof PayslipStore === 'undefined' || typeof EmIndexStore === 'undefined') {
      console.warn('[hr-sync] חסרים stores');
      return { ok: false, reason: 'no_stores', updated: 0 };
    }
    const data = PayslipStore.load(year, month);
    if (!data || !data.reports) {
      return { ok: false, reason: 'no_payslip_data', updated: 0 };
    }

    const empIndex = EmIndexStore.loadAll() || [];
    const empByNo = {};
    empIndex.forEach(e => { empByNo[String(e.employee_no)] = e; });

    const absReport = data.reports.absences;
    const compReport = data.reports.components;

    let updated = 0;
    const skipped = [];
    const updates = [];   // לשליחה batch ל-Supabase

    // 1. עדכון יתרות מ-דוח העדרויות
    if (absReport && absReport.employees) {
      Object.keys(absReport.employees).forEach(empNoKey => {
        const empNo = parseInt(empNoKey, 10);
        const empAbs = absReport.employees[empNoKey];
        const indexEmp = empByNo[String(empNo)];
        if (!indexEmp) {
          skipped.push({ empNo, reason: 'not_in_index' });
          return;
        }

        // לקיחת יתרת הסגירה של החודש המבוקש (closing balance בסוף החודש)
        function closingFor(arr) {
          if (!arr || !arr.length) return null;
          const m = arr.find(x => x.month === month);
          return m ? m.balance : null;
        }
        const vacClosing = closingFor(empAbs.vacation && empAbs.vacation.monthly);
        const sickClosing = closingFor(empAbs.sick && empAbs.sick.monthly);
        const recClosing = closingFor(empAbs.recreation && empAbs.recreation.monthly);

        const fields = {};
        if (vacClosing != null) fields.vacation_balance_days = Math.round(vacClosing * 100) / 100;
        if (sickClosing != null) fields.sick_balance_days = Math.round(sickClosing * 100) / 100;
        if (recClosing != null) fields.recovery_balance_amount = Math.round(recClosing * 100) / 100;

        if (Object.keys(fields).length > 0) {
          updates.push({ empNo: empNo, fields: fields, source: 'absences' });
        }
      });
    }

    // 2. עדכון שכר בסיס מ-רכיבים (רק אם חסר באינדקס)
    if (compReport && compReport.employees && options.update_base_salary !== false) {
      Object.keys(compReport.employees).forEach(empNoKey => {
        const empNo = parseInt(empNoKey, 10);
        const indexEmp = empByNo[String(empNo)];
        if (!indexEmp) return;
        // רק אם אין שכר בסיס באינדקס — לא דורסים ערכים שהוגדרו ידנית
        if (indexEmp.base_salary && indexEmp.base_salary > 0) return;
        const empComp = compReport.employees[empNoKey];
        const baseSalary = empComp.components && empComp.components[1];
        if (baseSalary && baseSalary.total != null) {
          updates.push({
            empNo: empNo,
            fields: { base_salary: Math.round(baseSalary.total) },
            source: 'components',
          });
        }
      });
    }

    // איחוד עדכונים לאותו עובד
    const merged = {};
    updates.forEach(u => {
      const key = String(u.empNo);
      if (!merged[key]) merged[key] = { empNo: u.empNo, fields: {} };
      Object.assign(merged[key].fields, u.fields);
    });

    Object.values(merged).forEach(u => {
      EmIndexStore.update(u.empNo, u.fields);
      updated++;
    });

    console.log('[hr-sync] עודכנו ' + updated + ' עובדים מ-שיקלולית לאינדקס. ' +
      'דילוגים: ' + skipped.length);
    return { ok: true, updated: updated, skipped: skipped, period: year + '-' + String(month).padStart(2, '0') };
  }

  return {
    syncFromShiklulit: syncFromShiklulit,
  };
})();
