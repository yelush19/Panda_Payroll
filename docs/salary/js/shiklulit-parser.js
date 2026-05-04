// shiklulit-parser.js
// Parser לדוחות אקסל מתוכנת השכר "שיקלולית" של ט.מ.ל מערכות מידע בע"מ.
//
// תומך ב-4 דוחות:
//   1. "רכיבים לעובדים"        — matrix של רכיבי שכר (תעריף/כמות/סה"כ/ה.קבע × רכיבים)
//   2. "הכנסות זקופות לעובדים" — אותו matrix
//   3. "ניכויי רשות לעובדים"  — אותו matrix
//   4. "דו"ח העדרויות"         — מבנה אחר: שורה לחודש לכל סוג היעדרות
//
// כל פלט: { meta, employees: {emp_no: {...}}, raw_components_dict }
//
// תלות: SheetJS (XLSX global).

window.ShiklulitParser = (function() {
  'use strict';

  // ===== Helpers =====

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/,/g, '').trim();
    if (s === '' || s === '—' || s === '-') return null;
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  function readSheet(workbook, sheetName) {
    const sn = sheetName || workbook.SheetNames[0];
    const ws = workbook.Sheets[sn];
    if (!ws) throw new Error('לא נמצא גליון: ' + sn);
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  }

  function detectReportKind(rows) {
    // R1=שם חברה. R2=כותרת הדוח (שם זה מה שמזהה את הסוג).
    const title = String((rows[1] && rows[1][0]) || '').trim();
    if (/^רכיבים לעובדים/.test(title))         return 'components';
    if (/^הכנסות זקופות/.test(title))           return 'imputed_income';
    if (/^ניכויי רשות/.test(title))             return 'voluntary_deductions';
    if (/^דו"ח העדרויות|^דוח העדרויות/.test(title)) return 'absences';
    return 'unknown';
  }

  function parsePeriodFromTitle(title) {
    // "רכיבים לעובדים לחודש 4/2026"  -> {month:4, year:2026}
    // "דו"ח העדרויות שנתי מפורט :לתקופה 1/2026 - 4/2026" -> {month:4, year:2026, range_start:{month:1,year:2026}}
    const m = String(title).match(/(\d{1,2})\/(\d{4})/g);
    if (!m || !m.length) return null;
    const last = m[m.length - 1].split('/');
    const out = { month: parseInt(last[0], 10), year: parseInt(last[1], 10) };
    if (m.length > 1) {
      const first = m[0].split('/');
      out.range_start = { month: parseInt(first[0], 10), year: parseInt(first[1], 10) };
    }
    return out;
  }

  // ===== Matrix-format parser (רכיבים/זקופות/ניכויים) =====
  //
  // מבנה (1-indexed שורות, 1-indexed עמודות בעברית):
  //   R1-R5: header metadata (שם חברה, כותרת דוח, מי הפיק, ...)
  //   R6:    ריקה
  //   R7:    [null,null,null,null,null, code1, code2, ...]      ← קודי רכיבים
  //   R8:    ['מספר עובד','ת.ז.','שם משפחה','שם פרטי', null, name1, name2, ...]
  //   R9-:   4 שורות לעובד:
  //          R9:  [emp_no, id, last, first, 'תעריף', rate1, rate2, ...]
  //          R10: [null,   null,null, null, 'כמות',  qty1,  qty2,  ...]
  //          R11: [null,   null,null, null, 'סה"כ',  total1,total2,...]
  //          R12: [null,   null,null, null, 'ה.קבע', perm1, perm2, ...]
  //
  // המטרה: לכל עובד נחזיק רק רכיבים שיש בהם תעריף/כמות/סה"כ/ה.קבע ≠ null.
  function parseMatrix(rows, kind) {
    const codeRow = rows[6] || [];   // index 6 = R7
    const nameRow = rows[7] || [];   // index 7 = R8

    // קוראים את עמודות הרכיבים — מתחיל מעמודה 5 (אינדקס) = E
    const componentColumns = [];
    for (let c = 5; c < codeRow.length; c++) {
      const code = num(codeRow[c]);
      const name = nameRow[c] ? String(nameRow[c]).trim() : '';
      if (code === null && !name) continue;
      // נדלג על העמודה האחרונה אם היא "סך הכל" (קוד null + שם "סך הכל")
      if (code === null && /^סך\s*הכל$/.test(name)) continue;
      componentColumns.push({ col: c, code: code, name: name });
    }

    const employees = {};
    const componentsDict = {};
    componentColumns.forEach(cc => {
      if (cc.code !== null) componentsDict[cc.code] = cc.name;
    });

    // עובדים מתחילים ב-R9 (אינדקס 8)
    let r = 8;
    while (r < rows.length) {
      const row = rows[r];
      if (!row || row.every(v => v === null || v === '')) { r++; continue; }
      const empNo = num(row[0]);
      if (empNo === null) { r++; continue; }

      // 4 שורות: תעריף / כמות / סה"כ / ה.קבע
      const labels = ['תעריף', 'כמות', 'סה"כ', 'ה.קבע'];
      const buckets = { rate: 4, qty: 5, total: 6, permanent: 7 }; // r-offset

      const emp = {
        employee_no: empNo,
        national_id: row[1] != null ? String(row[1]) : '',
        last_name: row[2] || '',
        first_name: row[3] || '',
        full_name: ((row[3] || '') + ' ' + (row[2] || '')).trim(),
        components: {},  // by code → {rate, qty, total, permanent, name}
      };

      for (const cc of componentColumns) {
        const rateRow = rows[r];
        const qtyRow = rows[r + 1];
        const totalRow = rows[r + 2];
        const permRow = rows[r + 3];
        const rate = rateRow ? num(rateRow[cc.col]) : null;
        const qty  = qtyRow ? num(qtyRow[cc.col]) : null;
        const total = totalRow ? num(totalRow[cc.col]) : null;
        const perm = permRow ? num(permRow[cc.col]) : null;
        if (rate === null && qty === null && total === null && perm === null) continue;
        emp.components[cc.code] = {
          code: cc.code,
          name: cc.name,
          rate: rate,
          qty: qty,
          total: total,
          permanent: perm,
        };
      }

      // סה"כ עובד (מהעמודה האחרונה אם זה דוח עם "סך הכל")
      const lastCol = nameRow.length - 1;
      if (nameRow[lastCol] && /^סך\s*הכל$/.test(String(nameRow[lastCol]).trim())) {
        const totalRow = rows[r + 2];
        emp.grand_total = totalRow ? num(totalRow[lastCol]) : null;
      }

      employees[empNo] = emp;
      r += 4;
    }

    return {
      kind: kind,
      employees: employees,
      components_dict: componentsDict,
    };
  }

  // ===== Absences parser (היעדרויות) =====
  //
  // מבנה (לכל עובד):
  //   שורת ראש: [emp_no, id, last, first, dept_no, dept_name, null, null, 'סוג: חופשה', ..., 'סוג: מחלה', ..., 'סוג: הבראה שנתית', ...]
  //   שורת "יתרת קודמת":  [null,...,'יתרת קודמת', null, null, null, null, vac_open, null, null, null, null, sick_open, null, ...]
  //                         (col13 = vacation prior balance, col19 = sick prior, col25 = recreation prior)
  //   שורות חודשיות (1..N): [null,...,month, null, null, vac_in, vac_accrued, vac_used, vac_balance, null, null, sick_in, sick_accrued, sick_used, sick_balance, null, null, rec_in, rec_accrued, rec_used, rec_balance, null, miluim]
  //   שורת "סה"כ לעובד:": [null,...,'סה"כ לעובד:', null, null, null, null, vac_in_sum, vac_accrued_sum, vac_used_sum, vac_balance_final, null, null, sick_in_sum, ...]
  //
  // עמודות (0-indexed) מהמיפוי שראינו:
  //   col0-5: emp details
  //   col6:   month number
  //   col7:   text label (יתרת קודמת / סה"כ לעובד:)
  //   col8:   "סוג: ..." header (only on header row)
  //   col9-12:  חופשה (קליטת יתרה / צבירה / ניצול / יתרה)
  //   col14:  "סוג: מחלה" header
  //   col15-18: מחלה (קליטת יתרה / צבירה / ניצול / יתרה)
  //   col20:  "סוג: הבראה שנתית" header
  //   col21-24: הבראה (קליטת יתרה / צבירה / ניצול / יתרה)
  //   col26:  מילואים (lone column)

  function parseAbsences(rows) {
    // הערה: שיקלולית מציבה את ה-label בשתי עמודות שונות:
    //  - "יתרת קודמת"   נמצא בעמודה 7  (col label_prior)
    //  - "סה"כ לעובד:" נמצא בעמודה 4  (col label_total) — דורסת את dept_no
    const COL = {
      emp_no: 0, id: 1, last: 2, first: 3, dept_no: 4, dept_name: 5,
      month: 6, label_prior: 7, label_total: 4,
      vac: { in: 9, accrued: 10, used: 11, balance: 12 },
      sick: { in: 15, accrued: 16, used: 17, balance: 18 },
      rec: { in: 21, accrued: 22, used: 23, balance: 24 },
      miluim: 26,
    };

    const employees = {};
    let r = 8; // R9 = first employee header row

    while (r < rows.length) {
      const row = rows[r];
      if (!row || row.every(v => v === null || v === '')) { r++; continue; }
      const empNo = num(row[COL.emp_no]);
      if (empNo === null) { r++; continue; }

      const emp = {
        employee_no: empNo,
        national_id: row[COL.id] != null ? String(row[COL.id]) : '',
        last_name: row[COL.last] || '',
        first_name: row[COL.first] || '',
        full_name: ((row[COL.first] || '') + ' ' + (row[COL.last] || '')).trim(),
        department_no: num(row[COL.dept_no]),
        department_name: row[COL.dept_name] || '',
        // לכל סוג נשמור: prior, monthly[{month,in,accrued,used,balance}], totals
        vacation: { prior: null, monthly: [], totals: null },
        sick:     { prior: null, monthly: [], totals: null },
        recreation: { prior: null, monthly: [], totals: null },
        miluim_total: 0,
      };

      r++; // move to "יתרת קודמת" or first content row

      // קוראים שורות עד שמגיעים לעובד הבא או לסוף
      while (r < rows.length) {
        const sub = rows[r];
        if (!sub) { r++; continue; }
        const subEmpNo = num(sub[COL.emp_no]);
        if (subEmpNo !== null) break; // found next employee

        const labelPrior = sub[COL.label_prior] ? String(sub[COL.label_prior]).trim() : '';
        const labelTotal = sub[COL.label_total] ? String(sub[COL.label_total]).trim() : '';
        const labelStr = /^סה"כ לעובד/.test(labelTotal) ? labelTotal : labelPrior;
        const monthVal = num(sub[COL.month]);

        if (labelStr === 'יתרת קודמת') {
          emp.vacation.prior = num(sub[COL.vac.balance]);
          emp.sick.prior     = num(sub[COL.sick.balance]);
          emp.recreation.prior = num(sub[COL.rec.balance]);
        } else if (/^סה"כ לעובד/.test(labelStr)) {
          emp.vacation.totals = {
            in: num(sub[COL.vac.in]),
            accrued: num(sub[COL.vac.accrued]),
            used: num(sub[COL.vac.used]),
            balance: num(sub[COL.vac.balance]),
          };
          emp.sick.totals = {
            in: num(sub[COL.sick.in]),
            accrued: num(sub[COL.sick.accrued]),
            used: num(sub[COL.sick.used]),
            balance: num(sub[COL.sick.balance]),
          };
          emp.recreation.totals = {
            in: num(sub[COL.rec.in]),
            accrued: num(sub[COL.rec.accrued]),
            used: num(sub[COL.rec.used]),
            balance: num(sub[COL.rec.balance]),
          };
          emp.miluim_total = num(sub[COL.miluim]) || 0;
        } else if (monthVal !== null && monthVal >= 1 && monthVal <= 12) {
          emp.vacation.monthly.push({
            month: monthVal,
            in: num(sub[COL.vac.in]),
            accrued: num(sub[COL.vac.accrued]),
            used: num(sub[COL.vac.used]),
            balance: num(sub[COL.vac.balance]),
          });
          emp.sick.monthly.push({
            month: monthVal,
            in: num(sub[COL.sick.in]),
            accrued: num(sub[COL.sick.accrued]),
            used: num(sub[COL.sick.used]),
            balance: num(sub[COL.sick.balance]),
          });
          emp.recreation.monthly.push({
            month: monthVal,
            in: num(sub[COL.rec.in]),
            accrued: num(sub[COL.rec.accrued]),
            used: num(sub[COL.rec.used]),
            balance: num(sub[COL.rec.balance]),
          });
          const m = num(sub[COL.miluim]);
          if (m !== null) {
            emp._miluim_by_month = emp._miluim_by_month || {};
            emp._miluim_by_month[monthVal] = m;
          }
        }

        r++;
      }

      employees[empNo] = emp;
    }

    return {
      kind: 'absences',
      employees: employees,
    };
  }

  // ===== Public API =====

  function parseFile(arrayBuffer, fileName) {
    const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
    const rows = readSheet(wb);
    const kind = detectReportKind(rows);
    const title = String((rows[1] && rows[1][0]) || '').trim();
    const period = parsePeriodFromTitle(title);
    const meta = {
      file_name: fileName || '',
      kind: kind,
      title: title,
      period: period,
      generated_by: String((rows[3] && rows[3][0]) || ''),
      total_rows: rows.length,
    };

    let parsed;
    if (kind === 'components' || kind === 'imputed_income' || kind === 'voluntary_deductions') {
      parsed = parseMatrix(rows, kind);
    } else if (kind === 'absences') {
      parsed = parseAbsences(rows);
    } else {
      throw new Error('סוג דוח לא מזוהה: ' + (title || '(ריק)') + '. ' +
        'יש להעלות רק דוחות שיקלולית: רכיבים לעובדים / הכנסות זקופות / ניכויי רשות / דו"ח העדרויות.');
    }

    return {
      meta: meta,
      ...parsed,
    };
  }

  function summary(parsed) {
    const empCount = Object.keys(parsed.employees || {}).length;
    const compCount = parsed.components_dict ? Object.keys(parsed.components_dict).length : 0;
    return {
      employee_count: empCount,
      component_count: compCount,
      kind: parsed.kind,
    };
  }

  return {
    parseFile: parseFile,
    summary: summary,
    detectReportKind: detectReportKind,
    parsePeriodFromTitle: parsePeriodFromTitle,
  };
})();
