// reconciliation-engine.js
// מנוע התאמת נוכחות (Meckano) מול תלוש (שיקלולית) — לכל עובד, פר חודש.
//
// מקורות נתונים:
//   - Meckano blocks (mכhגיליון report) → ימי עבודה, חופש, מילואים, מחלה, חל"ת, היעדרות
//   - שיקלולית רכיבי שכר → קודי רכיבים סטנדרטיים (51=ש"נ 125%, 58=היעדרות, 73=ש"נ 150%, 110=תוס' גלובלית, 885=מילואים, ...)
//   - שיקלולית העדרויות → ניצול חופש/מחלה/הבראה לחודש + יתרות
//
// פלט: { rows, summary } כאשר rows = שורה לכל עובד, summary = ספירות.

window.ReconciliationEngine = (function() {
  'use strict';

  // ===== Codes לרכיבי שיקלולית (קבועים בכל החברות אצל פנדה) =====
  // אפשר להרחיב/לשנות לפי האקסולוגיה של החברה.
  const COMP = {
    base_salary:        1,    // שכר יסוד
    travel:             3,    // נסיעות
    recreation_pay:     4,    // הבראה
    vacation_pay:       8,    // תמורת חופשה
    imputed_gross_up:   14,   // גילום זקופות
    salary_lg:          33,   // משכורת ל.ג
    car_self:           35,   // השתתפות עצמית רכב
    overtime_125:       51,   // ש.נוספות 125%
    absence:            58,   // היעדרות (חופש לקיזוז)
    sick_minus_1:       61,   // יום מחלה -1 ע"ח עובד
    sick_2_3:           62,   // יום מחלה 2+3 ע"ח עובד
    overtime_150:       73,   // שעות נוספות 150%
    global_overtime:    110,  // תוספת גלובלית בגין ש"נ
    intensified_work:   601,  // עבודה מואמצת
    miluim_hours:       864,  // שעות מילואים בימי עבודה
    miluim_pay:         885,  // מילואים (תשלום)
    prior_month_diff:   958,  // הפרש בגין חודש קודם
  };

  // ===== Helpers =====
  function num(v) { return (v == null || v === '') ? 0 : (typeof v === 'number' ? v : parseFloat(v) || 0); }
  function fmt(v) { return v == null ? '—' : (typeof v === 'number' ? Math.round(v * 100) / 100 : v); }

  // משווה שני ערכים, מחזיר {status, diff}
  // tolerance: סטייה מותרת (default 0.5 ימים / שעות)
  function compareValues(meckano, shiklulit, tolerance) {
    tolerance = tolerance == null ? 0.5 : tolerance;
    const m = num(meckano), s = num(shiklulit);
    if (m === 0 && s === 0) return { status: 'na', diff: 0 };
    const diff = Math.abs(m - s);
    if (diff <= tolerance) return { status: 'match', diff: m - s };
    if (diff <= tolerance * 4) return { status: 'warn', diff: m - s };
    return { status: 'mismatch', diff: m - s };
  }

  // שולף את הסכום והכמות של רכיב מסוים מתלוש שיקלולית
  function getComponent(employeeData, code) {
    if (!employeeData || !employeeData.components) return null;
    const c = employeeData.components[code];
    if (!c) return null;
    return { qty: num(c.qty), total: num(c.total), rate: num(c.rate) };
  }

  // שולף את ניצול החודש לסוג מסוים מהדוח העדרויות
  function getCurrentMonthAbsence(absencesEmp, type, month) {
    if (!absencesEmp || !absencesEmp[type]) return null;
    const monthly = absencesEmp[type].monthly || [];
    return monthly.find(m => m.month === month) || null;
  }

  // ===== Build =====
  function build(year, month, options) {
    options = options || {};

    // Meckano
    const meckanoArc = (typeof MeckanoArchiveStore !== 'undefined')
      ? MeckanoArchiveStore.loadArchive(year, month) : null;
    const meckanoBlocks = (meckanoArc && meckanoArc.blocks) ? meckanoArc.blocks : [];

    // ימי עבודה לחודש מ-MonthConfig (לזיהוי איזה חודש אנחנו)
    const monthConfig = (typeof MonthConfig !== 'undefined' && MonthConfig.getMonthConfig)
      ? MonthConfig.getMonthConfig(year, month) : null;
    const maxWorkDays = monthConfig ? monthConfig.maxWorkDays : 22;

    // אינדקס עובדים
    const empIndex = (typeof EmIndexStore !== 'undefined') ? EmIndexStore.loadAll() : [];
    const empByNo = {};
    empIndex.forEach(e => { empByNo[String(e.employee_no)] = e; });

    // שיקלולית
    const payslip = (typeof PayslipStore !== 'undefined') ? PayslipStore.load(year, month) : null;
    const compReport  = payslip && payslip.reports && payslip.reports.components ? payslip.reports.components : null;
    const dedReport   = payslip && payslip.reports && payslip.reports.voluntary_deductions ? payslip.reports.voluntary_deductions : null;
    const incReport   = payslip && payslip.reports && payslip.reports.imputed_income ? payslip.reports.imputed_income : null;
    const absReport   = payslip && payslip.reports && payslip.reports.absences ? payslip.reports.absences : null;

    // איחוד לכל העובדים שמופיעים ב-Meckano או באחד מדוחות שיקלולית
    const allEmpNos = new Set();
    meckanoBlocks.forEach(b => allEmpNos.add(parseInt(b.employee_no, 10)));
    if (compReport) Object.keys(compReport.employees).forEach(n => allEmpNos.add(parseInt(n, 10)));
    if (absReport)  Object.keys(absReport.employees).forEach(n => allEmpNos.add(parseInt(n, 10)));

    const rows = [];

    // Build period boundaries for "active employee" check
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd   = new Date(year, month, 0); // last day of month

    Array.from(allEmpNos).sort((a, b) => a - b).forEach(empNo => {
      const employee = empByNo[String(empNo)] || null;
      const block = meckanoBlocks.find(b => parseInt(b.employee_no, 10) === empNo) || null;

      // ===== סינון עובדים לא פעילים בחודש זה =====
      // עובד שעזב לפני תחילת החודש (end_date < periodStart) או התחיל אחרי סוף החודש
      // (start_date > periodEnd) — נסמן ונדלג, אלא אם יש לו פעילות במקאנו (אז זה שגוי).
      let inactiveReason = null;
      if (employee) {
        if (employee.end_date) {
          const ed = new Date(employee.end_date);
          if (!isNaN(ed) && ed < periodStart) {
            inactiveReason = 'עזב ב-' + employee.end_date;
          }
        }
        if (employee.start_date) {
          const sd = new Date(employee.start_date);
          if (!isNaN(sd) && sd > periodEnd) {
            inactiveReason = 'יתחיל ב-' + employee.start_date;
          }
        }
      }
      // אם העובד לא פעיל ואין לו בלוק במקאנו — נדלג (לא להציג בדוח התאמה)
      if (inactiveReason && !block && !options.include_inactive) {
        return;
      }

      // ===== חישוב Meckano (אם יש בלוק) =====
      let meck = null;
      if (block) {
        // אם יש days-summary engine, נשתמש בלוגיקה שלו (כולל סטטוס תאונת עבודה והכל)
        const dsRow = (typeof DaysSummaryEngine !== 'undefined' && DaysSummaryEngine.buildRow)
          ? DaysSummaryEngine.buildRow(block, employee, year, month) : null;
        const summary = block.summary || {};
        const events = block.events || {};
        meck = {
          present: dsRow ? dsRow.days_present : (summary.days_present || 0),
          paid: dsRow ? dsRow.days_paid : (summary.days_paid || 0),
          vacation_charged: dsRow ? dsRow.vacation_charged : (events.vacation_charged || 0),
          vacation_existing: dsRow ? dsRow.vacation_existing : (events.vacation_existing || 0),
          sick: dsRow ? dsRow.sick : (events.sick || 0),
          sick_kizuz: dsRow ? dsRow.sick_kizuz : 0,
          miluim: dsRow ? dsRow.miluim : (events.miluim || 0),
          chalat: dsRow ? dsRow.chalat : (events.chalat || 0),
          absence: dsRow ? dsRow.absence : (events.absence || 0),
          holiday: dsRow ? dsRow.holiday : (events.holiday || 0),
          eve_holiday: dsRow ? dsRow.eve_holiday : (events.eve_holiday || 0),
          chol_hamoed: dsRow ? dsRow.chol_hamoed : (events.chol_hamoed || 0),
          work_accident: dsRow ? dsRow.work_accident : (events.work_accident || 0),
        };
      }

      // ===== חישוב שיקלולית =====
      const compEmp = compReport && compReport.employees[empNo] ? compReport.employees[empNo] : null;
      const dedEmp  = dedReport  && dedReport.employees[empNo]  ? dedReport.employees[empNo]  : null;
      const incEmp  = incReport  && incReport.employees[empNo]  ? incReport.employees[empNo]  : null;
      const absEmp  = absReport  && absReport.employees[empNo]  ? absReport.employees[empNo]  : null;

      let shik = null;
      if (compEmp || incEmp || dedEmp || absEmp) {
        const baseSalary = getComponent(compEmp, COMP.base_salary);
        const overtime125 = getComponent(compEmp, COMP.overtime_125);
        const overtime150 = getComponent(compEmp, COMP.overtime_150);
        const globalOT = getComponent(compEmp, COMP.global_overtime);
        const absenceComp = getComponent(compEmp, COMP.absence);
        const sickMinus1 = getComponent(compEmp, COMP.sick_minus_1);
        const sick23 = getComponent(compEmp, COMP.sick_2_3);
        const miluimPay = getComponent(compEmp, COMP.miluim_pay);
        const miluimHours = getComponent(compEmp, COMP.miluim_hours);
        const intensified = getComponent(compEmp, COMP.intensified_work);
        const recPay = getComponent(compEmp, COMP.recreation_pay);
        const vacPay = getComponent(compEmp, COMP.vacation_pay);

        // מילואים: עדיפות לדוח העדרויות (ימים בפועל), אחר כך לרכיב 885
        let miluimDays = null;
        if (absEmp && absEmp._miluim_by_month && absEmp._miluim_by_month[month]) {
          miluimDays = absEmp._miluim_by_month[month];
        } else if (miluimPay && miluimPay.qty) {
          miluimDays = miluimPay.qty;
        }

        // ניצול חופש / מחלה / הבראה לחודש זה
        const vacMonth = getCurrentMonthAbsence(absEmp, 'vacation', month);
        const sickMonth = getCurrentMonthAbsence(absEmp, 'sick', month);
        const recMonth = getCurrentMonthAbsence(absEmp, 'recreation', month);

        // סה"כ ברוטו (עמודה אחרונה במטריקס)
        let grossTotal = 0;
        if (compEmp && compEmp.grand_total != null) grossTotal = num(compEmp.grand_total);
        else if (compEmp) {
          Object.values(compEmp.components).forEach(c => grossTotal += num(c.total));
        }

        shik = {
          base_salary:     baseSalary ? baseSalary.total : null,
          overtime_125_hrs: overtime125 ? overtime125.qty : null,
          overtime_125_amt: overtime125 ? overtime125.total : null,
          overtime_150_hrs: overtime150 ? overtime150.qty : null,
          overtime_150_amt: overtime150 ? overtime150.total : null,
          global_overtime_amt: globalOT ? globalOT.total : null,
          intensified_amt: intensified ? intensified.total : null,
          absence_days:    absenceComp ? absenceComp.qty : null,
          absence_amt:     absenceComp ? absenceComp.total : null,
          sick_minus_1:    sickMinus1 ? sickMinus1.total : null,
          sick_23:         sick23 ? sick23.total : null,
          miluim_days:     miluimDays,
          miluim_amt:      miluimPay ? miluimPay.total : null,
          recreation_pay:  recPay ? recPay.total : null,
          vacation_pay:    vacPay ? vacPay.total : null,
          // העדרויות
          vacation_used_month: vacMonth ? vacMonth.used : null,
          vacation_balance:    vacMonth ? vacMonth.balance : (absEmp ? absEmp.vacation.prior : null),
          sick_used_month:     sickMonth ? sickMonth.used : null,
          sick_balance:        sickMonth ? sickMonth.balance : (absEmp ? absEmp.sick.prior : null),
          recreation_used_month: recMonth ? recMonth.used : null,
          recreation_balance:    recMonth ? recMonth.balance : (absEmp ? absEmp.recreation.prior : null),
          gross_total:     grossTotal,
        };
      }

      // ===== השוואות =====
      const flags = [];
      const compares = {};

      if (meck && shik) {
        // חופש (ימים): Meckano vacation_charged ↔ Shiklulit vacation_used_month
        compares.vacation = compareValues(meck.vacation_charged, shik.vacation_used_month, 0.5);
        if (compares.vacation.status === 'mismatch') {
          flags.push('פער חופש: Meckano ' + meck.vacation_charged + ' ↔ שיקלולית ' + (shik.vacation_used_month || 0));
        }

        // מילואים (ימים)
        compares.miluim = compareValues(meck.miluim, shik.miluim_days, 0.5);
        if (compares.miluim.status === 'mismatch') {
          flags.push('פער מילואים: Meckano ' + meck.miluim + ' ↔ שיקלולית ' + (shik.miluim_days || 0));
        }

        // היעדרות (ימים) — שיקלולית רושם בקוד 58 כקיזוז
        compares.absence = compareValues(
          (meck.absence || 0) + (meck.chalat || 0) + (meck.sick_kizuz || 0),
          shik.absence_days,
          0.5
        );
        if (compares.absence.status === 'mismatch') {
          flags.push('פער היעדרות לקיזוז');
        }

        // מחלה (לא תמיד ניתן להשוואה ישירה — שיקלולית מחלק ל-1/2-3/4+)
        // אבל אם meck.sick > 0 ושיקלולית לא הראה כלום בכלל זה מסומן
        if (meck.sick > 0 && (!shik.sick_minus_1 && !shik.sick_23)) {
          flags.push('Meckano: ' + meck.sick + ' ימי מחלה — אין רישום מחלה בתלוש');
        }
      } else if (meck && !shik) {
        flags.push('יש Meckano — אין נתוני שיקלולית');
      } else if (!meck && shik) {
        flags.push('יש תלוש שיקלולית — אין Meckano (ייתכן עובד מנכ"ל / לא מדווח)');
      }

      // סטטוס כללי
      let overallStatus = 'match';
      if (flags.length === 0 && (!meck || !shik)) overallStatus = 'na';
      else if (Object.values(compares).some(c => c && c.status === 'mismatch')) overallStatus = 'mismatch';
      else if (Object.values(compares).some(c => c && c.status === 'warn')) overallStatus = 'warn';
      else if (flags.length > 0) overallStatus = 'warn';

      rows.push({
        employee_no: empNo,
        employee_name: (block && block.employee_name) || (employee && employee.full_name) || '',
        employee_type: employee && employee.employee_type ? employee.employee_type : '',
        meckano: meck,
        shiklulit: shik,
        compares: compares,
        flags: flags,
        status: overallStatus,
        inactive: inactiveReason,
      });
    });

    // סיכום
    const summary = {
      total: rows.length,
      match:    rows.filter(r => r.status === 'match').length,
      warn:     rows.filter(r => r.status === 'warn').length,
      mismatch: rows.filter(r => r.status === 'mismatch').length,
      na:       rows.filter(r => r.status === 'na').length,
      meckano_only:   rows.filter(r => r.meckano && !r.shiklulit).length,
      shiklulit_only: rows.filter(r => !r.meckano && r.shiklulit).length,
      both:           rows.filter(r => r.meckano && r.shiklulit).length,
    };

    return { rows: rows, summary: summary, max_work_days: maxWorkDays };
  }

  return {
    build: build,
    COMP: COMP,
  };
})();
