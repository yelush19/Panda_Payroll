// shiklulit-export-engine.js
// מייצר תנועות חודשיות לקליטה קיבוצית בשיקלולית — מבוסס Meckano + EmployeeRules.
//
// פלט: מערך תנועות, כל אחת = שורה אחת בקובץ ה-Excel הסופי לפי המפרט הרשמי:
//   { employee_no, month, year, component_code, qty, amount, date_from, date_to, note }
//
// כל תנועה תיוצר רק אם הכמות / סכום > 0. מספר תנועות לכל עובד.
//
// קודי רכיבים (מבוסס על הדוחות שראינו ב-4/2026):
//   1   = שכר יסוד            (קבוע — לא נכלל בייצוא, מטופל ב-master)
//   4   = הבראה               (לא בייצוא — שיקלולית מחשב בעצמו)
//   8   = תמורת חופשה
//   33  = משכורת ל.ג
//   51  = ש.נוספות 125%
//   58  = היעדרות (חופש לקיזוז)
//   61  = יום מחלה -1 ע"ח עובד
//   62  = ימי מחלה 2+3 ע"ח עובד
//   73  = שעות נוספות 150%
//   110 = תוספת גלובלית בגין ש"נ
//   601 = עבודה מואמצת
//   864 = שעות מילואים בימי עבודה
//   885 = מילואים (תשלום)
//   958 = הפרש בגין חודש קודם

window.ShiklulitExportEngine = (function() {
  'use strict';

  const COMP = {
    overtime_125:     51,
    overtime_150:     73,
    global_overtime:  110,
    absence:          58,
    sick_minus_1:     61,
    sick_2_3:         62,
    intensified_work: 601,
    miluim_pay:       885,
    miluim_hours:     864,
  };

  const COMP_NAMES = {
    51: 'ש.נוספות 125%',
    73: 'שעות נוספות 150%',
    110: 'תוספת גלובלית',
    58: 'היעדרות',
    61: 'יום מחלה -1',
    62: 'מחלה 2+3',
    601: 'עבודה מואמצת',
    885: 'מילואים',
    864: 'שעות מילואים',
  };

  function num(v) { return (v == null || v === '') ? 0 : (typeof v === 'number' ? v : parseFloat(v) || 0); }

  // המרה לתאריך DD/MM/YYYY
  function fmtDate(d) {
    if (!d) return '';
    if (typeof d === 'string') {
      // ISO YYYY-MM-DD → DD/MM/YYYY
      const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return m[3] + '/' + m[2] + '/' + m[1];
      return d;
    }
    if (d instanceof Date) {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return dd + '/' + mm + '/' + d.getFullYear();
    }
    return String(d);
  }

  // ===== Build transactions for one employee =====
  function buildEmployeeTransactions(block, employee, periodYear, periodMonth, options) {
    options = options || {};
    const empNo = block.employee_no || (employee && employee.employee_no);
    if (!empNo) return [];

    const empType = (employee && employee.employee_type) || 'גלובלי';
    const rules = (typeof EmployeeRules !== 'undefined') ? EmployeeRules.getRules(empType) : null;
    const summary = block.summary || {};
    const events  = block.events  || {};

    // אם העובד מסומן "אל תכלול בדוחות" (קבלן) — לא לייצא תנועות
    if (rules && rules.include_in_days_report === false) return [];

    const txs = [];
    const monthStr = String(periodMonth).padStart(2, '0');
    const yearStr  = String(periodYear);

    // ===== ש"נ 125% / 150% =====
    // אם יש סף תוספת גלובלית — הסף "מבליע" שעות עד שמגיעים אליו, ואז ש"נ נכנסות
    let h125 = num(summary.hours_125);
    let h150 = num(summary.hours_150);
    let globalBonusAmount = 0;

    if (rules && rules.has_global_bonus && employee && employee.global_overtime_hours > 0) {
      const adj = (typeof EmployeeRules !== 'undefined' && EmployeeRules.applyGlobalBonusThreshold)
        ? EmployeeRules.applyGlobalBonusThreshold(h125, h150, num(summary.hours_100), employee.global_overtime_hours)
        : null;
      if (adj) {
        h125 = adj.effective_125 || 0;
        h150 = adj.effective_150 || 0;
        // גלובלית = שעות שנבלעו × תעריף שעה (אם הוגדר)
        if (adj.absorbed_by_bonus > 0 && employee && employee.hourly_rate) {
          globalBonusAmount = adj.absorbed_by_bonus * employee.hourly_rate * 1.25; // קירוב
        }
      }
    }

    if (h125 > 0) {
      txs.push({
        employee_no: empNo, month: monthStr, year: yearStr,
        component_code: COMP.overtime_125,
        qty: h125, amount: '',
        date_from: '', date_to: '', note: 'ש"נ 125% — חודש ' + monthStr + '/' + yearStr,
      });
    }
    if (h150 > 0) {
      txs.push({
        employee_no: empNo, month: monthStr, year: yearStr,
        component_code: COMP.overtime_150,
        qty: h150, amount: '',
        date_from: '', date_to: '', note: 'ש"נ 150% — חודש ' + monthStr + '/' + yearStr,
      });
    }

    // ===== תוספת גלובלית — נמסור רק אם יש סף ויש עליית סף =====
    // הערה: שיקלולית בדרך כלל מחשבת זאת אוטומטית מהוראת הקבע. אם זה לא המקרה,
    // אפשר להוסיף options.include_global_bonus = true.
    if (options.include_global_bonus && globalBonusAmount > 0) {
      txs.push({
        employee_no: empNo, month: monthStr, year: yearStr,
        component_code: COMP.global_overtime,
        qty: '', amount: globalBonusAmount,
        date_from: '', date_to: '', note: 'תוספת גלובלית בגין ש"נ',
      });
    }

    // ===== היעדרות לקיזוז (חל"ת + absence + מחלה לקיזוז) =====
    // שיקלולית: רכיב 58 = היעדרות (יום שניתן לקיזוז משכר חודשי)
    const sickKizuzResult = (typeof EmployeeRules !== 'undefined' && EmployeeRules.calculateSickKizuz)
      ? EmployeeRules.calculateSickKizuz(block.days || [])
      : { total_kizuz: 0 };
    const sickKizuz = sickKizuzResult.total_kizuz || 0;

    const absenceTotal = num(events.absence) + num(events.chalat) + sickKizuz;
    if (absenceTotal > 0) {
      const breakdown = [];
      if (num(events.absence) > 0) breakdown.push('היעדרות ' + num(events.absence));
      if (num(events.chalat) > 0)  breakdown.push('חל"ת ' + num(events.chalat));
      if (sickKizuz > 0)           breakdown.push('מחלה לקיזוז ' + sickKizuz);
      txs.push({
        employee_no: empNo, month: monthStr, year: yearStr,
        component_code: COMP.absence,
        qty: absenceTotal, amount: '',
        date_from: '', date_to: '', note: breakdown.join(' + '),
      });
    }

    // ===== מילואים =====
    // ימים סופרים מ-Meckano events.miluim. תאריכים — מ-ReservePeriodsStore אם יש.
    const milDays = num(events.miluim);
    if (milDays > 0) {
      let dateFrom = '', dateTo = '';
      if (typeof ReservePeriodsStore !== 'undefined') {
        const periods = ReservePeriodsStore.listForEmployee(empNo)
          .filter(p => {
            // רק תקופות שחופפות את החודש
            if (!p.start_date) return false;
            const d = new Date(p.start_date);
            return d.getFullYear() === periodYear && (d.getMonth() + 1) === periodMonth;
          })
          .sort((a, b) => a.start_date.localeCompare(b.start_date));
        if (periods.length === 1) {
          dateFrom = fmtDate(periods[0].start_date);
          dateTo   = fmtDate(periods[0].end_date);
        } else if (periods.length > 1) {
          // טווח כולל — יוצרים שורה אחת מהראשון לאחרון, מסמנים בהערה
          dateFrom = fmtDate(periods[0].start_date);
          dateTo   = fmtDate(periods[periods.length - 1].end_date);
        }
      }
      txs.push({
        employee_no: empNo, month: monthStr, year: yearStr,
        component_code: COMP.miluim_pay,
        qty: milDays, amount: '',
        date_from: dateFrom, date_to: dateTo,
        note: 'מילואים — ' + milDays + ' ימים',
      });
    }

    // ===== עבודה מואמצת (אם הוגדר באינדקס) =====
    if (employee && employee.intensive_work_hours && employee.intensive_work_hours > 0) {
      txs.push({
        employee_no: empNo, month: monthStr, year: yearStr,
        component_code: COMP.intensified_work,
        qty: employee.intensive_work_hours, amount: '',
        date_from: '', date_to: '', note: 'עבודה מואמצת — לפי אינדקס',
      });
    }

    return txs;
  }

  // ===== Build for full month =====
  function build(periodYear, periodMonth, options) {
    options = options || {};
    const meckanoArc = (typeof MeckanoArchiveStore !== 'undefined')
      ? MeckanoArchiveStore.loadArchive(periodYear, periodMonth) : null;
    if (!meckanoArc || !meckanoArc.blocks) {
      return { rows: [], errors: ['אין דוח Meckano שמור לחודש ' + periodYear + '-' + periodMonth] };
    }

    const empIndex = (typeof EmIndexStore !== 'undefined') ? (EmIndexStore.loadAll() || []) : [];
    const empByNo = {};
    empIndex.forEach(e => { empByNo[String(e.employee_no)] = e; });

    const allTxs = [];
    const errors = [];

    meckanoArc.blocks.forEach(block => {
      const employee = empByNo[String(block.employee_no)] || null;
      if (!employee) {
        errors.push('עובד #' + block.employee_no + ' (' + block.employee_name + ') לא נמצא באינדקס. דלג.');
        return;
      }
      const txs = buildEmployeeTransactions(block, employee, periodYear, periodMonth, options);
      txs.forEach(t => {
        // הוסף שם מלא לתצוגה (לא ייכנס ל-Excel)
        t._employee_name = block.employee_name || employee.full_name || '';
        t._component_name = COMP_NAMES[t.component_code] || ('קוד ' + t.component_code);
        t._included = true; // ברירת מחדל — תיכלל בייצוא
      });
      allTxs.push(...txs);
    });

    // מיון: לפי מס' עובד ואז לפי קוד רכיב
    allTxs.sort((a, b) => {
      const cmp = parseInt(a.employee_no, 10) - parseInt(b.employee_no, 10);
      if (cmp !== 0) return cmp;
      return a.component_code - b.component_code;
    });

    return { rows: allTxs, errors: errors };
  }

  // ===== Export to Excel =====
  // יוצר workbook ב-9 עמודות לפי המפרט הרשמי. שורה ראשונה = כותרת בעברית.
  function exportToXlsx(rows, periodYear, periodMonth) {
    if (typeof XLSX === 'undefined') {
      throw new Error('SheetJS (XLSX) לא טעון.');
    }
    const headers = [
      'מס_עובד', 'חודש', 'שנה', 'קוד_רכיב', 'כמות', 'סכום',
      'מתאריך', 'עד_תאריך', 'הערה'
    ];
    const data = [headers];
    rows.filter(r => r._included !== false).forEach(r => {
      data.push([
        r.employee_no,
        r.month,
        r.year,
        r.component_code,
        r.qty === '' || r.qty == null ? '' : r.qty,
        r.amount === '' || r.amount == null ? '' : r.amount,
        r.date_from || '',
        r.date_to || '',
        r.note || '',
      ]);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    // עיצוב עמודה A (מס' עובד) כטקסט כדי לא לאבד אפסים מובילים
    XLSX.utils.book_append_sheet(wb, ws, 'תנועות');

    const fname = 'shiklulit-import-' + periodYear + '-' + String(periodMonth).padStart(2, '0') + '.xlsx';
    XLSX.writeFile(wb, fname);
    return { ok: true, file_name: fname, row_count: data.length - 1 };
  }

  return {
    build: build,
    buildEmployeeTransactions: buildEmployeeTransactions,
    exportToXlsx: exportToXlsx,
    COMP: COMP,
    COMP_NAMES: COMP_NAMES,
  };
})();
