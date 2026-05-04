// manual-summary-validator.js
// השוואת תוצאות הפארסר מול גיליון '1.סיכום ימים' שמולא ידנית.
// מטרה: לוודא שהמספרים שהפארסר חילץ ב-Meckano תואמים את העבודה הידנית, לפני בניית הדוחות האוטומטיים.

window.ManualSummaryValidator = (function() {
  'use strict';

  const SHEET_NAME = '1.סיכום ימים';

  // מיפוי כותרת בגיליון הידני → מקור בנתוני הפארסר
  // path: 'summary.X' או 'events.X'
  const FIELD_MAP = {
    'ימי נוכחות':    'summary.days_present',
    'חופש קיים':     'events.vacation_existing',
    'חופשה לחיוב':   'events.vacation_charged',
    'מילואים':       'events.miluim',
    'תאונת עבודה':   'events.work_accident',
    'ימי מחלה':      'events.sick',
    'חג':            'events.holiday',
    'ערב חג':        'events.eve_holiday',
    'חוה"מ':         'events.chol_hamoed',
    'ימים משולמים':  'summary.days_paid',
    'חל"ת':          'events.chalat',
    'היעדרות':       'events.absence',
    // הערה: 'מחלה לקיזוז' / 'סה"כ חופשה' לא נשווים — זה חישוב שיבוא בשלב F (חוקי מחלה).
  };

  function validate(workbook, parsedBlocks) {
    if (!workbook.Sheets[SHEET_NAME]) {
      return {
        sheet_found: false,
        message: 'לא נמצא גיליון "' + SHEET_NAME + '" בקובץ — אין נגד מה להשוות.',
      };
    }
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[SHEET_NAME], { header: 1, defval: null });

    // איתור שורת הכותרות (מכילה 'מס' עובד')
    let headerIdx = -1;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const row = rows[i] || [];
      const a = String(row[0] || '').trim();
      if (a === "מס' עובד" || a === 'מס\' עובד' || a === 'מספר עובד') {
        headerIdx = i; break;
      }
    }
    if (headerIdx === -1) {
      return {
        sheet_found: true,
        message: 'גיליון נמצא אך לא הצלחתי לזהות את שורת הכותרות.',
      };
    }
    const headers = rows[headerIdx].map(h => String(h || '').trim());
    const colByLabel = {};
    headers.forEach((h, i) => { if (h) colByLabel[h] = i; });

    // אינדוקס בלוקי הפארסר לפי מס' עובד
    const blocksByNo = {};
    parsedBlocks.forEach(b => { blocksByNo[String(b.employee_no)] = b; });

    const results = [];
    let totalChecks = 0, matches = 0, mismatches = 0, missingInArchive = 0, missingInManual = 0;
    const seenManualNos = new Set();

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const empNoCell = row[colByLabel["מס' עובד"]];
      if (empNoCell === null || empNoCell === undefined || empNoCell === '') continue;
      const empNo = String(empNoCell).trim();
      seenManualNos.add(empNo);

      const block = blocksByNo[empNo];
      if (!block) {
        missingInArchive++;
        results.push({
          employee_no: empNo,
          employee_name: String(row[colByLabel['שם עובד']] || '').trim(),
          status: 'missing_in_archive',
          checks: [],
        });
        continue;
      }

      const checks = [];
      Object.entries(FIELD_MAP).forEach(([label, path]) => {
        if (!(label in colByLabel)) return;
        const manualVal = numOrNull(row[colByLabel[label]]);
        const parsedVal = readPath(block, path);
        const ok = compareValues(manualVal, parsedVal);
        checks.push({ field: label, manual: manualVal, parsed: parsedVal, ok: ok });
        totalChecks++;
        if (ok) matches++; else mismatches++;
      });

      results.push({
        employee_no:   empNo,
        employee_name: block.employee_name,
        status:        checks.every(c => c.ok) ? 'ok' : 'mismatch',
        checks:        checks,
      });
    }

    // עובדים שיש בארכיון אבל אינם בגיליון הידני
    Object.keys(blocksByNo).forEach(no => {
      if (!seenManualNos.has(no)) {
        missingInManual++;
        results.push({
          employee_no:   no,
          employee_name: blocksByNo[no].employee_name,
          status:        'missing_in_manual',
          checks:        [],
        });
      }
    });

    return {
      sheet_found: true,
      stats: {
        employees_in_manual:    seenManualNos.size,
        employees_in_archive:   parsedBlocks.length,
        missing_in_archive:     missingInArchive,
        missing_in_manual:      missingInManual,
        total_field_checks:     totalChecks,
        matches:                matches,
        mismatches:             mismatches,
        match_rate:             totalChecks ? (matches / totalChecks) : 1,
      },
      results: results,
    };
  }

  function readPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? null : o[k]), obj);
  }

  function numOrNull(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    const n = parseFloat(String(v).trim());
    return isNaN(n) ? 0 : n;
  }

  // השוואה עם סובלנות לטעויות עיגול קלות (0.01)
  function compareValues(a, b) {
    const na = a === null || a === undefined || a === '' ? 0 : Number(a);
    const nb = b === null || b === undefined || b === '' ? 0 : Number(b);
    if (isNaN(na) || isNaN(nb)) return false;
    return Math.abs(na - nb) < 0.01;
  }

  return { validate, SHEET_NAME, FIELD_MAP };
})();
