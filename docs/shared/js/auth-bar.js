// auth-bar.js
// יוצר פס-עליון קטן עם פרטי המשתמש המחובר + כפתור התנתקות.
// בנוסף: מבטיח שהמשתמש מחובר. אם לא - מפנה לדף הלוגין.
//
// שימוש:
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//   <script src="shared/js/supabase-config.js"></script>
//   <script src="shared/js/supabase-client.js"></script>
//   <script src="shared/js/auth-bar.js"></script>
//
// כל מה שצריך בדף - רק ה-includes. הפס מתווסף אוטומטית.

(async function() {
  'use strict';
  if (typeof SB === 'undefined') {
    console.warn('SB client not loaded - skipping auth bar');
    return;
  }

  // קביעת הנתיב היחסי ל-auth/login לפי המיקום הנוכחי
  function loginUrl() {
    const path = window.location.pathname;
    if (path.includes('/salary/'))   return '../auth/login.html';
    if (path.includes('/reserve/'))  return '../auth/login.html';
    if (path.includes('/hr/'))       return '../auth/login.html';
    if (path.includes('/auth/'))     return null; // כבר בדף לוגין
    return 'auth/login.html';
  }

  if (loginUrl() === null) return; // בדף הלוגין - לא להוסיף את הפס

  const session = await SB.getSession();
  if (!session) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = loginUrl() + '?next=' + next;
    return;
  }

  // יצירת הפס
  const bar = document.createElement('div');
  bar.id = 'authBar';
  bar.style.cssText =
    'position:fixed; top:8px; left:8px; z-index:9999;' +
    'background:rgba(255,255,255,0.95); backdrop-filter:blur(6px);' +
    'border:1px solid #e5e7eb; border-radius:10px;' +
    'padding:6px 12px; font-family:Heebo,Arial,sans-serif; font-size:0.82rem;' +
    'color:#374151; box-shadow:0 2px 8px rgba(0,0,0,0.08);' +
    'display:flex; align-items:center; gap:10px; direction:rtl;';

  const email = session.user.email || '';
  const name  = (session.user.user_metadata && session.user.user_metadata.full_name) || email.split('@')[0];

  bar.innerHTML =
    '<span style="color:#10b981;">●</span>' +
    '<span><strong>' + escapeHtml(name) + '</strong></span>' +
    '<button id="authBarLogout" style="background:transparent; border:1px solid #cbd5e1; color:#374151; padding:3px 10px; border-radius:5px; cursor:pointer; font-family:inherit; font-size:0.78rem;">התנתקות</button>';

  document.body.appendChild(bar);

  document.getElementById('authBarLogout').addEventListener('click', async () => {
    if (!confirm('להתנתק מהמערכת?')) return;
    await SB.signOut();
    window.location.href = loginUrl();
  });

  function escapeHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
})();
