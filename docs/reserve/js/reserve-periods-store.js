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
      pushOneToSupabase(p);
    }
    return p;
  }

  // עדכון חלקי של רשומה
  function update(id, fields) {
    const all = loadAll();
    const p = all.find(x => x.id === id);
    if (!p) return null;
    Object.assign(p, fields, { updated_at: new Date().toISOString() });
    saveAll(all);
    pushOneToSupabase(p);
    return p;
  }

  function deleteOne(id) {
    const all = loadAll();
    const p = all.find(x => x.id === id);
    const remaining = all.filter(x => x.id !== id);
    saveAll(remaining);
    if (p && isSupabaseAvailable()) {
      // ננסה למחוק גם מ-Supabase לפי start_date+employee_no (אין primary key תואם)
      SB.client.from('reserve_periods')
        .delete()
        .eq('employee_no', String(p.employee_no))
        .eq('start_date', p.start_date)
        .then(() => {})
        .catch(e => console.warn('SB delete reserve failed:', e));
    }
    return true;
  }

  function clearAll() { localStorage.removeItem(STORE_KEY); }

  // ===== Supabase sync =====
  function isSupabaseAvailable() {
    return typeof SB !== 'undefined' && SB && SB.client;
  }

  function cleanForSupabase(p) {
    return {
      employee_no:    String(p.employee_no || ''),
      start_date:     p.start_date || null,
      end_date:       p.end_date || null,
      work_days:      p.work_days || null,
      weekend_days:   p.weekend_days || null,
      daily_rate_snapshot:  p.daily_rate_snapshot || null,
      expected_payment:     p.expected_payment || null,
      actual_paid:          p.actual_paid || null,
      bituach_leumi_amount: p.bituach_leumi_amount || null,
      bituach_leumi_received_at: p.bituach_leumi_received_at || null,
      diff_amount:    p.diff_amount || null,
      settlement_payroll_month: p.settlement_payroll_month || null,
      status:         p.status || 'draft',
      notes:          p.notes || null,
    };
  }

  function pushOneToSupabase(p) {
    if (!isSupabaseAvailable() || !p) return;
    SB.getSession().then(session => {
      if (!session) return;
      // Upsert לפי הצמד employee_no + start_date (אין PK ייחודי בכוונה)
      SB.client.from('reserve_periods')
        .upsert(cleanForSupabase(p), { onConflict: 'employee_no,start_date' })
        .then(({ error }) => { if (error) console.warn('Reserve push:', error); })
        .catch(e => console.warn('Reserve push exception:', e));
    });
  }

  async function pushAllToSupabase() {
    if (!isSupabaseAvailable()) return { ok: false, reason: 'no_client' };
    const session = await SB.getSession();
    if (!session) return { ok: false, reason: 'no_session' };
    const all = loadAll();
    if (!all.length) return { ok: true, count: 0, note: 'nothing to push' };
    const cleaned = all.map(cleanForSupabase);
    const { data, error } = await SB.client
      .from('reserve_periods')
      .upsert(cleaned, { onConflict: 'employee_no,start_date' })
      .select();
    if (error) {
      console.error('Reserve push all:', error);
      return { ok: false, reason: 'error', error };
    }
    return { ok: true, count: (data || []).length };
  }

  async function syncFromSupabase() {
    if (!isSupabaseAvailable()) return { ok: false, reason: 'no_client' };
    const session = await SB.getSession();
    if (!session) return { ok: false, reason: 'no_session' };
    const { data, error } = await SB.client.from('reserve_periods').select('*').order('start_date', { ascending: false });
    if (error) {
      console.error('Reserve sync:', error);
      return { ok: false, reason: 'error', error };
    }
    // ממזג עם נתונים מקומיים — נשמור local id, ננסה להתאים לפי emp+date
    const local = loadAll();
    const byKey = {};
    local.forEach(p => { byKey[p.employee_no + '|' + p.start_date] = p; });
    (data || []).forEach(remote => {
      const key = remote.employee_no + '|' + remote.start_date;
      const existing = byKey[key];
      if (existing) {
        Object.assign(existing, remote, { id: existing.id });
      } else {
        local.push({ ...remote, id: Date.now() + Math.random() });
      }
    });
    saveAll(local);
    return { ok: true, count: (data || []).length };
  }

  return {
    loadAll, saveAll, mergeFromDetection, listForEmployee, listForPeriod,
    updateStatus, update, deleteOne, clearAll,
    pushAllToSupabase, syncFromSupabase, isSupabaseAvailable,
  };
})();
