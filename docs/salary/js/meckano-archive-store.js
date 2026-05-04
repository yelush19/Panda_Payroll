// meckano-archive-store.js
// אחסון ארכיון של דוחות Meckano חודשיים שעובדו - ב-localStorage.
// נתונים נשמרים פר חודש כדי לאפשר טעינה סלקטיבית (ולא לטעון את הכל בכל פעם).
//
// מבנה אחסון:
//   pandatech_meckano_archive_index   = רשימת מטא של כל החודשים השמורים
//   pandatech_meckano_archive_2026-04 = הנתונים המעובדים של חודש מסוים
//
// בעתיד נעבור ל-IndexedDB / Supabase אם נצטרך מקום רב יותר או שיתוף בין משתמשים.

window.MeckanoArchiveStore = (function() {
  'use strict';

  const INDEX_KEY  = 'pandatech_meckano_archive_index';
  const PREFIX     = 'pandatech_meckano_archive_';

  // ===== Index management =====

  function loadIndex() {
    try {
      const raw = localStorage.getItem(INDEX_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveIndex(idx) {
    localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
  }

  function periodKey(year, month) {
    return String(year) + '-' + String(month).padStart(2, '0');
  }

  // ===== Archive management =====

  function saveArchive(year, month, data) {
    const key = PREFIX + periodKey(year, month);
    const payload = {
      year: year,
      month: month,
      saved_at: new Date().toISOString(),
      ...data,
    };
    const json = JSON.stringify(payload);
    try {
      localStorage.setItem(key, json);
    } catch (e) {
      throw new Error(
        'שגיאת שמירה: זיכרון הדפדפן מלא. ' +
        'נסי למחוק חודשים ישנים מהארכיון. (' + e.message + ')'
      );
    }

    // Update index
    const idx = loadIndex();
    const existing = idx.findIndex(x => x.year === year && x.month === month);
    const meta = {
      year: year,
      month: month,
      period: periodKey(year, month),
      saved_at: payload.saved_at,
      file_name: data.file_name || '',
      total_blocks: data.total_blocks || 0,
      size_bytes: json.length,
    };
    if (existing >= 0) {
      idx[existing] = meta;
    } else {
      idx.push(meta);
    }
    idx.sort((a, b) => b.period.localeCompare(a.period));
    saveIndex(idx);
    return meta;
  }

  function loadArchive(year, month) {
    try {
      const key = PREFIX + periodKey(year, month);
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function loadByPeriod(period) {
    try {
      const key = PREFIX + period;
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function deleteArchive(year, month) {
    const key = PREFIX + periodKey(year, month);
    localStorage.removeItem(key);
    const idx = loadIndex().filter(x => !(x.year === year && x.month === month));
    saveIndex(idx);
  }

  function clearAll() {
    const idx = loadIndex();
    idx.forEach(meta => {
      localStorage.removeItem(PREFIX + meta.period);
    });
    localStorage.removeItem(INDEX_KEY);
  }

  // ===== Per-employee lookup (for drill-down UI in A3) =====

  function findEmployeeBlock(year, month, employeeNo) {
    const arc = loadArchive(year, month);
    if (!arc || !arc.blocks) return null;
    return arc.blocks.find(b => String(b.employee_no) === String(employeeNo)) || null;
  }

  function findEmployeeAcrossPeriods(employeeNo) {
    const idx = loadIndex();
    const results = [];
    idx.forEach(meta => {
      const block = findEmployeeBlock(meta.year, meta.month, employeeNo);
      if (block) {
        results.push({
          period: meta.period,
          year: meta.year,
          month: meta.month,
          file_name: meta.file_name,
          block: block,
        });
      }
    });
    return results;
  }

  // ===== Backup / restore =====

  function exportFullBackup() {
    const idx = loadIndex();
    const data = {
      backup_version: 1,
      backup_type:    'meckano_archive_full',
      created_at:     new Date().toISOString(),
      periods:        {},
    };
    idx.forEach(meta => {
      const arc = loadByPeriod(meta.period);
      if (arc) data.periods[meta.period] = arc;
    });
    return data;
  }

  function importFullBackup(data) {
    if (!data || data.backup_type !== 'meckano_archive_full' || !data.periods) {
      throw new Error('קובץ הגיבוי אינו תקין');
    }
    let restored = 0;
    Object.entries(data.periods).forEach(([period, arc]) => {
      const [year, month] = period.split('-').map(Number);
      saveArchive(year, month, arc);
      restored++;
    });
    return restored;
  }

  // ===== Supabase sync =====
  // אסטרטגיה זהה ל-EmIndexStore: localStorage כ-cache, Supabase כמקור-אמת.

  function isSupabaseAvailable() {
    return typeof SB !== 'undefined' && SB && SB.client;
  }

  // העלאת רשומת חודש ל-Supabase. לא עוצר זרימה אם נכשל.
  async function pushArchiveToSupabase(year, month) {
    if (!isSupabaseAvailable()) return { ok: false, reason: 'no_client' };
    const session = await SB.getSession();
    if (!session) return { ok: false, reason: 'no_session' };
    const arc = loadArchive(year, month);
    if (!arc) return { ok: false, reason: 'no_local_data' };
    const payload = {
      period: periodKey(year, month),
      year: year,
      month: month,
      file_name: arc.file_name || null,
      total_blocks: arc.blocks ? arc.blocks.length : 0,
      sheet_name: arc.sheet_name || 'report',
      blocks: arc.blocks || [],
      workbook_sheets: arc.workbook_sheets || null,
    };
    const { data, error } = await SB.client
      .from('meckano_archives')
      .upsert(payload, { onConflict: 'period' })
      .select();
    if (error) {
      console.warn('Meckano push to Supabase failed:', error);
      return { ok: false, reason: 'error', error };
    }
    return { ok: true, period: payload.period };
  }

  // טעינת אינדקס מ-Supabase לתזוזה ב-UI (מבלי להעמיס את כל ה-blocks).
  async function syncIndexFromSupabase() {
    if (!isSupabaseAvailable()) return { ok: false, reason: 'no_client' };
    const session = await SB.getSession();
    if (!session) return { ok: false, reason: 'no_session' };
    const { data, error } = await SB.client
      .from('meckano_archives')
      .select('period, year, month, file_name, total_blocks, uploaded_at')
      .order('period', { ascending: false });
    if (error) {
      console.warn('Meckano index sync error:', error);
      return { ok: false, reason: 'error', error };
    }
    // עדכון אינדקס מקומי — נשמור מטא, אבל לא נדרוס ארכיון מקומי שכבר מורכב יותר
    const localIdx = loadIndex();
    const localPeriods = new Set(localIdx.map(m => m.period));
    let added = 0;
    (data || []).forEach(remote => {
      if (!localPeriods.has(remote.period)) {
        localIdx.push({
          year: remote.year,
          month: remote.month,
          period: remote.period,
          saved_at: remote.uploaded_at,
          file_name: remote.file_name,
          total_blocks: remote.total_blocks,
          size_bytes: 0,
          remote_only: true,
        });
        added++;
      }
    });
    localIdx.sort((a, b) => b.period.localeCompare(a.period));
    saveIndex(localIdx);
    return { ok: true, total: (data || []).length, added: added };
  }

  // שליפה מ-Supabase של חודש ספציפי לזיכרון מקומי (כשהמשתמש בוחר חודש שאין מקומית).
  async function fetchArchiveFromSupabase(year, month) {
    if (!isSupabaseAvailable()) return { ok: false, reason: 'no_client' };
    const session = await SB.getSession();
    if (!session) return { ok: false, reason: 'no_session' };
    const { data, error } = await SB.client
      .from('meckano_archives')
      .select('*')
      .eq('period', periodKey(year, month))
      .maybeSingle();
    if (error) {
      console.warn('Meckano fetch from Supabase error:', error);
      return { ok: false, reason: 'error', error };
    }
    if (!data) return { ok: false, reason: 'not_found' };
    saveArchive(year, month, {
      file_name: data.file_name,
      sheet_name: data.sheet_name,
      blocks: data.blocks || [],
      workbook_sheets: data.workbook_sheets,
      remote_pulled: true,
    });
    return { ok: true, period: data.period };
  }

  // שמירה מקומית + push אוטומטי ל-Supabase ברקע
  function saveArchiveAndSync(year, month, data) {
    const meta = saveArchive(year, month, data);
    if (isSupabaseAvailable()) {
      pushArchiveToSupabase(year, month).then(r => {
        if (r.ok) console.log('Meckano SB push: ' + r.period);
        else console.warn('Meckano SB push:', r.reason);
      });
    }
    return meta;
  }

  return {
    saveArchive,
    saveArchiveAndSync,
    loadArchive,
    loadByPeriod,
    deleteArchive,
    clearAll,
    loadIndex,
    findEmployeeBlock,
    findEmployeeAcrossPeriods,
    exportFullBackup,
    importFullBackup,
    periodKey,
    // Supabase
    pushArchiveToSupabase,
    syncIndexFromSupabase,
    fetchArchiveFromSupabase,
    isSupabaseAvailable,
  };
})();
