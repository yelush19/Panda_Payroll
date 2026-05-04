// sortable-table.js
// תוסף משותף לטבלאות בדוחות: מיון בלחיצה על כותרת + הסתרת/הצגת עמודות.
//
// שימוש (פר דוח):
//
//   const TableHelper = SortableTable.create({
//     columns:    [{ key, label, group, type? }, ...],
//     storageKey: 'pandatech-table-state-' + reportName,  // אופציונלי
//   });
//
//   // לפני render: לאסוף state נוכחי
//   const sortedRows = TableHelper.sort(rows);
//   const visibleColumns = TableHelper.getVisibleColumns();
//
//   // אחרי render: לחבר handlers ל-th + לחשוב על column-toggle button
//   TableHelper.attachSortHandlers(document.querySelector('table thead'), () => render());
//
//   // הוספת כפתור הצגת/הסתרת עמודות:
//   TableHelper.renderColumnToggleButton(document.querySelector('#columnToggleArea'), () => render());

window.SortableTable = (function() {
  'use strict';

  function create(opts) {
    const columns    = opts.columns || [];
    const storageKey = opts.storageKey || null;

    // ===== State =====
    let sortKey  = null;
    let sortDir  = 1; // 1 ascending, -1 descending
    let hidden   = new Set();

    // טען state מ-localStorage אם הוגדר key
    if (storageKey) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const s = JSON.parse(raw);
          sortKey = s.sortKey || null;
          sortDir = s.sortDir === -1 ? -1 : 1;
          hidden  = new Set(s.hidden || []);
        }
      } catch (e) { /* ignore */ }
    }

    function saveState() {
      if (!storageKey) return;
      try {
        localStorage.setItem(storageKey, JSON.stringify({
          sortKey, sortDir,
          hidden: Array.from(hidden),
        }));
      } catch (e) { /* ignore */ }
    }

    // ===== Sort =====
    function sort(rows) {
      if (!sortKey) return rows;
      const col = columns.find(c => c.key === sortKey);
      if (!col) return rows;
      const sorted = [...rows];
      sorted.sort((a, b) => {
        let va = a[sortKey], vb = b[sortKey];
        // null / undefined treated as smallest
        if (va === null || va === undefined || va === '') va = (typeof vb === 'number' ? -Infinity : '');
        if (vb === null || vb === undefined || vb === '') vb = (typeof va === 'number' ? -Infinity : '');
        // numeric comparison if both numbers (or numeric strings)
        const na = parseFloat(va), nb = parseFloat(vb);
        if (!isNaN(na) && !isNaN(nb) && (typeof va === 'number' || /^-?\d+(\.\d+)?$/.test(String(va)))) {
          return (na - nb) * sortDir;
        }
        return String(va).localeCompare(String(vb), 'he') * sortDir;
      });
      return sorted;
    }

    function setSort(key) {
      if (sortKey === key) {
        sortDir *= -1;
      } else {
        sortKey = key;
        sortDir = 1;
      }
      saveState();
    }

    function clearSort() {
      sortKey = null;
      sortDir = 1;
      saveState();
    }

    // ===== Visibility =====
    function isVisible(key) { return !hidden.has(key); }
    function toggleVisible(key) {
      if (hidden.has(key)) hidden.delete(key); else hidden.add(key);
      saveState();
    }
    function showAll() { hidden.clear(); saveState(); }
    function getVisibleColumns() {
      return columns.filter(c => isVisible(c.key));
    }

    // ===== Header rendering helpers =====
    // מקבל TH element + col key. מחזיר את הסמל המתאים (חץ מעלה/מטה/לא ממוין)
    function getSortIndicator(key) {
      if (sortKey !== key) return '<span style="opacity:0.3;color:#9ca3af;">⇅</span>';
      return sortDir === 1
        ? '<span style="color:#1e40af;">▲</span>'
        : '<span style="color:#1e40af;">▼</span>';
    }

    // הופך את כל ה-th-ים בטבלה ללחיצים. אחרי הקליק - קורא ל-rerender.
    function attachSortHandlers(theadEl, rerender) {
      if (!theadEl) return;
      const ths = theadEl.querySelectorAll('th[data-sort-key]');
      ths.forEach(th => {
        th.style.cursor = 'pointer';
        th.style.userSelect = 'none';
        th.addEventListener('click', () => {
          setSort(th.dataset.sortKey);
          if (typeof rerender === 'function') rerender();
        });
      });
    }

    // ===== Column toggle UI =====
    // יוצר כפתור "👁️ עמודות" שכשנלחץ פותח רשימת תיבות סימון לכל עמודה
    function renderColumnToggleButton(containerEl, rerender) {
      if (!containerEl) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary';
      btn.innerHTML = '👁️ עמודות (' + getVisibleColumns().length + '/' + columns.length + ')';
      btn.style.position = 'relative';

      const panel = document.createElement('div');
      panel.style.cssText =
        'position:absolute; top:calc(100% + 6px); inset-inline-start:0; ' +
        'background:#fff; border:1px solid #cbd5e1; border-radius:8px; ' +
        'padding:10px; box-shadow:0 4px 16px rgba(0,0,0,0.12); ' +
        'min-width:220px; max-height:380px; overflow-y:auto; ' +
        'z-index:100; display:none; direction:rtl;';
      panel.innerHTML =
        '<div style="font-weight:600; margin-bottom:8px; color:#374151;">הצג/הסתר עמודות</div>' +
        columns.map(c =>
          '<label style="display:flex; align-items:center; gap:6px; padding:4px 0; cursor:pointer; font-size:0.9rem;">' +
            '<input type="checkbox" data-col-key="' + c.key + '"' + (isVisible(c.key) ? ' checked' : '') + '>' +
            '<span>' + c.label + '</span>' +
          '</label>'
        ).join('') +
        '<div style="margin-top:8px; display:flex; gap:6px;">' +
          '<button type="button" class="show-all-btn" style="flex:1; background:#30bced; color:#fff; border:0; padding:5px; border-radius:5px; cursor:pointer; font-family:inherit; font-size:0.82rem;">הצג הכל</button>' +
        '</div>';

      const wrapper = document.createElement('div');
      wrapper.style.position = 'relative';
      wrapper.appendChild(btn);
      wrapper.appendChild(panel);
      containerEl.appendChild(wrapper);

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      });
      document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) panel.style.display = 'none';
      });
      panel.addEventListener('change', (e) => {
        const cb = e.target.closest('input[data-col-key]');
        if (!cb) return;
        toggleVisible(cb.dataset.colKey);
        btn.innerHTML = '👁️ עמודות (' + getVisibleColumns().length + '/' + columns.length + ')';
        if (typeof rerender === 'function') rerender();
      });
      panel.querySelector('.show-all-btn').addEventListener('click', () => {
        showAll();
        panel.querySelectorAll('input[data-col-key]').forEach(cb => cb.checked = true);
        btn.innerHTML = '👁️ עמודות (' + getVisibleColumns().length + '/' + columns.length + ')';
        if (typeof rerender === 'function') rerender();
      });
    }

    return {
      sort,
      setSort, clearSort,
      isVisible, toggleVisible, showAll,
      getVisibleColumns,
      getSortIndicator,
      attachSortHandlers,
      renderColumnToggleButton,
      get sortKey() { return sortKey; },
      get sortDir() { return sortDir; },
      get hidden()  { return Array.from(hidden); },
    };
  }

  return { create };
})();
