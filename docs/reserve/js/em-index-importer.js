// em-index-importer.js
// קריאת גיליון Em_Index מקובץ Meckano חודשי.
// זיהוי עמודות לפי כותרות (לא לפי מיקום) - עמיד לשינויים בסדר.

window.EmIndexImporter = (function() {
  'use strict';

  const SHEET_NAME = 'Em_Index';

  // סוגי עובד אפשריים (לעריכה ידנית במסך)
  const EMPLOYEE_TYPES = ['גלובלי', 'קבלן', 'שעתי', 'מנכ"ל', 'פרויקט'];

  // סטטוסים מיוחדים (חופפים על סוג עובד; דורשים תקופה: מ-תאריך, עד-תאריך)
  const SPECIAL_STATUSES = ['חופשת לידה', 'חל"ת', 'תאונת עבודה'];

  function parseFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('שגיאת קריאת קובץ'));
      reader.onload = (e) => {
        try {
          if (typeof XLSX === 'undefined') {
            return reject(new Error('ספריית XLSX לא נטענה'));
          }
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: 'array' });
          if (!wb.Sheets[SHEET_NAME]) {
            const available = wb.SheetNames.join(', ');
            return reject(new Error(
              `גיליון "${SHEET_NAME}" לא נמצא בקובץ. גיליונות שזוהו: ${available}.\n` +
              `ודאי שהעלית קובץ Meckano חודשי שמכיל את גיליון Em_Index.`
            ));
          }
          const employees = parseSheet(wb.Sheets[SHEET_NAME]);
          if (employees.length === 0) {
            return reject(new Error('גיליון Em_Index ריק או ללא שורות תקינות.'));
          }
          resolve({ employees, sheet: SHEET_NAME });
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function parseSheet(sheet) {
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    if (rows.length < 2) {
      throw new Error('גיליון Em_Index ריק (לא נמצאו כותרות + נתונים).');
    }

    // שורה 1 = כותרות. זיהוי גמיש לפי תוכן.
    const headers = (rows[0] || []).map(h => String(h || '').trim());
    const colMap = {
      employee_no: findCol(headers, ['מספר עובד', 'קוד עובד', 'מס עובד']),
      national_id: findCol(headers, ['מספר זהות', 'ת.ז', 'תז', 'ת"ז']),
      last_name:   findCol(headers, ['שם משפחה', 'משפחה']),
      first_name:  findCol(headers, ['שם פרטי', 'פרטי']),
    };

    const missing = Object.entries(colMap)
      .filter(([_, idx]) => idx === -1)
      .map(([k]) => labelOf(k));
    if (missing.length > 0) {
      throw new Error('כותרות חסרות בגיליון Em_Index: ' + missing.join(', ') +
                      '. כותרות שנמצאו: ' + headers.join(' | '));
    }

    const employees = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;

      const empNoRaw = row[colMap.employee_no];
      const natIdRaw = row[colMap.national_id];
      if (empNoRaw === null || empNoRaw === undefined || empNoRaw === '') continue;
      if (natIdRaw === null || natIdRaw === undefined || natIdRaw === '') continue;

      const last  = String(row[colMap.last_name]  || '').trim();
      const first = String(row[colMap.first_name] || '').trim();

      employees.push({
        employee_no: String(empNoRaw).trim(),
        national_id: String(natIdRaw).trim().padStart(9, '0'),
        last_name:   last,
        first_name:  first,
        full_name:   (first + ' ' + last).trim(),

        // שדות שדורשים השלמה ידנית (יוצגו ריקים, ניתנים לעריכה במסך):
        department:    '',
        employee_type: '',
        start_date:    '',
        end_date:      '',
        // סטטוס מיוחד (משותף לכל המודולים): חופשת לידה / חל"ת / תאונת עבודה
        special_status:      '',
        special_status_from: '',
        special_status_to:   '',
        notes:         '',

        source: 'em_index',
        imported_at: new Date().toISOString(),
      });
    }
    return employees;
  }

  function findCol(headers, candidates) {
    for (const cand of candidates) {
      const idx = headers.findIndex(h => h.includes(cand));
      if (idx !== -1) return idx;
    }
    return -1;
  }

  function labelOf(key) {
    return ({
      employee_no: 'מספר עובד',
      national_id: 'מספר זהות',
      last_name:   'שם משפחה',
      first_name:  'שם פרטי',
    })[key] || key;
  }

  return { parseFile, EMPLOYEE_TYPES, SPECIAL_STATUSES, SHEET_NAME };
})();
