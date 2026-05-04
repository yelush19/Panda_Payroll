// meckano-report-parser.js
// פירסור גיליון 'report' של קובץ Meckano חודשי - מבנה בלוק-לעובד.
// זיהוי דינמי של עמודות לפי כותרות (לא לפי מיקום קבוע) - עמיד בפני שינויים.
//
// מבנה בלוק (~52 שורות):
//   שורה 1: שם עובד (A) | חברה (D) | מחלקה (G)
//   שורה 2: טווח תאריכים (A) | מספר עובד (F) | סוג חוזה (H)
//   שורה 3: כותרות (תאריך | סוג | כניסה | יציאה | סה"כ שעות | הפסקה | שעות משולמות | תקן | חוסר בתקן | 100% | 125% | 150%? | שעות עודף | איחור | אירוע | הערה | תוספת)
//   שורות 4-37: ימים (יום חול / סופ"ש / חג / ערב חג / חול המועד) + שורות 'ס.שבועי' של סיכום שבועי
//   שורות 38-40: 'חישוב יומי' / 'סיכום חודשי' (HH:MM ועשרוני)
//   שורות 41+: בלוק 'סיכום' - שדות עם תוויות בעמודה A וערכים בעמודה C; אזור 'הצגת אירועים' עם תוויות בעמודה I וערכים בעמודה K

window.MeckanoReportParser = (function() {
  'use strict';

  const SHEET_NAME = 'report';
  const HEADER_MARKER = 'תאריך';

  // מיפוי שדות מקור → שם פנימי (snake_case). כל שדה יכול להופיע במספר ניסוחים.
  const COLUMN_DEFS = {
    date:           ['תאריך'],
    day_type:       ['סוג'],
    entry:          ['כניסה'],
    exit:           ['יציאה'],
    hours_total:    ['סה"כ שעות', 'סהכ שעות'],
    break_time:     ['הפסקה'],
    hours_paid:     ['שעות משולמות'],
    hours_standard: ['תקן'],
    hours_missing:  ['חוסר בתקן', 'חוסר תקן'],
    hours_100:      ['100%'],
    hours_125:      ['125%'],
    hours_150:      ['150%'],
    hours_excess:   ['שעות עודף'],
    late:           ['איחור'],
    event:          ['אירוע'],
    note:           ['הערה'],
    bonus:          ['תוספת'],
  };

  // תוויות סיכום - שדה ב-A, ערך ב-C
  const SUMMARY_LABELS_A = {
    days_present:      ['ימי נוכחות'],
    days_paid:         ['ימים משולמים'],
    hours_present:     ['שעות נוכחות'],
    hours_standard:    ['שעות תקן'],
    hours_paid:        ['שעות משולמות'],
    hours_missing:     ['שעות חוסר'],
    fake_deficit:      ['הפחתה מדומה'],          // הפחתה מדומה (ע.חג/חג)
    hours_missing_net: ['סה"כ חוסר מעודכן'],
    break_total:       ['הפסקה'],
    miluim_work_hours: ['שעות עבודה במילואים'],
  };

  // תוויות שעות נוספות - שדה ב-E, ערך ב-G
  const SUMMARY_LABELS_E = {
    hours_100: ['100%'],
    hours_125: ['125%'],
    hours_150: ['150%'],
  };

  // אירועים - תווית ב-I, ערך ב-K
  const EVENT_LABELS_I = {
    holiday:           ['חג'],
    eve_holiday:       ['ערב חג'],
    chol_hamoed:       ['חול המועד', 'חוה"מ'],
    vacation_existing: ['חופש'],
    vacation_eve:      ['חופש בע.חג', 'חופש בעחג'],
    vacation_chm:      ['חופש בחוה"מ', 'חופש בחומ'],
    vacation_charged:  ['חופשה לחיוב'],
    sick:              ['מחלה'],
    miluim:            ['מילואים'],
    work_accident:     ['תאונת עבודה'],
    chalat:            ['חל"ת', 'חלת'],
    absence:           ['היעדרות'],
  };

  function parseFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('שגיאת קריאת קובץ'));
      reader.onload = (e) => {
        try {
          if (typeof XLSX === 'undefined') {
            return reject(new Error('ספריית XLSX לא נטענה'));
          }
          const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          if (!wb.Sheets[SHEET_NAME]) {
            const avail = wb.SheetNames.join(', ');
            return reject(new Error(
              `גיליון "${SHEET_NAME}" לא נמצא בקובץ. גיליונות קיימים: ${avail}`
            ));
          }
          const result = parseSheet(wb.Sheets[SHEET_NAME]);
          result.workbook_sheets = wb.SheetNames;
          resolve(result);
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function parseSheet(sheet) {
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    // איתור כל שורות הכותרת (תחילת בלוק)
    const headerIdxs = [];
    for (let i = 0; i < rows.length; i++) {
      const a = String((rows[i] && rows[i][0]) || '').trim();
      if (a === HEADER_MARKER) headerIdxs.push(i);
    }
    if (headerIdxs.length === 0) {
      throw new Error('לא נמצא ולו בלוק תקין בגיליון report.');
    }

    const blocks = [];
    for (let b = 0; b < headerIdxs.length; b++) {
      const hi      = headerIdxs[b];
      const nextHi  = b + 1 < headerIdxs.length ? headerIdxs[b + 1] : rows.length + 2;
      // הבלוק מסתיים שתי שורות לפני הכותרת הבאה (כי הבלוק הבא מתחיל ב-name + date_range)
      const blockEnd = (b + 1 < headerIdxs.length) ? nextHi - 2 : rows.length;

      const headerRow = rows[hi] || [];
      const colMap    = mapColumns(headerRow);
      const unknownCols = collectUnknownColumns(headerRow, colMap);

      const nameRow  = rows[hi - 2] || [];
      const dateRow  = rows[hi - 1] || [];
      const meta = parseMetaRows(nameRow, dateRow);

      const days = [];
      const summary = {};
      const events  = {};

      for (let r = hi + 1; r < blockEnd; r++) {
        const row = rows[r] || [];
        const a = String((row[0] ?? '')).trim();
        if (!a) continue;

        if (isDailyMarker(a)) {
          days.push(parseDailyRow(row, colMap, a));
        } else if (a === 'ס.שבועי' || a.startsWith('חישוב יומי') || a.startsWith('סיכום חודשי')) {
          // דילוג - לא רלוונטי לסיכום פר-עובד
          continue;
        } else if (a === 'סיכום') {
          // תווית של חלק הסיכום - מחפש שדות בשורות הבאות
          continue;
        } else {
          // שורת סיכום עם תוויות - חילוץ שדה
          extractSummaryRow(row, summary, events);
        }
      }

      blocks.push({
        employee_name:   meta.name,
        employee_no:     meta.employee_no,
        company:         meta.company,
        department:      meta.department,
        date_range:      meta.date_range,
        contract_type:   meta.contract_type,
        column_map:      colMap,
        unknown_columns: unknownCols,
        days:            days,
        summary:         summary,
        events:          events,
        block_row_start: hi - 1,  // 1-based row of name
        block_row_end:   blockEnd, // 0-based exclusive end
      });
    }

    return {
      sheet_name: SHEET_NAME,
      total_blocks: blocks.length,
      blocks: blocks,
    };
  }

  // ===== עזרים =====

  function mapColumns(headerRow) {
    const map = {};
    Object.entries(COLUMN_DEFS).forEach(([key, aliases]) => {
      for (let i = 0; i < headerRow.length; i++) {
        const cell = String(headerRow[i] || '').trim();
        if (aliases.includes(cell)) {
          map[key] = i;
          break;
        }
      }
    });
    return map;
  }

  function collectUnknownColumns(headerRow, colMap) {
    // כותרות שאינן ידועות - נשמרות כהערה, לתשומת לב המשתמש (סעיף 11.1 באפיון)
    const knownIdxs = new Set(Object.values(colMap));
    const allKnownAliases = new Set();
    Object.values(COLUMN_DEFS).forEach(arr => arr.forEach(a => allKnownAliases.add(a)));

    const unknowns = [];
    for (let i = 0; i < headerRow.length; i++) {
      const cell = String(headerRow[i] || '').trim();
      if (!cell) continue;
      if (knownIdxs.has(i)) continue;
      if (allKnownAliases.has(cell)) continue;
      unknowns.push({ col: i, value: cell });
    }
    return unknowns;
  }

  function parseMetaRows(nameRow, dateRow) {
    const name        = String(nameRow[0] || '').trim();
    const company     = String(nameRow[3] || '').trim();
    const department  = String(nameRow[6] || '').trim();
    const dateRange   = String(dateRow[0] || '').trim();
    const empNoCell   = dateRow[5];
    const employee_no = empNoCell !== null && empNoCell !== undefined && empNoCell !== ''
      ? String(empNoCell).trim()
      : '';
    const contract_type = String(dateRow[7] || '').trim();
    return {
      name, company, department,
      date_range: dateRange,
      employee_no,
      contract_type,
    };
  }

  // האם זו שורת יום? תבנית: "ד - 01" / "ש - 25" וכו' (אות עברית, רווח, מקף, רווח, ספרה)
  const DAILY_REGEX = /^[א-ת]\s*-\s*\d{1,2}$/;
  function isDailyMarker(s) { return DAILY_REGEX.test(s); }

  function parseDailyRow(row, colMap, marker) {
    const parts = marker.split('-').map(s => s.trim());
    const dayLetter = parts[0]; // א/ב/ג/ד/ה/ו/ש
    const dayNumber = parseInt(parts[1], 10);

    function get(key) {
      const idx = colMap[key];
      if (idx === undefined) return null;
      const v = row[idx];
      if (v === null || v === undefined || v === '') return null;
      return v;
    }

    return {
      day_letter:   dayLetter,
      day_number:   dayNumber,
      day_type:     toStr(get('day_type')),
      entry:        toStr(get('entry')),
      exit:         toStr(get('exit')),
      hours_total:  toStr(get('hours_total')),
      break_time:   toStr(get('break_time')),
      hours_paid:   toStr(get('hours_paid')),
      hours_standard: toStr(get('hours_standard')),
      hours_missing: toStr(get('hours_missing')),
      hours_100:    toStr(get('hours_100')),
      hours_125:    toStr(get('hours_125')),
      hours_150:    toStr(get('hours_150')),
      hours_excess: toStr(get('hours_excess')),
      late:         toStr(get('late')),
      event:        toStr(get('event')),
      note:         toStr(get('note')),
      bonus:        toStr(get('bonus')),
    };
  }

  function toStr(v) {
    if (v === null || v === undefined) return '';
    return String(v).trim();
  }

  function extractSummaryRow(row, summary, events) {
    // תויות ב-A (ערכים ב-C, אינדקס 2)
    const labelA = String(row[0] || '').trim();
    const valueC = row[2];
    if (labelA) matchLabel(SUMMARY_LABELS_A, labelA, valueC, summary);

    // תוויות ב-E (ערכים ב-G, אינדקס 6)
    const labelE = String(row[4] || '').trim();
    const valueG = row[6];
    if (labelE) matchLabel(SUMMARY_LABELS_E, labelE, valueG, summary);

    // תוויות ב-I (ערכים ב-K, אינדקס 10)
    const labelI = String(row[8] || '').trim();
    const valueK = row[10];
    if (labelI) matchLabel(EVENT_LABELS_I, labelI, valueK, events);
  }

  function matchLabel(defs, label, value, target) {
    // התאמה גמישה: התווית בקובץ עשויה לכלול תוספות/סוגריים
    // (כגון 'הפחתה מדומה (ע.חג/חג)') - לכן startsWith ולא eq.
    const trimmed = label.trim();
    for (const [key, aliases] of Object.entries(defs)) {
      for (const alias of aliases) {
        if (trimmed === alias || trimmed.startsWith(alias + ' ') || trimmed.startsWith(alias + '(')) {
          target[key] = numOrNull(value);
          return;
        }
      }
    }
  }

  function numOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return v;
    const s = String(v).trim();
    if (!s) return null;
    const n = parseFloat(s);
    return isNaN(n) ? s : n;
  }

  return {
    parseFile,
    parseSheet,
    SHEET_NAME,
    COLUMN_DEFS,
    SUMMARY_LABELS_A,
    SUMMARY_LABELS_E,
    EVENT_LABELS_I,
  };
})();
