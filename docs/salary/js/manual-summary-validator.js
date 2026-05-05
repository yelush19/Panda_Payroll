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

    // אינדוקס בלוקי הפארסר לפי מס' עובד + לפי שם (fallback)
    const blocksByNo = {};
    const blocksByName = {};
    parsedBlocks.forEach(b => {
      blocksByNo[String(b.employee_no)] = b;
      const cleanName = normalizeName(b.employee_name);
      if (cleanName) blocksByName[cleanName] = b;
    });

    const results = [];
    let totalChecks = 0, matches = 0, mismatches = 0, missingInArchive = 0, missingInManual = 0;
    const seenManualNos = new Set();
    const matchedBlockNos = new Set();

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const empNoCell  = row[colByLabel["מס' עובד"]];
      const nameCell   = row[colByLabel['שם עובד']];
      if (empNoCell === null || empNoCell === undefined || empNoCell === '') continue;
      const empNoRaw  = String(empNoCell).trim();
      const nameRaw   = String(nameCell || '').trim();
      seenManualNos.add(empNoRaw);

      // התאמה ראשונה: לפי מספר עובד
      let block = blocksByNo[empNoRaw];

      // אם לא נמצא: fallback לפי שם (חשוב לקבלנים שנרשמים בלי מספר עובד)
      if (!block && nameRaw) {
        const possibleNames = extractNameCandidates(nameRaw);
        for (const cand of possibleNames) {
          const k = normalizeName(cand);
          if (blocksByName[k]) { block = blocksByName[k]; break; }
        }
      }

      // סינון קבלנים מהוולידציה — הם לא נכללים בדוחות בכל מקרה,
      // אז אין טעם להציג אי-התאמות לגביהם.
      // זיהוי: 1) שם הכותרת מכיל "קבלן" 2) ב-EmIndex employee_type=קבלן
      const isContractorByName = nameRaw.indexOf('קבלן') !== -1;
      let isContractorByType = false;
      if (typeof EmIndexStore !== 'undefined') {
        try {
          const list = EmIndexStore.loadAll() || [];
          const emp = list.find(e => String(e.employee_no) === empNoRaw);
          if (emp && (emp.employee_type === 'קבלן' || emp.employee_type === 'פרויקט')) {
            isContractorByType = true;
          }
        } catch (e) {}
      }
      if (isContractorByName || isContractorByType) {
        continue; // דלג, לא מוסיפים ל-results
      }

      if (!block) {
        missingInArchive++;
        results.push({
          employee_no: empNoRaw,
          employee_name: nameRaw,
          status: 'missing_in_archive',
          checks: [],
        });
        continue;
      }
      matchedBlockNos.add(String(block.employee_no));

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
        employee_no:   block.employee_no,    // המספר האמיתי מהארכיון
        manual_emp_no: empNoRaw,             // איך הופיע בגיליון הידני (יכול להיות 'קבלן')
        employee_name: block.employee_name,
        status:        checks.every(c => c.ok) ? 'ok' : 'mismatch',
        checks:        checks,
      });
    }

    // עובדים שיש בארכיון אבל אינם בגיליון הידני (לא נתפסו דרך name fallback)
    Object.keys(blocksByNo).forEach(no => {
      if (matchedBlockNos.has(no)) return;
      if (seenManualNos.has(no)) return;
      missingInManual++;
      results.push({
        employee_no:   no,
        employee_name: blocksByNo[no].employee_name,
        status:        'missing_in_manual',
        checks:        [],
      });
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

  // נירמול שם להשוואה: מסיר רווחים מרובים, מתעלם מסוגריים/קידומות.
  function normalizeName(s) {
    if (!s) return '';
    return String(s)
      .replace(/\s+/g, ' ')
      .replace(/["'״׳]/g, '')
      .trim()
      .toLowerCase();
  }

  // מחלץ שמות אפשריים מתוך תא בגיליון הידני.
  // דוגמה: "קבלן (אמיר אורון)" → ["אמיר אורון"]
  // דוגמה: "אמיר אורון - קבלן" → ["אמיר אורון"]
  // דוגמה רגילה: "אבישי לייבנזון" → ["אבישי לייבנזון"]
  function extractNameCandidates(raw) {
    const out = [];
    out.push(raw);
    const inParens = raw.match(/[(](.*?)[)]/);
    if (inParens) out.push(inParens[1]);
    // הסרת קידומות שכיחות
    out.push(raw.replace(/^\s*קבלן\s*[-–—:]?\s*/, '').trim());
    out.push(raw.replace(/\s*[-–—]\s*קבלן\s*$/, '').trim());
    // ניקוי סוגריים בכלל
    out.push(raw.replace(/[()]/g, '').replace(/\s*קבלן\s*/, '').trim());
    return [...new Set(out.filter(Boolean))];
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
