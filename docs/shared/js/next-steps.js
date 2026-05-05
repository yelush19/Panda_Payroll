// next-steps.js
// קומפוננט משותף שמזריק פאנל "🎯 מה הלאה?" בתחתית כל דף.
// מזהה את הדף הנוכחי לפי ה-URL ומציג 2-4 הצעדים ההגיוניים הבאים.
//
// העריכה במקום אחד — כל הדפים מתעדכנים אוטומטית.

(function() {
  'use strict';
  if (window.SKIP_NEXT_STEPS) return;
  // לא להציג בדף הבית עצמו
  if (location.pathname.endsWith('/index.html') && !location.pathname.includes('/hr/index.html') && !location.pathname.includes('/auth/')) {
    if (location.pathname.replace(/\/$/, '').endsWith('/docs/index.html') || location.pathname === '/' || location.pathname.endsWith('/docs')) {
      return;
    }
  }

  // מילון: לכל URL pattern, רשימת הצעדים הבאים.
  // url יחיד: pathname.endsWith() check — מה אחרי /docs/
  const STEPS = {
    'salary/upload.html': {
      title: 'אחרי קליטת Meckano',
      items: [
        { emoji: '📊', label: 'סיכום ימים', desc: '18 עמודות + סטטוס לכל עובד', href: 'days-summary.html', color: '#0e7490' },
        { emoji: '⚠️', label: 'חוסר סגירה', desc: 'זיהוי עובדים עם פערים', href: 'closure-missing.html', color: '#dc2626' },
        { emoji: '📋', label: 'Worksheet', desc: '25 עמודות מורחב', href: 'worksheet.html', color: '#6366f1' },
        { emoji: '📤', label: 'ייצוא לשיקלולית', desc: 'אחרי שכל הדוחות נראים תקינים', href: 'shiklulit-export.html', color: '#a855f7' },
      ],
    },
    'salary/days-summary.html': {
      title: 'אחרי בדיקת סיכום ימים',
      items: [
        { emoji: '⚠️', label: 'חוסר סגירה', desc: 'דוח של עובדים עם סטטוסים בעייתיים', href: 'closure-missing.html', color: '#dc2626' },
        { emoji: '🌴', label: 'ניצול חופש', desc: 'פירוט חופשים לבדיקה', href: 'used-vacation.html', color: '#f59e0b' },
        { emoji: '👥', label: 'אינדקס עובדים', desc: 'תיקון סוג עובד / מצב מיוחד', href: '../reserve/employees.html', color: '#0e7490' },
        { emoji: '📤', label: 'ייצוא לשיקלולית', desc: 'אם הכל תקין — מוכנות', href: 'shiklulit-export.html', color: '#a855f7' },
      ],
    },
    'salary/closure-missing.html': {
      title: 'אם נמצאו עובדים עם חוסר סגירה',
      items: [
        { emoji: '👥', label: 'אינדקס עובדים', desc: 'בדקי סוג עובד / מצב מיוחד / תאריכים', href: '../reserve/employees.html', color: '#0e7490' },
        { emoji: '👔', label: 'מנכ"לים משותפים', desc: 'הזנה ידנית של ימים שלא מדווחים', href: '../hr/joint-ceos.html', color: '#6366f1' },
        { emoji: '📊', label: 'סיכום ימים', desc: 'חזרה לדוח הראשי', href: 'days-summary.html', color: '#16a34a' },
      ],
    },
    'salary/worksheet.html': {
      title: 'אחרי Worksheet',
      items: [
        { emoji: '📊', label: 'סיכום ימים', desc: 'תצוגה קצרה יותר', href: 'days-summary.html', color: '#0e7490' },
        { emoji: '📤', label: 'ייצוא לשיקלולית', desc: 'הפיקי קובץ קליטה קיבוצית', href: 'shiklulit-export.html', color: '#a855f7' },
      ],
    },
    'salary/used-vacation.html': {
      title: 'אחרי בדיקת ניצול חופש',
      items: [
        { emoji: '🌴', label: 'דשבורד היעדרויות', desc: 'תמונה מלאה — חופש/מחלה/הבראה', href: '../hr/absences.html', color: '#f59e0b' },
        { emoji: '🎖️', label: 'דשבורד מילואים', desc: 'אם יש מילואים בחודש', href: '../reserve/dashboard.html', color: '#16a34a' },
      ],
    },
    'salary/shiklulit-export.html': {
      title: 'אחרי הורדת קובץ הייצוא',
      items: [
        { emoji: '📥', label: '1. קלטי בשיקלולית', desc: 'תפריט "קליטה קיבוצית" + הריצי בקרה', isText: true, color: '#9ca3af' },
        { emoji: '✅', label: '2. הפעילי חישוב משכורות', desc: 'בשיקלולית', isText: true, color: '#9ca3af' },
        { emoji: '💰', label: '3. קליטת תלושים שיקלולית', desc: 'הורידי 4 דוחות → העלי לכאן', href: 'payslip-upload.html', color: '#6b21a8' },
      ],
    },
    'salary/reconciliation.html': {
      title: 'אחרי דוח התאמה',
      items: [
        { emoji: '✅', label: 'אימות חריגים', desc: 'מאמת "בוצע" מול רכיבי תלוש', href: '../exceptions-module.html', color: '#6366f1' },
        { emoji: '🌴', label: 'דשבורד היעדרויות', desc: 'תמונה לפי עובד', href: '../hr/absences.html', color: '#f59e0b' },
        { emoji: '🏦', label: 'בדיקת פנסיות', desc: 'הפרשות פנסיה/פיצויים', href: '../pension_module.html', color: '#16a34a' },
      ],
    },
    'salary/payslip-upload.html': {
      title: 'אחרי קליטת תלושי שיקלולית',
      items: [
        { emoji: '🔄', label: 'התאמה Meckano↔שיקלולית', desc: 'פערים אוטומטיים', href: 'reconciliation.html', color: '#0e7490' },
        { emoji: '✅', label: 'אימות חריגים', desc: 'מאמת "בוצע" מול רכיבי תלוש', href: '../exceptions-module.html', color: '#6366f1' },
        { emoji: '🌴', label: 'דשבורד היעדרויות', desc: 'יתרות חופש/מחלה/הבראה', href: '../hr/absences.html', color: '#f59e0b' },
        { emoji: '🏦', label: 'בדיקת פנסיות', desc: 'הפרשות', href: '../pension_module.html', color: '#16a34a' },
      ],
    },
    'exceptions-module.html': {
      title: 'אחרי דוח חריגים',
      items: [
        { emoji: '🔄', label: 'התאמה Meckano↔שיקלולית', desc: 'בדיקה רחבה יותר של החודש', href: 'salary/reconciliation.html', color: '#0e7490' },
        { emoji: '📊', label: 'סיכום ימים', desc: 'בדיקת ימים ומצב', href: 'salary/days-summary.html', color: '#16a34a' },
        { emoji: '📤', label: 'ייצוא לשיקלולית', desc: 'אחרי שהחריגים מסווגים', href: 'salary/shiklulit-export.html', color: '#a855f7' },
      ],
    },
    'pension_module.html': {
      title: 'אחרי בדיקת פנסיות',
      items: [
        { emoji: '💵', label: 'רכיבי שכר', desc: 'תיקון אחוזי הפרשה אם נדרש', href: 'hr/salary-components.html', color: '#0e7490' },
        { emoji: '🔄', label: 'התאמת תלוש', desc: 'בדיקה רחבה', href: 'salary/reconciliation.html', color: '#6366f1' },
      ],
    },
    'basic-checks.html': {
      title: 'אחרי בדיקות בסיסיות',
      items: [
        { emoji: '🔄', label: 'התאמה Meckano↔שיקלולית', desc: 'בדיקה רחבה יותר', href: 'salary/reconciliation.html', color: '#0e7490' },
        { emoji: '🏦', label: 'בדיקת פנסיות', desc: 'בדיקה ספציפית להפרשות', href: 'pension_module.html', color: '#16a34a' },
      ],
    },
    'reserve/employees.html': {
      title: 'אחרי עדכון אינדקס',
      items: [
        { emoji: '💵', label: 'רכיבי שכר', desc: 'הגדרת שכר/פנסיה/יתרות לעובדים', href: '../hr/salary-components.html', color: '#0e7490' },
        { emoji: '👔', label: 'מנכ"לים משותפים', desc: 'נתוני חודש לעובדים שלא במקאנו', href: '../hr/joint-ceos.html', color: '#6366f1' },
        { emoji: '📤', label: 'קליטת Meckano', desc: 'אם הוספת/עדכנת עובדים', href: '../salary/upload.html', color: '#16a34a' },
      ],
    },
    'reserve/dashboard.html': {
      title: 'ניהול מילואים',
      items: [
        { emoji: '🌴', label: 'דשבורד היעדרויות', desc: 'תמונה כללית', href: '../hr/absences.html', color: '#f59e0b' },
        { emoji: '🔄', label: 'התאמת תלוש', desc: 'אם הוזנו תקבולים', href: '../salary/reconciliation.html', color: '#0e7490' },
      ],
    },
    'hr/salary-components.html': {
      title: 'אחרי עדכון רכיבי שכר',
      items: [
        { emoji: '👥', label: 'אינדקס עובדים', desc: 'תצוגה כללית של כל הנתונים', href: '../reserve/employees.html', color: '#0e7490' },
        { emoji: '🏦', label: 'בדיקת פנסיות', desc: 'אימות הפרשות בתלוש', href: '../pension_module.html', color: '#16a34a' },
      ],
    },
    'hr/absences.html': {
      title: 'דשבורד היעדרויות',
      items: [
        { emoji: '🎖️', label: 'דשבורד מילואים', desc: 'תקופות ותקבולים', href: '../reserve/dashboard.html', color: '#16a34a' },
        { emoji: '👔', label: 'מנכ"לים משותפים', desc: 'הזנה ידנית למי שלא במקאנו', href: 'joint-ceos.html', color: '#6366f1' },
        { emoji: '🌴', label: 'ניצול חופש (Meckano)', desc: 'דוח חופש מנקודת מבט מקאנו', href: '../salary/used-vacation.html', color: '#f59e0b' },
      ],
    },
    'hr/joint-ceos.html': {
      title: 'אחרי הזנת מנכ"לים',
      items: [
        { emoji: '📊', label: 'סיכום ימים', desc: 'הנתונים שלך מצטרפים לדוח', href: '../salary/days-summary.html', color: '#0e7490' },
        { emoji: '👥', label: 'אינדקס עובדים', desc: 'בדיקה שהמנכ"לים מסומנים', href: '../reserve/employees.html', color: '#16a34a' },
      ],
    },
    'hr/index.html': null, // already has its own submodule links
  };

  function getCurrentKey() {
    const path = location.pathname;
    // נחפש את הסיומת — מה שאחרי /docs/
    const m = path.match(/\/docs\/(.+)$/);
    const sub = m ? m[1] : path.replace(/^\//, '');
    return sub;
  }

  function inject() {
    const key = getCurrentKey();
    const config = STEPS[key];
    if (!config || !config.items || !config.items.length) return;

    const wrap = document.createElement('div');
    wrap.id = 'next-steps-panel';
    wrap.style.cssText = [
      'max-width:1400px',
      'margin:30px auto 80px auto',
      'padding:0 20px',
      'direction:rtl',
    ].join(';');

    let html = '<div style="background:linear-gradient(135deg, #f0fdfa 0%, #eef2ff 100%); border:1px solid #a5f3fc; border-radius:14px; padding:18px 22px; box-shadow:0 4px 16px rgba(6,182,212,0.08);">';
    html += '<div style="display:flex; align-items:center; gap:10px; margin-bottom:14px; padding-bottom:10px; border-bottom:1px solid #cffafe;">';
    html += '<span style="font-size:1.5rem;">🎯</span>';
    html += '<div>';
    html += '<div style="font-size:1.1rem; font-weight:700; color:#0e7490;">מה הלאה?</div>';
    html += '<div style="font-size:0.85rem; color:#6b7280;">' + (config.title || '') + '</div>';
    html += '</div>';
    html += '</div>';
    html += '<div style="display:flex; gap:10px; flex-wrap:wrap;">';
    config.items.forEach(item => {
      if (item.isText) {
        html += '<div style="background:#f3f4f6; padding:10px 14px; border-radius:8px; min-width:160px;">';
        html += '<div style="display:flex; align-items:center; gap:8px;"><span style="font-size:1.2rem;">' + item.emoji + '</span><b style="color:#374151; font-size:0.92rem;">' + item.label + '</b></div>';
        if (item.desc) html += '<div style="font-size:0.8rem; color:#6b7280; margin-top:3px; padding-right:24px;">' + item.desc + '</div>';
        html += '</div>';
      } else {
        const c = item.color || '#0e7490';
        html += '<a href="' + item.href + '" style="background:' + c + '; color:#fff; padding:10px 16px; border-radius:8px; text-decoration:none; font-weight:600; min-width:160px; display:block; transition:transform 0.12s;" onmouseover="this.style.transform=\'translateY(-2px)\'" onmouseout="this.style.transform=\'translateY(0)\'">';
        html += '<div style="display:flex; align-items:center; gap:8px; font-size:0.95rem;"><span style="font-size:1.2rem;">' + item.emoji + '</span>' + item.label + '</div>';
        if (item.desc) html += '<div style="font-size:0.78rem; opacity:0.85; margin-top:3px; padding-right:24px; font-weight:400;">' + item.desc + '</div>';
        html += '</a>';
      }
    });
    html += '</div></div>';
    wrap.innerHTML = html;

    // הוספה לסוף ה-body, לפני כפתור הבית הצף (אם קיים)
    const homeBtn = document.getElementById('home-floating-btn');
    if (homeBtn && homeBtn.parentNode === document.body) {
      document.body.insertBefore(wrap, homeBtn);
    } else {
      document.body.appendChild(wrap);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    setTimeout(inject, 50);
  }
})();
