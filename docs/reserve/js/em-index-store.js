// em-index-store.js
// שכבת אחסון לאינדקס עובדים מרכזי - משותף בין מודול שכר ומודול מילואים.
// localStorage כברירת מחדל; ניתן להחלפה ל-Supabase בעתיד.

window.EmIndexStore = (function() {
  'use strict';

  // אינדקס מרכזי משותף בין מודולים
  const STORE_KEY = 'pandatech_employees_master_v1';
  const META_KEY  = 'pandatech_employees_master_meta_v1';

  // מפתחות ישנים - לצורך מיגרציה אוטומטית מנתונים שמילא המשתמש לפני המעבר
  const LEGACY_STORE_KEY = 'pandatech_reserve_employees_v1';
  const LEGACY_META_KEY  = 'pandatech_reserve_employees_meta_v1';

  // מיגרציה חד פעמית: אם יש נתונים במפתח הישן ולא במפתח החדש - מעבירים.
  // לא מוחקים את הישן, כדי שיהיה גיבוי אם משהו השתבש.
  function migrateLegacyIfNeeded() {
    try {
      const newRaw = localStorage.getItem(STORE_KEY);
      if (newRaw) return; // כבר עברנו

      const oldRaw = localStorage.getItem(LEGACY_STORE_KEY);
      if (!oldRaw) return; // אין נתונים ישנים

      // העתקת נתונים + שדרוג שמות סטטוסים (שכיר -> גלובלי)
      const oldEmployees = JSON.parse(oldRaw);
      const upgraded = oldEmployees.map(e => ({
        ...e,
        employee_type: e.employee_type === 'שכיר' ? 'גלובלי' : (e.employee_type || ''),
        // הוספת שדות סטטוס מיוחד אם עוד לא קיימים
        special_status:      e.special_status      || '',
        special_status_from: e.special_status_from || '',
        special_status_to:   e.special_status_to   || '',
      }));
      localStorage.setItem(STORE_KEY, JSON.stringify(upgraded));

      const oldMeta = localStorage.getItem(LEGACY_META_KEY);
      if (oldMeta) {
        const meta = JSON.parse(oldMeta);
        meta.migrated_from_legacy_at = new Date().toISOString();
        localStorage.setItem(META_KEY, JSON.stringify(meta));
      }
      console.log('✅ מיגרציה הושלמה: ' + upgraded.length + ' עובדים הועברו לאחסון המרכזי');
    } catch (e) {
      console.warn('⚠️ שגיאה במיגרציה:', e);
    }
  }

  migrateLegacyIfNeeded();

  function saveAll(employees, meta) {
    localStorage.setItem(STORE_KEY, JSON.stringify(employees));
    if (meta) {
      const fullMeta = {
        importedAt: new Date().toISOString(),
        ...meta,
      };
      localStorage.setItem(META_KEY, JSON.stringify(fullMeta));
    }
  }

  function loadAll() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('שגיאת קריאה מהאחסון:', e);
      return [];
    }
  }

  function loadMeta() {
    try {
      const raw = localStorage.getItem(META_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function update(employee_no, fields) {
    const all = loadAll();
    const idx = all.findIndex(e => String(e.employee_no) === String(employee_no));
    if (idx === -1) return null;
    all[idx] = {
      ...all[idx],
      ...fields,
      updated_at: new Date().toISOString(),
    };
    localStorage.setItem(STORE_KEY, JSON.stringify(all));
    return all[idx];
  }

  function clearAll() {
    localStorage.removeItem(STORE_KEY);
    localStorage.removeItem(META_KEY);
  }

  return { saveAll, loadAll, loadMeta, update, clearAll };
})();
