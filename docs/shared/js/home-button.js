// home-button.js
// כפתור צף "🏠 דף הבית" שתמיד גלוי בפינה שמאלית-עליונה.
// טוען את עצמו אוטומטית בכל דף שכולל אותו (חוץ מדף הבית עצמו).
//
// שימוש: פשוט הכלל את הסקריפט בדף. לא דורש HTML נוסף.
// אם אתה רוצה שלא יוצג בדף מסוים, קבע window.SKIP_HOME_BUTTON = true; לפני הסקריפט.

(function() {
  'use strict';
  if (window.SKIP_HOME_BUTTON) return;
  // לא להציג בדף הבית עצמו
  if (location.pathname.endsWith('/index.html') || location.pathname.match(/\/$/) || location.pathname === '/' || location.pathname.endsWith('/docs')) {
    return;
  }

  function getHomeHref() {
    // מחשב כמה רמות עומק יש מהמיקום הנוכחי לדף הראשי (docs/index.html)
    const path = location.pathname;
    // הסר הסיומת של הקובץ
    const dirOnly = path.replace(/\/[^/]+$/, '/');
    // מצא את החלק שאחרי /docs/ (אם קיים) או /
    const m = dirOnly.match(/\/docs\/(.*)$/);
    const subPath = m ? m[1] : dirOnly.replace(/^\//, '');
    const depth = subPath.split('/').filter(Boolean).length;
    if (depth === 0) return 'index.html';
    return '../'.repeat(depth) + 'index.html';
  }

  function inject() {
    const btn = document.createElement('a');
    btn.href = getHomeHref();
    btn.id = 'home-floating-btn';
    btn.title = 'חזרה לדף הבית';
    btn.innerHTML = '<span style="font-size:1.3rem;">🏠</span><span>דף הבית</span>';
    btn.style.cssText = [
      'position:fixed',
      'top:14px',
      'left:14px',
      'z-index:9999',
      'background:#fff',
      'color:#0e7490',
      'padding:9px 14px',
      'border-radius:24px',
      'box-shadow:0 4px 14px rgba(0,0,0,0.15)',
      'text-decoration:none',
      'font-weight:600',
      'font-size:0.92rem',
      'display:flex',
      'align-items:center',
      'gap:8px',
      'border:1.5px solid #06b6d4',
      'transition:all 0.15s',
      'font-family:inherit',
    ].join(';');
    btn.addEventListener('mouseenter', () => {
      btn.style.background = '#06b6d4';
      btn.style.color = '#fff';
      btn.style.transform = 'translateY(-2px)';
      btn.style.boxShadow = '0 6px 18px rgba(6,182,212,0.4)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = '#fff';
      btn.style.color = '#0e7490';
      btn.style.transform = 'translateY(0)';
      btn.style.boxShadow = '0 4px 14px rgba(0,0,0,0.15)';
    });
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
