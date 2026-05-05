// manual-adjustments-store.js
// אחסון של תיקונים ידניים פר עובד פר חודש — להוספה/הפחתה של ימים
// כשהמערכת לא מזהה אותם נכון מ-Meckano (למשל: עובד שהשלים יום בדיעבד).
//
// מבנה רשומה:
//   {
//     id: 'emp_no|period|field' (key),
//     employee_no, period (YYYY-MM), field, delta, reason,
//     created_at, updated_at,
//   }
//
// שדות נתמכים (field):
//   - days_paid       ← ימים משולמים
//   - vacation_charged ← ימי חופשה
//   - sick            ← ימי מחלה
//   - sick_kizuz      ← מחלה לקיזוז
//   - miluim          ← ימי מילואים
//   - chalat          ← ימי חל"ת
//   - absence         ← ימי היעדרות
//   - work_accident   ← ימי תאונת עבודה
//   - hours_paid      ← שעות משולמות (delta)
//
// אסטרטגיה: localStorage cache + Supabase sync (כמו שאר ה-stores).

window.ManualAdjustmentsStore = (function() {
  'use strict';

  const STORE_KEY = 'pandatech_manual_adjustments_v1';

  function loadAll() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch (e) { return []; }
  }

  function saveAll(items) { localStorage.setItem(STORE_KEY, JSON.stringify(items)); }

  function periodKey(year, month) {
    return String(year) + '-' + String(month).padStart(2, '0');
  }

  function listForEmployeePeriod(employee_no, period) {
    return loadAll().filter(a => String(a.employee_no) === String(employee_no) && a.period === period);
  }

  function listForPeriod(period) {
    return loadAll().filter(a => a.period === period);
  }

  // Aggregate: עבור עובד+חודש, מחזיר סיכום delta לכל field.
  // למשל: { vacation_charged: +2, days_paid: +1, sick_kizuz: -1 }
  function aggregateForEmployee(employee_no, period) {
    const out = {};
    listForEmployeePeriod(employee_no, period).forEach(a => {
      out[a.field] = (out[a.field] || 0) + (a.delta || 0);
    });
    return out;
  }

  // הוספה/עדכון של תיקון ידני
  function upsert(employee_no, period, field, delta, reason) {
    const id = String(employee_no) + '|' + period + '|' + field;
    const all = loadAll();
    const idx = all.findIndex(a => a.id === id);
    const item = {
      id: id,
      employee_no: String(employee_no),
      period: period,
      field: field,
      delta: parseFloat(delta) || 0,
      reason: reason || '',
      updated_at: new Date().toISOString(),
    };
    if (idx >= 0) {
      item.created_at = all[idx].created_at;
      all[idx] = item;
    } else {
      item.created_at = item.updated_at;
      all.push(item);
    }
    saveAll(all);
    pushOneToSupabase(item);
    return item;
  }

  function remove(employee_no, period, field) {
    const id = String(employee_no) + '|' + period + '|' + field;
    const all = loadAll();
    const filtered = all.filter(a => a.id !== id);
    saveAll(filtered);
    if (isSupabaseAvailable()) {
      SB.client.from('manual_adjustments')
        .delete()
        .eq('employee_no', String(employee_no))
        .eq('period', period)
        .eq('field', field)
        .then(() => {})
        .catch(e => console.warn('SB delete adjustment failed:', e));
    }
  }

  function removeAllForEmployeePeriod(employee_no, period) {
    const all = loadAll();
    const filtered = all.filter(a =>
      !(String(a.employee_no) === String(employee_no) && a.period === period));
    saveAll(filtered);
    if (isSupabaseAvailable()) {
      SB.client.from('manual_adjustments')
        .delete()
        .eq('employee_no', String(employee_no))
        .eq('period', period)
        .then(() => {})
        .catch(e => console.warn('SB delete all failed:', e));
    }
  }

  // ===== Supabase sync =====
  function isSupabaseAvailable() {
    return typeof SB !== 'undefined' && SB && SB.client;
  }

  function pushOneToSupabase(item) {
    if (!isSupabaseAvailable() || !item) return;
    SB.getSession().then(s => {
      if (!s) return;
      const payload = {
        employee_no: item.employee_no,
        period: item.period,
        field: item.field,
        delta: item.delta,
        reason: item.reason || '',
      };
      // Upsert — לא קיים unique constraint (id is auto), אז delete-then-insert
      SB.client.from('manual_adjustments')
        .delete()
        .eq('employee_no', item.employee_no)
        .eq('period', item.period)
        .eq('field', item.field)
        .then(() => {
          SB.client.from('manual_adjustments').insert(payload)
            .then(({ error }) => { if (error) console.warn('SB push adjustment failed:', error); });
        });
    });
  }

  async function pushAllToSupabase() {
    if (!isSupabaseAvailable()) return { ok: false, reason: 'no_client' };
    const session = await SB.getSession();
    if (!session) return { ok: false, reason: 'no_session' };
    const all = loadAll();
    if (!all.length) return { ok: true, count: 0 };
    let count = 0;
    for (const item of all) {
      try { pushOneToSupabase(item); count++; } catch (e) {}
    }
    return { ok: true, count: count };
  }

  async function syncFromSupabase() {
    if (!isSupabaseAvailable()) return { ok: false, reason: 'no_client' };
    const session = await SB.getSession();
    if (!session) return { ok: false, reason: 'no_session' };
    const { data, error } = await SB.client.from('manual_adjustments').select('*');
    if (error) return { ok: false, reason: 'error', error };
    const items = (data || []).map(d => ({
      id: String(d.employee_no) + '|' + d.period + '|' + d.field,
      employee_no: String(d.employee_no),
      period: d.period,
      field: d.field,
      delta: d.delta,
      reason: d.reason || '',
      created_at: d.created_at,
      updated_at: d.created_at,
    }));
    saveAll(items);
    return { ok: true, count: items.length };
  }

  return {
    loadAll, listForEmployeePeriod, listForPeriod,
    aggregateForEmployee, upsert, remove, removeAllForEmployeePeriod,
    periodKey, pushAllToSupabase, syncFromSupabase, isSupabaseAvailable,
  };
})();
