# 👥 מודול HR — קליטה / רכיבי שכר / היעדרויות

> מסמך מפרט. נכתב בעקבות בקשת המשתמשת ב-Phase HR.

## 🎯 מטרה

מודול לניהול מחזור חיי העובד במערכת השכר:

1. **קליטת עובד חדש** — תהליך מלא: פרטים אישיים, מסמכים, רכיבי שכר ראשוניים, יתרות פתיחה.
2. **עדכון רכיבי שכר** — עבור עובד קיים: שינוי שכר בסיס, פנסיה, קה"ש, תוספת גלובלית, וכו'.
3. **ניהול היעדרויות** — בקשות, אישורים, יתרות חופשה/מחלה/הבראה.

## 🏗️ ארכיטקטורה

המודול בונה על האינדקס המרכזי הקיים (`EmIndexStore`) ומרחיב את הסכמה.

### הרחבת סכמת העובד (additive — תאימות לאחור מלאה)

מעבר לשדות הקיימים (`employee_no`, `national_id`, `full_name`, `department`, `employee_type`, `start_date`, `end_date`, `special_status*`, `global_overtime_hours`, `notes`):

#### רכיבי שכר (כל החלק הזה ב-Phase HR)
| שדה | סוג | ברירת מחדל | תיאור |
|---|---|---|---|
| `base_salary` | number | null | שכר בסיס חודשי ₪ |
| `hourly_rate` | number | null | תעריף שעה (לעובדים שעתיים) |
| `pension_rate_employer` | number | 0.065 | אחוז גמל מעסיק |
| `pension_rate_employee` | number | 0.06 | אחוז גמל עובד |
| `compensation_rate` | number | 0.0833 | אחוז פיצויים |
| `has_advanced_study_in_contract` | boolean | false | קה"ש בחוזה |
| `advanced_study_rate_employer` | number | 0.075 | אחוז קה"ש מעסיק |
| `advanced_study_rate_employee` | number | 0.025 | אחוז קה"ש עובד |
| `has_intensive_work_bonus` | boolean | false | רכיב עבודה מאומצת |
| `intensive_work_hours` | number | null | סף שעות לעבודה מאומצת |
| `has_global_bonus` | boolean | false | תוספת גלובלית קיימת (קשור ל-`global_overtime_hours`) |
| `meal_allowance_per_day` | number | 40 | ארוחה ליום עבודה ₪ |
| `is_office_special_exception` | boolean | false | חריג מיוחד לעובדי משרד (ארוחות לפי דוח חריגים) |

#### יתרות (Phase HR — Absences)
| שדה | סוג | ברירת מחדל | תיאור |
|---|---|---|---|
| `vacation_balance_days` | number | 0 | יתרת חופשה שנתית בימים |
| `vacation_annual_quota` | number | 14 | מכסה שנתית (14-30) |
| `sick_balance_days` | number | 0 | יתרת מחלה צבורה |
| `recovery_balance_amount` | number | 0 | יתרת הבראה ₪ |
| `recovery_used_amount` | number | 0 | ניצול הבראה ₪ |
| `is_eligible_for_recovery` | boolean | true | זכאי להבראה (False רק לשעתיים מתחת לשנה) |

#### מסמכים (Phase HR — Onboarding)
| שדה | סוג | ברירת מחדל | תיאור |
|---|---|---|---|
| `doc_form_101` | enum | 'missing' | טופס 101 (missing/pending/approved) |
| `doc_employment_contract` | enum | 'missing' | חוזה עבודה חתום |
| `doc_kupot_form` | enum | 'missing' | טופס קוביות (לב"ל) |
| `doc_bank_details` | enum | 'missing' | פרטי בנק מלאים |

## 🗺️ Sprint Plan

### HR-1: סכמה מורחבת + עמודות באינדקס (קל)
- הרחבת `em-index-importer.js` עם השדות החדשים (default null/false)
- מיגרציה אוטומטית ב-`em-index-store` (השדות מתווספים בלי לפגוע)
- עמודות עריכה בסיסיות באינדקס (ב-collapsed accordion שלא יהיה רעש)
- פעולות מרובות לכל שדה רלוונטי

### HR-2: תהליך קליטת עובד חדש (בינוני)
- מסך `docs/hr/onboarding.html` — טופס מסודר עם 4 שלבים:
  1. פרטים אישיים (אם לא קיים מ-Em_Index)
  2. מסמכים (4 צ'קליסטים)
  3. רכיבי שכר ראשוניים
  4. יתרות פתיחה
- שמירה לאינדקס המרכזי
- סטטוס "ייעיל" אחרי שכל המסמכים מאושרים

### HR-3: ניהול רכיבי שכר (בינוני)
- מסך `docs/hr/salary-components.html`
- טבלת עובדים עם כל רכיבי השכר (גלוי / נסתר לפי קבוצה)
- פעולות מרובות (העלאה אחידה / סף / וכו')
- היסטוריית שינויים בעמודה "תאריך עדכון אחרון"

### HR-4: ניהול היעדרויות (גדול)
- מסך `docs/hr/absences.html`
- בקשות פתוחות / מאושרות / נדחו
- יתרות פר עובד (חופשה / מחלה / הבראה)
- הצגת היעדרויות מ-Meckano + סטטוס תקין/חוסר אישור

### HR-5: חיבור למודולים הקיימים
- `pension_module.html` יקרא מ-EmIndexStore את רכיבי השכר במקום `employees_data.js`
- `basic-checks.html` יקרא מ-EmIndexStore את הארוחות + סוג עובד

## 📦 קישור למודולים קיימים

לאחר HR-5 הקישוריות תהיה:

```
                   EmIndexStore (אינדקס מרכזי)
                          │
                          ▼
       ┌──────────────────┼─────────────────┐
       │                  │                 │
       ▼                  ▼                 ▼
   pension_module    basic-checks      salary/* (new)
   (רכיבי שכר)        (בדיקות)          (4 דוחות)
       │
       ▼
   reserve/  (מודול מילואים, עתידי)
```

## ⚠️ בעיית איכות נתונים — תיעוד

ראינו במהלך הפיתוח דוגמאות שבהן יילנה תייגה ידנית מספרים בקובץ Meckano
(כמו "הופחתו 2 ימי מחלה לקיזוז + 2 ימי חל\"ת"). מודול HR צריך לייצר
מסלול חוקי לתיעוד התאמות אלו במקום עריכה ידנית של הקובץ.

הצעה: טבלת `manual_adjustments` ב-localStorage:
```js
{
  employee_no: '54',
  period: '2026-04',
  field: 'sick_kizuz',
  delta: 2,
  reason: 'תיוג ידני - מחלה לפני המעבר למערכת',
  created_at: '...',
}
```
המנועים יוסיפו את ה-delta אוטומטית בעת חישוב.
