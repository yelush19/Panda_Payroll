// em-index-store.js
// שכבת אחסון לאינדקס עובדים מרכזי - משותף בין מודול שכר ומודול מילואים.
//
// אסטרטגיה:
// - localStorage כ-CACHE (קריאה סינכרונית מהירה)
// - Supabase כמקור-אמת (אחסון מתמשך, שיתוף בין מחשבים, לוגין)
// - בטעינת דף: init() מסנכרן מ-Supabase ל-localStorage
// - בעדכון: כתיבה ל-localStorage + push ברקע ל-Supabase
// - אם Supabase לא זמין (offline / לא מחובר) → fallback ל-localStorage בלבד

window.EmIndexStore = (function() {
  'use strict';

  const STORE_KEY = 'pandatech_employees_master_v1';
  const META_KEY  = 'pandatech_employees_master_meta_v1';
  const LEGACY_STORE_KEY = 'pandatech_reserve_employees_v1';
  const LEGACY_META_KEY  = 'pandatech_reserve_employees_meta_v1';

  // עמודות שאסור לשלוח ל-Supabase (generated / managed by DB)
  const SUPABASE_EXCLUDE = new Set(['full_name', 'imported_at', 'updated_at', 'created_at', 'id']);

  // שדות תאריך - אם '' צריך להפוך ל-null לפני Supabase
  const DATE_FIELDS = ['start_date', 'end_date', 'special_status_from', 'special_status_to'];

  // שדות מספריים - אם '' צריך להפוך ל-null
  const NUMERIC_FIELDS = [
    'global_overtime_hours', 'base_salary', 'hourly_rate',
    'pension_rate_employer', 'pension_rate_employee', 'compensation_rate',
    'advanced_study_rate_employer', 'advanced_study_rate_employee',
    'intensive_work_hours', 'meal_allowance_per_day',
    'vacation_balance_days', 'vacation_annual_quota',
    'sick_balance_days', 'recovery_balance_amount', 'recovery_used_amount',
  ];

  // ============== Migration from legacy localStorage key ==============

  function migrateLegacyIfNeeded() {
    try {
      const newRaw = localStorage.getItem(STORE_KEY);
      if (newRaw) return;
      const oldRaw = localStorage.getItem(LEGACY_STORE_KEY);
      if (!oldRaw) return;
      const oldEmployees = JSON.parse(oldRaw);
      const upgraded = oldEmployees.map(e => ({
        ...e,
        employee_type: e.employee_type === 'שכיר' ? 'גלובלי' : (e.employee_type || ''),
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
      console.log('✅ Legacy localStorage migration: ' + upgraded.length + ' employees');
    } catch (e) {
      console.warn('⚠️ Legacy migration error:', e);
    }
  }
  migrateLegacyIfNeeded();

  // ============== Sync API (localStorage cache) ==============

  function loadAll() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function loadMeta() {
    try {
      const raw = localStorage.getItem(META_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function _saveLocal(employees, meta) {
    localStorage.setItem(STORE_KEY, JSON.stringify(employees));
    if (meta) {
      localStorage.setItem(META_KEY, JSON.stringify({
        importedAt: new Date().toISOString(),
        ...meta,
      }));
    }
  }

  function clearAll() {
    localStorage.removeItem(STORE_KEY);
    localStorage.removeItem(META_KEY);
  }

  // ============== Async sync to/from Supabase ==============

  function isSupabaseAvailable() {
    return typeof SB !== 'undefined' && SB && SB.client;
  }

  function cleanForSupabase(emp) {
    const out = {};
    Object.keys(emp).forEach(k => {
      if (SUPABASE_EXCLUDE.has(k)) return;
      let v = emp[k];
      if (DATE_FIELDS.includes(k) && (v === '' || v === undefined)) v = null;
      if (NUMERIC_FIELDS.includes(k) && (v === '' || v === undefined)) v = null;
      // strip empty string for special_status enum
      if (k === 'special_status' && v === '') v = null;
      if (k === 'employee_type' && v === '') v = null;
      out[k] = v;
    });
    return out;
  }

  // טוען מ-Supabase ושומר ב-localStorage. אם אין session - לא עושה כלום.
  async function syncFromSupabase() {
    if (!isSupabaseAvailable()) return { ok: false, reason: 'no_client' };
    const session = await SB.getSession();
    if (!session) return { ok: false, reason: 'no_session' };
    const { data, error } = await SB.client.from('employees_master').select('*').order('employee_no');
    if (error) {
      console.error('Sync from Supabase error:', error);
      return { ok: false, reason: 'error', error };
    }
    _saveLocal(data || [], { source: 'supabase', count: (data || []).length });
    return { ok: true, count: (data || []).length };
  }

  // דוחף את כל הנתונים ל-Supabase (upsert לפי employee_no). מיגרציה ראשונית.
  async function pushAllToSupabase() {
    if (!isSupabaseAvailable()) return { ok: false, reason: 'no_client' };
    const session = await SB.getSession();
    if (!session) return { ok: false, reason: 'no_session' };
    const all = loadAll();
    if (all.length === 0) return { ok: true, count: 0, note: 'nothing to push' };
    const cleaned = all.map(cleanForSupabase).map(e => ({ ...e, source: e.source || 'manual', imported_at: e.imported_at || null }));
    // Supabase upsert
    const { data, error } = await SB.client
      .from('employees_master')
      .upsert(cleaned, { onConflict: 'employee_no' })
      .select();
    if (error) {
      console.error('Push to Supabase error:', error);
      return { ok: false, reason: 'error', error };
    }
    return { ok: true, count: (data || []).length };
  }

  // עדכון רשומה אחת. סינכרוני מנקודת המבט של הקורא, אבל ב-background מנסה לכתוב ל-Supabase.
  function update(employee_no, fields) {
    const all = loadAll();
    const idx = all.findIndex(e => String(e.employee_no) === String(employee_no));
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...fields, updated_at: new Date().toISOString() };
    localStorage.setItem(STORE_KEY, JSON.stringify(all));

    // Push to Supabase in background
    if (isSupabaseAvailable()) {
      const cleanFields = cleanForSupabase(fields);
      SB.client.from('employees_master')
        .update(cleanFields)
        .eq('employee_no', employee_no)
        .then(({ error }) => { if (error) console.warn('SB update failed (will retry next sync):', error); })
        .catch(e => console.warn('SB update exception:', e));
    }
    return all[idx];
  }

  // שומר את כל הרשימה (בעת ייבוא Em_Index חדש). דוחף ל-Supabase ברקע.
  function saveAll(employees, meta) {
    _saveLocal(employees, meta);
    if (isSupabaseAvailable()) {
      pushAllToSupabase().then(r => {
        if (r.ok) console.log('SB push: ' + r.count + ' employees synced');
        else     console.warn('SB push failed:', r.reason);
      });
    }
  }

  // אתחול בטעינת דף: מסנכרן מ-Supabase. מחזיר מצב.
  // אם יש נתונים ב-localStorage אבל לא ב-Supabase → מציע להעלות.
  async function init() {
    if (!isSupabaseAvailable()) return { mode: 'local-only' };
    const session = await SB.getSession();
    if (!session) return { mode: 'unauthenticated' };

    const remote = await syncFromSupabase();
    const localCount = loadAll().length;

    if (remote.ok && remote.count === 0 && localCount > 0) {
      return { mode: 'needs-bootstrap', local_count: localCount };
    }
    return { mode: 'synced', remote_count: remote.count, local_count: localCount };
  }

  return {
    // Sync API (כמו קודם)
    saveAll, loadAll, loadMeta, update, clearAll,
    // Async API חדש ל-Supabase
    init, syncFromSupabase, pushAllToSupabase, isSupabaseAvailable,
  };
})();
