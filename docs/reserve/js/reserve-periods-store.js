// reserve-periods-store.js
// אחסון תקופות מילואים שזוהו אוטומטית מ-Meckano + סטטוס פר תקופה.

window.ReservePeriodsStore = (function() {
  'use strict';

  const STORE_KEY = 'pandatech_reserve_periods_v1';

  function loadAll() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveAll(periods) {
    localStorage.setItem(STORE_KEY, JSON.stringify(periods));
  }

  // אחסון נסחף - מוסיף/מעדכן תקופות חדשות לפי start_date+employee_no.
  // תקופות שכבר נמצאות באחסון (אותו עובד+אותו תאריך התחלה) מתעדכנות בלבד
  // אם עדיין draft - אם sent/settled לא דורסים.
  function mergeFromDetection(detected) {
    const all = loadAll();
    const byKey = {};
    all.forEach(p => { byKey[p.employee_no + '|' + p.start_date] = p; });

    let added = 0, updated = 0, skipped = 0;
    detected.forEach(d => {
      const key = d.employee_no + '|' + d.start_date;
      const existing = byKey[key];
      if (!existing) {
        all.push({ ...d, id: Date.now() + Math.random(), created_at: new Date().toISOString() });
        added++;
      } else if (existing.status === 'draft') {
        Object.assign(existing, d, { updated_at: new Date().toISOString() });
        updated++;
      } else {
        skipped++;
      }
    });
    saveAll(all);
    return { added, updated, skipped, total: all.length };
  }

  function listForEmployee(empNo) {
    return loadAll().filter(p => String(p.employee_no) === String(empNo));
  }

  function listForPeriod(yearMonth) {
    return loadAll().filter(p => {
      return p.start_date && p.start_date.startsWith(yearMonth);
    });
  }

  function updateStatus(id, newStatus) {
    const all = loadAll();
    const p = all.find(x => x.id === id);
    if (p) {
      p.status = newStatus;
      p.updated_at = new Date().toISOString();
      saveAll(all);
    }
    return p;
  }

  function clearAll() { localStorage.removeItem(STORE_KEY); }

  return { loadAll, saveAll, mergeFromDetection, listForEmployee, listForPeriod, updateStatus, clearAll };
})();
