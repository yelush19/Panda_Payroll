// em-index-store.js
// שכבת אחסון לאינדקס העובדים (localStorage כברירת מחדל; ניתן להחלפה ל-Supabase בעתיד).
// אין לוגיקה עסקית כאן - רק קריאה/כתיבה.

window.EmIndexStore = (function() {
  'use strict';

  const STORE_KEY = 'pandatech_reserve_employees_v1';
  const META_KEY  = 'pandatech_reserve_employees_meta_v1';

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
