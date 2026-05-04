// payslip-store.js
// אחסון של נתוני תלושים מתוכנת השכר "שיקלולית" — פר חודש.
//
// מבנה ב-localStorage:
//   pandatech_payslip_index               = רשימת מטא לכל החודשים השמורים
//   pandatech_payslip_2026-04             = הנתונים המלאים של חודש מסוים
//
// מבנה הנתונים פר חודש:
//   {
//     year, month,
//     saved_at: ISO date,
//     reports: {
//       components:           {meta, employees, components_dict},  // רכיבי שכר
//       imputed_income:       {meta, employees, components_dict},  // הכנסות זקופות
//       voluntary_deductions: {meta, employees, components_dict},  // ניכויי רשות
//       absences:             {meta, employees},                    // היעדרויות (רב-חודשי)
//     },
//     all_components_dict: {code: name, ...},   // איחוד של כל הרכיבים שראינו
//   }

window.PayslipStore = (function() {
  'use strict';

  const INDEX_KEY = 'pandatech_payslip_index';
  const PREFIX = 'pandatech_payslip_';

  function periodKey(year, month) {
    return String(year) + '-' + String(month).padStart(2, '0');
  }

  function loadIndex() {
    try {
      const raw = localStorage.getItem(INDEX_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveIndex(idx) {
    localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
  }

  function load(year, month) {
    try {
      const raw = localStorage.getItem(PREFIX + periodKey(year, month));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function save(year, month, data) {
    const key = PREFIX + periodKey(year, month);
    const payload = {
      year: year,
      month: month,
      saved_at: new Date().toISOString(),
      ...data,
    };
    const json = JSON.stringify(payload);
    try {
      localStorage.setItem(key, json);
    } catch (e) {
      throw new Error('שגיאת שמירה: זיכרון הדפדפן מלא. (' + e.message + ')');
    }

    const idx = loadIndex();
    const existing = idx.findIndex(x => x.year === year && x.month === month);
    const reports = payload.reports || {};
    const meta = {
      year: year,
      month: month,
      period: periodKey(year, month),
      saved_at: payload.saved_at,
      size_bytes: json.length,
      has_components: !!reports.components,
      has_imputed: !!reports.imputed_income,
      has_deductions: !!reports.voluntary_deductions,
      has_absences: !!reports.absences,
      employee_count: payload.employee_count || 0,
    };
    if (existing >= 0) idx[existing] = meta;
    else idx.push(meta);
    idx.sort((a, b) => b.period.localeCompare(a.period));
    saveIndex(idx);
    return meta;
  }

  function remove(year, month) {
    localStorage.removeItem(PREFIX + periodKey(year, month));
    const idx = loadIndex();
    const filtered = idx.filter(x => !(x.year === year && x.month === month));
    saveIndex(filtered);
  }

  // ===== Merge 4 reports into one payload =====
  // accepts an object {components, imputed_income, voluntary_deductions, absences}
  // each value = parsed output from ShiklulitParser.parseFile
  function buildPayload(reports) {
    const all_components_dict = {};
    const all_employees = new Set();

    ['components', 'imputed_income', 'voluntary_deductions'].forEach(k => {
      const r = reports[k];
      if (!r) return;
      Object.assign(all_components_dict, r.components_dict || {});
      Object.keys(r.employees || {}).forEach(eno => all_employees.add(parseInt(eno, 10)));
    });
    if (reports.absences) {
      Object.keys(reports.absences.employees || {}).forEach(eno => all_employees.add(parseInt(eno, 10)));
    }

    return {
      reports: {
        components: reports.components || null,
        imputed_income: reports.imputed_income || null,
        voluntary_deductions: reports.voluntary_deductions || null,
        absences: reports.absences || null,
      },
      all_components_dict: all_components_dict,
      employee_count: all_employees.size,
    };
  }

  // ===== Lookups for verification =====
  // מחזיר את כל הרכיבים של עובד מסוים (מאוחד מ-3 הדוחות) לחודש נתון.
  // Format: [{report, code, name, rate, qty, total, permanent}, ...]
  function getEmployeeComponents(year, month, employee_no) {
    const data = load(year, month);
    if (!data || !data.reports) return [];
    const out = [];
    ['components', 'imputed_income', 'voluntary_deductions'].forEach(rk => {
      const r = data.reports[rk];
      if (!r || !r.employees || !r.employees[employee_no]) return;
      const emp = r.employees[employee_no];
      Object.keys(emp.components || {}).forEach(code => {
        const comp = emp.components[code];
        out.push({
          report: rk,
          code: parseInt(code, 10),
          name: comp.name,
          rate: comp.rate,
          qty: comp.qty,
          total: comp.total,
          permanent: comp.permanent,
        });
      });
    });
    return out;
  }

  function getEmployeeAbsences(year, month, employee_no) {
    const data = load(year, month);
    if (!data || !data.reports || !data.reports.absences) return null;
    const emp = data.reports.absences.employees[employee_no];
    if (!emp) return null;

    // נבחר את שורת החודש המבוקש מהרשימות החודשיות
    function pickMonth(arr) {
      if (!arr) return null;
      return arr.find(x => x.month === month) || null;
    }

    return {
      employee_no: employee_no,
      vacation: {
        prior: emp.vacation.prior,
        current_month: pickMonth(emp.vacation.monthly),
        ytd_totals: emp.vacation.totals,
      },
      sick: {
        prior: emp.sick.prior,
        current_month: pickMonth(emp.sick.monthly),
        ytd_totals: emp.sick.totals,
      },
      recreation: {
        prior: emp.recreation.prior,
        current_month: pickMonth(emp.recreation.monthly),
        ytd_totals: emp.recreation.totals,
      },
      miluim_total: emp.miluim_total,
      _miluim_by_month: emp._miluim_by_month || {},
    };
  }

  // ===== Verification helper for "בוצע" exceptions =====
  // Match a {employee_no, expected_amount?, component_keywords?, type} request
  // against the stored payslip data, returns {status, matches, notes}
  function verifyException(year, month, request) {
    const data = load(year, month);
    if (!data || !data.reports) {
      return { status: 'no_data', notes: 'אין נתוני שיקלולית לחודש זה — תעלי קודם את הדוחות.' };
    }
    const components = getEmployeeComponents(year, month, request.employee_no);
    if (!components.length) {
      return { status: 'employee_not_found', notes: 'העובד ' + request.employee_no + ' לא נמצא בדוחות שיקלולית.' };
    }

    const matches = [];
    components.forEach(comp => {
      let score = 0;
      const reasons = [];

      if (request.expected_amount != null && comp.total != null) {
        const diff = Math.abs(comp.total - request.expected_amount);
        const tolerance = Math.max(1, Math.abs(request.expected_amount) * 0.01); // 1% או 1₪
        if (diff <= tolerance) {
          score += 50;
          reasons.push('סכום תואם (₪' + comp.total + ')');
        }
      }

      if (request.component_keywords && request.component_keywords.length) {
        const hits = request.component_keywords.filter(kw => comp.name && comp.name.includes(kw));
        if (hits.length) {
          score += 30 * hits.length;
          reasons.push('מילים תואמות: ' + hits.join(', '));
        }
      }

      if (score > 0) {
        matches.push({ ...comp, score: score, reasons: reasons });
      }
    });

    matches.sort((a, b) => b.score - a.score);

    let status;
    if (!matches.length) status = 'not_found';
    else if (matches[0].score >= 50) status = 'verified';
    else status = 'partial';

    return { status: status, matches: matches.slice(0, 5), notes: '' };
  }

  return {
    loadIndex: loadIndex,
    load: load,
    save: save,
    remove: remove,
    buildPayload: buildPayload,
    getEmployeeComponents: getEmployeeComponents,
    getEmployeeAbsences: getEmployeeAbsences,
    verifyException: verifyException,
    periodKey: periodKey,
  };
})();
