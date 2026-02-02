# מיפוי כותרות דוח השכר - מקאנו לתלושים

**מקור:** MECANO05.2025EMPOYEERSDetailed report.xlsx  
**יעד:** PayrolMonthlyDetailed report.xlsx  
**תקופה:** מאי 2025 (29 כותרות)

---

## ✅ כותרות שהושלמו

### 1. מחלקה
**מקור:** עמודה 8 בשורת כותרת העובד  
**ערכים אפשריים:** מל"מ, משרד, קבלני משנה, רוה"מ, רפאל  
**לוגיקה:** העתקה ישירה מהמקאנו  

```javascript
// שורת שם העובד → עמודה 8
department = employeeHeaderRow[7]; // (אינדקס 7 = עמודה H)
```

---

### 2. תג בשכר ⚠️ טעות מיפוי  
**❌ טעות:** עמודה F בשורת תקופת הדוח  
**✅ נכון:** קוד פנימי של מקאנו - לא תג בשכר!  
**🔗 פתרון:** תג בשכר נמצא במיפוי מול תלוש שכר בלבד  

```javascript
// זה לא תג בשכר - זה קוד פנימי מקאנו!
// שורת תקופת דוח → עמודה F
mecanoInternalCode = dateRangeRow[5]; // (אינדקס 5 = עמודה F)
```

**🔗 הערה למיפוי מול תלוש:**  
**תג בשכר האמיתי יתקבל במיפוי נפרד מול תלוש השכר**

---

### 23. קוד עובד ✅
**מקור:** עמודה F בשורת תקופת הדוח  
**הגדרה:** קוד פנימי של מקאנו לזיהוי העובד  
**פורמט:** מספר מאוחסן כטקסט  
**דוגמאות:** "113", "8", "93"  

```javascript
// שורת תקופת דוח → עמודה F
mecanoEmployeeCode = dateRangeRow[5]; // (אינדקס 5 = עמודה F)
```

**🔗 הערה למיפוי מול תלוש:**  
**זה קוד פנימי מקאנו - לא תג בשכר! תג בשכר במיפוי נפרד**

### 3. שם עובד
**מקור:** שורה שמעל שורת תקופת הדוח (עמודה A)  
**פורמט:** שם מלא בעברית  
**דוגמאות:** "אורי אשתר", "אפרים רחמנוב"  

```javascript
// שורת תקופת דוח - 1 → עמודה A  
employeeName = employeeNameRow[0];
```

---

### 4. ימי תקן ⭐ חישוב מורכב
**הגדרה:** כל הימים שהעובד מקבל עליהם תשלום  

**🔗 הערה למיפוי מול תלוש:**  
**ימי תקן = ימי נוכחות + חג + חופש + חופשה מרוכזת + מילואים + מחלה לתשלום**  
**בתלוש: יש לוודא שהחישוב תואם לימי תקן שחושבו כאן + לבדוק התאמה עם ניכויי היעדרויות**

**נוסחה:**
```
ימי תקן = ימי נוכחות (א'-ה') + 1 (חג) + ימי ו'/ש' עם שעות + היעדרויות משולמות
```

**מקורות נתונים:**
- **ימי נוכחות:** בלוק "סיכום" → "ימי נוכחות" → עמודה 3
- **יום חג:** +1 קבוע (01.05.2025 לכל העובדים)
- **ימי סופ"ש:** זיהוי מהנתונים היומיים (ו'/ש' עם "שעות משולמות")
- **היעדרויות משולמות:** בלוק "הצגת אירועים" (חופש, חופשה מרוכזת, מילואים, מחלה לתשלום)

**דוגמאות:**
- אורי אשתר: 16 + 1 + 0 + 3 = **20 ימי תקן**
- דניאל אולשנסקי: 19 + 1 + 3 + 0 = **23 ימי תקן**

```javascript
function calculateWorkDays(employeeData) {
    let workDays = employeeData.attendanceDays; // מבלוק סיכום
    workDays += 1; // חג קבוע
    
    // ימי סופ"ש עם עבודה
    employeeData.dailyData.forEach(day => {
        if ((day.date.startsWith('ו -') || day.date.startsWith('ש -')) 
            && day.paidHours > 0) {
            workDays += 1;
        }
    });
    
    // היעדרויות משולמות מבלוק אירועים
    workDays += employeeData.events.vacation || 0;
    workDays += employeeData.events.concentratedVacation || 0;
    workDays += employeeData.events.reserves || 0;
    workDays += employeeData.events.paidSickLeave || 0;
    
    return workDays;
}
```

---

### 5. ימי נוכחות ✅
**מקור:** בלוק "סיכום" → שורת "ימי נוכחות" → עמודה 3  
**הגדרה:** ימים בהם יש גם כניסה וגם יציאה  
**בדיקת תקינות:** זיהוי ימים חסרי כניסה/יציאה לדוח שגיאות  

```javascript
// מבלוק סיכום
attendanceDays = summaryBlock.attendanceDays; // עמודה 3

// בדיקת תקינות - דוח שגיאות
function validateAttendance(employeeData) {
    let errors = [];
    employeeData.dailyData.forEach(day => {
        if (day.dayType === 'יום חול') {
            if (!day.entry && day.exit) {
                errors.push({
                    employee: employeeData.name,
                    date: day.date,
                    existing: `יציאה: ${day.exit}`,
                    missing: 'כניסה חסרה'
                });
            }
            if (day.entry && !day.exit) {
                errors.push({
                    employee: employeeData.name,
                    date: day.date,
                    existing: `כניסה: ${day.entry}`,
                    missing: 'יציאה חסרה'
                });
            }
        }
    });
    return errors;
}
```

**דוח שגיאות נדרש:**
| שם עובד | תאריך | מידע קיים | מידע חסר |
|----------|--------|-------------|-----------|
| דניאל אולשנסקי | א - 18 | - | כניסה + יציאה |
| אורי אשתר | ג - 06 | - | כניסה + יציאה |

---

### 6. ימי ו'+ש' ✅
**מקור:** ספירה מהנתונים היומיים  
**הגדרה:** ימי סופ"ש שעבדו בהם (יש שעות משולמות)  
**צורך:** לחישוב ארוחות נכון  

```javascript
// ספירת ימי סופ"ש עם עבודה
function countWeekendWorkDays(employeeData) {
    let weekendCount = 0;
    employeeData.dailyData.forEach(day => {
        if ((day.date.startsWith('ו -') || day.date.startsWith('ש -')) 
            && day.paidHours > 0) {
            weekendCount += 1;
        }
    });
    return weekendCount;
}
```

**דוגמאות:**
- דניאל אולשנסקי: **3 ימי ו'+ש'** (09, 16, 30 במאי - רק שישי)
- אורי אשתר: **0 ימי ו'+ש'** (לא עבד בסופ"ש)
- אפרים רחמנוב: **0 ימי ו'+ש'** (לא עבד בסופ"ש)

**הערה:** במאי 2025 - אין עובדים שעבדו בשבת

---

### 7. חג ✅
**מקור:** חישוב אוטומטי לפי חוק העבודה + כללי פנדה טק  
**הגדרה:** ימי חג בתשלום + כללים מיוחדים לערבי חג  

```javascript
// ימי חג בתשלום בפנדה טק (רשימה מלאה מתוקנת)
const pandaTechHolidays2025 = [
    { date: '2025-04-14', name: 'פסח' },
    { date: '2025-05-03', name: 'יום העצמאות' },
    { date: '2025-06-12', name: 'שבועות' },
    { date: '2025-09-17', name: 'ראש השנה' },
    { date: '2025-09-18', name: 'ב׳ דראש השנה' },
    { date: '2025-09-26', name: 'יום כיפור' },
    { date: '2025-10-01', name: 'סוכות' },
    { date: '2025-10-02', name: 'ב׳ דסוכות' },
    { date: '2025-10-08', name: 'שמחת תורה' }
];

// ערבי חג עם כללים מיוחדים
const eveOfHolidays = [
    { date: '2025-04-13', name: 'ערב פסח', rule: 'standard' },
    { date: '2025-05-02', name: 'ערב יום העצמאות', rule: 'special_report' },
    { date: '2025-06-11', name: 'ערב שבועות', rule: 'standard' },
    { date: '2025-09-16', name: 'ערב ראש השנה', rule: 'standard' },
    { date: '2025-09-25', name: 'ערב יום כיפור', rule: 'standard' },
    { date: '2025-09-30', name: 'ערב סוכות', rule: 'standard' }
];

function handleEveOfHoliday(date, workedHours, holidayName) {
    if (holidayName === 'ערב יום העצמאות') {
        // כלל מיוחד: דוח חריג למי שלא עבד
        if (workedHours === 0) {
            return {
                type: 'special_report',
                note: 'דוח חריג - לא עבד בערב יום העצמאות'
            };
        }
    }
    
    // כלל רגיל לכל יתר ערבי החג (כולל ערב ראש השנה וערב סוכות)
    if (workedHours >= 4.2) {
        return {
            type: 'full_day_pay',
            note: 'עבד 4.2+ שעות בערב חג'
        };
    } else if (workedHours === 0) {
        return {
            type: 'vacation_deduction',
            amount: 0.5,
            note: 'לא עבד בערב חג - ניכוי 0.5 יום חופש'
        };
    }
    
    return { type: 'partial_pay', hours: workedHours };
}
```

**רשימה מתוקנת - 9 ימי חג:**
1. פסח, 2. יום העצמאות, 3. שבועות
4. ראש השנה, 5. ב׳ דראש השנה, 6. יום כיפור  
7. סוכות, 8. ב׳ דסוכות, 9. שמחת תורה

**ערבי חג נוספים:** ערב ראש השנה, ערב סוכות

---

### 8. חופש ✅
**מקור:** בלוק "הצגת אירועים" → "חופש" + זיהוי מהנתונים היומיים  
**הגדרה:** ימי חופש שהועדכנו כאירוע + ימים ריקים עם הערה "חופש"  
**חריג:** ימים ריקים ללא הערה → דוח שגיאות

```javascript
function calculateVacationDays(employeeData) {
    let vacationDays = 0;
    let invalidDays = [];
    
    // 1. מבלוק "הצגת אירועים"
    vacationDays += employeeData.events.vacation || 0;
    
    // 2. זיהוי מהנתונים היומיים
    employeeData.dailyData.forEach(day => {
        if (day.dayType === 'יום חול' && !day.entry && !day.exit) {
            // יום חול ריק - בדיקה מה זה
            if (day.note && day.note.includes('חופש')) {
                // יש הערה חופש = חופש תקין
                vacationDays += 1;
            } else if (!day.event || day.event === '') {
                // אין הערה ואין אירוע = יום לא תקין!
                invalidDays.push({
                    employee: employeeData.name,
                    date: day.date,
                    issue: 'יום ריק ללא הערה או אירוע',
                    existing: 'אין נתונים',
                    missing: 'כניסה + יציאה או הסבר'
                });
            }
        }
    });
    
    return { 
        vacationDays: vacationDays,
        invalidDays: invalidDays 
    };
}
```

**דוח שגיאות מורחב:**
| שם עובד | תאריך | בעיה | מידע קיים | מידע חסר |
|----------|--------|-------|-------------|-----------|
| דניאל אולשנסקי | א - 18 | יום ריק | אין | כניסה + יציאה או הסבר |
| אורי אשתר | ג - 06 | יום ריק | אין | כניסה + יציאה או הסבר |
| חיים ראש | ב - 12 | כניסה חסרה | יציאה: 17:30 | כניסה |

---

### 9. חופשה מרוכזת ✅
**מקור:** בלוק "הצגת אירועים" → "חופשה מרוכזת"  
**הגדרה:** 4 ימי סגירת מפעל מל"מ בשנה - בתשלום פנדה טק  
**חריג:** רק לעובדי מחלקת מל"מ (לא לעובדי משרד/רפאל/רוה"מ)  

```javascript
function calculateConcentratedVacation(employeeData) {
    let concentratedVacationDays = 0;
    
    // בדיקה שהעובד ממחלקת מל"מ
    if (employeeData.department !== 'מל"מ') {
        return {
            days: 0,
            note: 'לא זכאי - לא עובד מל"מ'
        };
    }
    
    // עובד מל"מ - ספירה מבלוק "הצגת אירועים"
    concentratedVacationDays = employeeData.events.concentratedVacation || 0;
    
    // בדיקת תקינות - לא יותר מ-4 ימים בשנה
    if (concentratedVacationDays > 4) {
        return {
            days: concentratedVacationDays,
            warning: 'חריגה - יותר מ-4 ימים בשנה'
        };
    }
    
    return {
        days: concentratedVacationDays,
        note: 'סגירת מפעל מל"מ - בתשלום פנדה טק'
    };
}
```

**כללי חופשה מרוכזת:**
- **זכאים:** רק עובדי מל"מ
- **כמות:** עד 4 ימים בשנה
- **תשלום:** על חשבון פנדה טק (לא ניכוי מחופש העובד)
- **סיבה:** סגירת מפעל מל"מ

**דוגמאות:**
- **אורי אשתר (מל"מ):** 3 ימי חופשה מרוכזת ✅
- **ולדה טריאקו (משרד):** 0 ימי חופשה מרוכזת (לא זכאית)

---

### 10. מחלה ✅
**מקור:** בלוק "הצגת אירועים" → "מחלה"  
**הגדרה:** סה"כ ימי מחלה שהעובד ניצל (כולל בתשלום + ללא תשלום)  

**🔗 הערה למיפוי מול תלוש:**  
**לבדוק שבתלוש יש התאמה: מחלה בתשלום (בשכר) + מחלה ללא תשלום (ניכוי)**

```javascript
function calculateSickDays(employeeData) {
    // סה"כ ימי מחלה שניצל (בתשלום + ללא תשלום)
    let totalSickDays = employeeData.events.sickLeave || 0;
    
    return {
        totalSickDays: totalSickDays,
        note: 'כולל ימי מחלה בתשלום + ללא תשלום'
    };
}
```

---

### 11. מחלה לתשלום ✅  
**מקור:** בלוק "הצגת אירועים" → "מחלה לתשלום"  
**הגדרה:** ימי מחלה שהעובד זכאי לקבל עליהם תשלום (לפי חוק)  

**🔗 הערה למיפוי מול תלוש:**  
**חייב להיכלל בימי תקן ובחישוב השכר. לא ניכוי!**

```javascript
function calculatePaidSickDays(employeeData) {
    // רק ימי מחלה בתשלום
    let paidSickDays = employeeData.events.paidSickLeave || 0;
    
    return {
        paidSickDays: paidSickDays,
        note: 'ימי מחלה בתשלום לפי חוק (נכללים בימי תקן)'
    };
}
```

**ההבדל:**
- **מחלה (10):** 5 ימים = סה"כ ימי מחלה שהעובד ניצל
- **מחלה לתשלום (11):** 3 ימים = כמה מתוכם בתשלום
- **מחלה ללא תשלום:** 2 ימים = 5-3 (לא נכלל בימי תקן)

---

### 12. מילואים ✅ ⚠️ עם סייג חשוב
**מקור:** בלוק "הצגת אירועים" → "מילואים"  
**הגדרה:** ימי מילואים בתשלום מקרן התגמולים (לא מהמעסיק)  
**תנאי:** רק אם העובד הזין אירוע מילואים במקאנו  

**⚠️ סייג חשוב - תשלום כפול:**
**אם יש גם מילואים וגם שעות עבודה באותו יום = תשלום כפול**

**עמודה נוספת נדרשת:** "ש.ע בימי מילואים"

```javascript
function calculateReservesWithDoublePayment(employeeData) {
    let reservesDays = employeeData.events.reserves || 0;
    let doublePaymentHours = 0;
    let corrections = [];
    
    // זיהוי ימים עם מילואים + עבודה
    employeeData.dailyData.forEach(day => {
        if (day.reservesEvent && day.paidHours > 0) {
            // תשלום כפול - רק 100% ללא הפסקה מעל 6 שעות
            let effectiveHours = day.paidHours;
            if (day.paidHours > 6) {
                effectiveHours = day.paidHours - 0.5; // ללא הפסקה
            }
            doublePaymentHours += effectiveHours;
            
            // קיזוז מ"שעות חוסר" אם יש חוסר תקן
            if (day.standardDeficit > 0) {
                corrections.push({
                    employee: employeeData.name,
                    date: day.date,
                    type: 'reserves_offset',
                    standardDeficit: day.standardDeficit,
                    offsetFromHoursDeficit: day.standardDeficit,
                    reason: 'קיזוז חוסר תקן בגין מילואים עם עבודה'
                });
            }
        }
    });
    
    return {
        reservesDays: reservesDays,
        doublePaymentHours: doublePaymentHours,
        corrections: corrections,
        note: 'מילואים בתשלום מקרן התגמולים + תשלום כפול לשעות עבודה',
        paymentSource: 'לא מהמעסיק - מקרן התגמולים'
    };
}
```

**🔗 הערה למיפוי מול תלוש:**  
**מילואים נכללים בימי תקן + עמודה נוספת "ש.ע בימי מילואים"**  
**התשלום לא מהמעסיק - מקרן התגמולים**

**דוגמאות:**
- **יורם שלמה:** מילואים חלקי + עבודה = תשלום כפול
- **רוב העובדים:** 0 ימי מילואים

---

## 🔄 כותרות הבאות לעיבוד

### 13. ימים משולמים ✅
**מקור:** חישוב זהה לכותרת #4 (ימי תקן)  
**הגדרה:** סה"כ ימים שהעובד מקבל עליהם תשלום (שם נוסף לימי תקן)  

```javascript
function calculatePaidDays(employeeData) {
    // זהה לחישוב ימי תקן
    return calculateWorkDays(employeeData);
}
```

**🔗 הערה למיפוי מול תלוש:**  
**זהה לימי תקן - רק שם שונה**

---

### 14. חישוב כמות לשווי ארוחות ✅
**מקור:** חישוב מהנתונים היומיים  
**הגדרה:** רק ימי עבודה בפועל בימים א'-ה' (לא כולל חגים/חופש/מחלה)  
**צורך:** לחישוב שווי ארוחות מדויק  

```javascript
function calculateMealEligibleDays(employeeData) {
    let mealDays = 0;
    
    employeeData.dailyData.forEach(day => {
        // רק ימים א'-ה' עם נוכחות בפועל
        if (day.dayType === 'יום חול' && 
            day.entry && day.exit &&
            !day.date.startsWith('ו -') && 
            !day.date.startsWith('ש -')) {
            mealDays += 1;
        }
    });
    
    return {
        mealEligibleDays: mealDays,
        note: 'רק ימי עבודה בפועל א-ה (לא חגים/חופש/מחלה)'
    };
}
```

**🔗 הערה למיפוי מול תלוש:**  
**זה הבסיס לחישוב שווי ארוחות - רק ימים שהעובד באמת נכח**

**דוגמאות:**
- **אורי אשתר:** 16 ימי נוכחות א'-ה' = 16 ארוחות
- **דניאל אולשנסקי:** 19 ימי נוכחות א'-ה' = 19 ארוחות

**לא כולל:** חגים, חופש, מחלה, ימי ו'+ש'

### 15. חריג-לשווי ארוחות ✅
**מקור:** דוח חריגים + זיהוי אוטומטי מהנתונים  
**הגדרה:** חריגים מיוחדים בחישוב ארוחות (לא לפי חישוב רגיל)  

**סוגי חריגים:**
1. **ללא ארוחות + אשל:** יורם שלמה
2. **לא מילא דו"ח שעות:** לוי דביש וכדו' (מדוח חריגים)
3. **קבלני משנה:** ללא תלושים - להציג בסוף הדוח
4. **עובדים שסיימו:** לא רלוונטיים למחזור נוכחי
5. **מידע תן ביס:** חריג מיוחד - יש הערה בתלוש

```javascript
function identifyMealExceptions(employeeData, exceptionsReport) {
    let exceptions = [];
    
    // יורם שלמה - חריג קבוע
    if (employeeData.name === 'יורם שלמה') {
        exceptions.push({
            type: 'no_meals_plus_ashel',
            note: 'ללא חיוב ארוחות + רכיב אשל'
        });
    }
    
    // מדוח חריגים - לא מילא דו"ח
    if (exceptionsReport.includes('לא מילא דו"ח')) {
        exceptions.push({
            type: 'no_timesheet',
            note: 'לא מילא דו"ח שעות'
        });
    }
    
    // קבלני משנה
    if (employeeData.department === 'קבלני משנה') {
        exceptions.push({
            type: 'contractor',
            note: 'ללא תלושים - להציג בסוף הדוח'
        });
    }
    
    // מידע תן ביס
    if (exceptionsReport.includes('תן ביס')) {
        exceptions.push({
            type: 'tan_bis_info',
            note: 'חריג מיוחד - ראה הערה בתלוש'
        });
    }
    
    return exceptions;
}
```

**🔗 הערה למיפוי מול תלוש:**  
**חריגים אלה דורשים טיפול ידני ולא חישוב אוטומטי**

### 16. שעות משולמות ✅
**מקור:** בלוק "סיכום" → שורת "שעות משולמות" → עמודה 3  
**הגדרה:** סה"כ שעות שהעובד מקבל עליהן תשלום  
**כולל:** שעות רגילות + שעות נוספות + שעות חג/חופש/מחלה לתשלום  

```javascript
function getPaidHours(employeeData) {
    // מבלוק סיכום
    let paidHours = employeeData.summary.paidHours; // עמודה 3
    
    return {
        paidHours: paidHours,
        note: 'כולל שעות רגילות + נוספות + היעדרויות משולמות'
    };
}
```

**🔗 הערה למיפוי מול תלוש:**  
**זה הבסיס לחישוב השכר - כל השעות שמשולמות**

**דוגמאות:**
- **עובד מלא:** ~182 שעות (21 ימים × 8.67 שעות)
- **עובד חלקי:** לפי הדיווח בפועל

### 17. 100% ✅
**מקור:** בלוק "שעות לחישוב" → שורת "100%" → עמודה 3  
**הגדרה:** שעות רגילות בתשלום 100% (לא נוספות)  
**כולל:** שעות רגילות + שעות חג/חופש/מחלה בתשלום רגיל  

```javascript
function getRegularHours(employeeData) {
    // מבלוק "שעות לחישוב"
    let regularHours = employeeData.hoursCalculation.regular100; // עמודה 3
    
    return {
        regularHours: regularHours,
        note: 'שעות רגילות 100% - לא נוספות'
    };
}
```

**🔗 הערה למיפוי מול תלוש:**  
**בסיס חישוב השכר הרגיל ללא תוספות**

---

### 18. 125% ✅ ⚠️ טעון תיקון
**מקור:** בלוק "שעות לחישוב" → שורת "125%" → עמודה 3  
**⚠️ בעיה:** מקאנו טועה בחישוב 125% ו-150%  
**חישוב נכון:** יומי ושבועי מדויק + חישוב מורכב לסופ"ש  

**כללים נכונים:**
- **יומי:** שעות 8.4-10.4 ביום (2 שעות ראשונות)
- **שבועי:** מעל 42 שעות בשבוע
- **ימי סופ"ש:** חישוב מורכב לפי יתרת שעות שבועיות

```javascript
function calculateCorrect125Hours(employeeData) {
    let correct125Hours = 0;
    let corrections = [];
    let weeklyHours = 0;
    
    // 1. חישוב יומי א'-ה'
    employeeData.dailyData.forEach(day => {
        if (day.dayType === 'יום חול' && !day.date.startsWith('ו -') && !day.date.startsWith('ש -')) {
            weeklyHours += day.totalHours;
            
            // יומי: 8.4-10.4 שעות
            if (day.totalHours > 8.4 && day.totalHours <= 10.4) {
                let daily125 = Math.min(day.totalHours - 8.4, 2);
                correct125Hours += daily125;
            }
        }
    });
    
    // 2. חישוב ימי סופ"ש - לפי יתרת שעות שבועיות
    employeeData.dailyData.forEach(day => {
        if (day.date.startsWith('ו -') || day.date.startsWith('ש -')) {
            let remainingFor125 = Math.max(0, 42 - weeklyHours);
            
            if (remainingFor125 > 0) {
                // יש מקום ל-125%
                let hours125 = Math.min(day.paidHours, remainingFor125);
                correct125Hours += hours125;
                weeklyHours += hours125;
            }
            // יתרת השעות תהיה 150% (בפונקציה הבאה)
        }
    });
    
    // השוואה למקאנו
    let mecanoValue = employeeData.hoursCalculation.overtime125;
    if (Math.abs(mecanoValue - correct125Hours) > 0.1) {
        corrections.push({
            employee: employeeData.name,
            mecanoValue: mecanoValue,
            correctValue: correct125Hours,
            difference: correct125Hours - mecanoValue,
            reason: 'תיקון חישוב 125% יומי/שבועי + סופ"ש'
        });
    }
    
    return {
        overtime125: correct125Hours,
        corrections: corrections,
        note: 'מתוקן - חישוב יומי ושבועי + חלוקה נכונה לסופ"ש'
    };
}
```

---

### 19. 150% ✅ ⚠️ טעון תיקון
**מקור:** בלוק "שעות לחישוב" → שורת "150%" → עמודה 3  
**⚠️ בעיה:** מקאנו טועה בחישוב 150%  

**כללים נכונים:**
- **יומי:** מעל 10.4 שעות ביום
- **ימי סופ"ש:** יתרת השעות לאחר חלוקת 125%
- **ימי חג:** כל שעות חג הן 150%

```javascript
function calculateCorrect150Hours(employeeData) {
    let correct150Hours = 0;
    let corrections = [];
    let weeklyHours = 0;
    
    // ספירת שעות שבועיות א'-ה'
    employeeData.dailyData.forEach(day => {
        if (day.dayType === 'יום חול' && !day.date.startsWith('ו -') && !day.date.startsWith('ש -')) {
            weeklyHours += day.totalHours;
            
            // יומי: מעל 10.4 שעות
            if (day.totalHours > 10.4) {
                correct150Hours += (day.totalHours - 10.4);
            }
        }
    });
    
    // חישוב ימי סופ"ש
    employeeData.dailyData.forEach(day => {
        if (day.date.startsWith('ו -') || day.date.startsWith('ש -')) {
            let remainingFor125 = Math.max(0, 42 - weeklyHours);
            
            if (day.paidHours > remainingFor125) {
                // חלק מהשעות 150%
                let hours150 = day.paidHours - remainingFor125;
                correct150Hours += hours150;
            }
            // עדכון weeklyHours לימי סופ"ש הבאים
            weeklyHours += day.paidHours;
        }
    });
    
    // ימי חג - כל השעות 150%
    employeeData.dailyData.forEach(day => {
        if (day.isHoliday && day.paidHours > 0) {
            correct150Hours += day.paidHours;
        }
    });
    
    // השוואה למקאנו
    let mecanoValue = employeeData.hoursCalculation.overtime150;
    if (Math.abs(mecanoValue - correct150Hours) > 0.1) {
        corrections.push({
            employee: employeeData.name,
            mecanoValue: mecanoValue,
            correctValue: correct150Hours,
            difference: correct150Hours - mecanoValue,
            reason: 'תיקון חישוב 150% + חלוקה נכונה לסופ"ש'
        });
    }
    
    return {
        overtime150: correct150Hours,
        corrections: corrections,
        note: 'מתוקן - כולל חלוקה נכונה של ימי סופ"ש'
    };
}
```

**🔗 דוח תיקונים כללי נדרש:**
```javascript
function generateComprehensiveCorrectionsReport(allEmployees) {
    let report = {
        overtimeCorrections: [],
        reservesCorrections: [],
        deficitOffsets: [],
        validation: { passed: 0, failed: 0 }
    };
    
    allEmployees.forEach(emp => {
        // 1. תיקוני 125% ו-150%
        let overtime125 = calculateCorrect125Hours(emp);
        let overtime150 = calculateCorrect150Hours(emp);
        report.overtimeCorrections.push(...overtime125.corrections);
        report.overtimeCorrections.push(...overtime150.corrections);
        
        // 2. תיקוני מילואים עם תשלום כפול
        let reserves = calculateReservesWithDoublePayment(emp);
        report.reservesCorrections.push(...reserves.corrections);
        
        // 3. קיזוזי חוסר תקן (חופש/מחלה/חופשה מרוכזת)
        emp.dailyData.forEach(day => {
            if ((day.vacationEvent || day.sickLeaveEvent || day.concentratedVacationEvent) 
                && day.standardDeficit > 0) {
                report.deficitOffsets.push({
                    employee: emp.name,
                    date: day.date,
                    eventType: day.vacationEvent ? 'חופש' : 
                              day.sickLeaveEvent ? 'מחלה' : 'חופשה מרוכזת',
                    standardDeficit: day.standardDeficit,
                    offsetFromHoursDeficit: day.standardDeficit,
                    reason: 'קיזוז חוסר תקן בגין היעדרות'
                });
            }
        });
        
        // 4. בדיקת תקינות: שעות משולמות = 100% + 125% + 150%
        let calculatedTotal = emp.hours100 + emp.hours125 + emp.hours150;
        let reportedTotal = emp.paidHours;
        
        if (Math.abs(calculatedTotal - reportedTotal) > 0.1) {
            report.validation.failed++;
        } else {
            report.validation.passed++;
        }
    });
    
    return report;
}
```

### 20. נוספות ✅
**מקור:** חישוב מהכותרות 18+19 (125% + 150%)  
**הגדרה:** סה"כ שעות נוספות  
**הערה:** לא חיוני - ניתן לסכם באקסל (125% + 150%)

```javascript
function getTotalOvertimeHours(employeeData) {
    // סיכום של 125% + 150%
    let total125 = calculateCorrect125Hours(employeeData).overtime125;
    let total150 = calculateCorrect150Hours(employeeData).overtime150;
    
    return {
        totalOvertime: total125 + total150,
        note: 'סיכום 125% + 150% - ניתן לחישוב באקסל'
    };
}
```

**🔗 הערה למיפוי מול תלוש:**  
**עמודה זו אינה חיונית - האקסל יסכם אוטומטית**

---

### 21. שעות חוסר ✅
**מקור:** בלוק "סיכום" → שורת "שעות חוסר" → עמודה 3  
**הגדרה:** שעות חוסר מתקן העבודה (לפני קיזוזים)  
**⚠️ טעון תיקון:** יש לקזז חוסר תקן ממילואים/חופש/מחלה  

```javascript
function calculateCorrectedHoursDeficit(employeeData) {
    // מבלוק סיכום - ערך ראשוני
    let originalDeficit = employeeData.summary.hoursDeficit; // עמודה 3
    let correctedDeficit = originalDeficit;
    let offsets = [];
    
    // קיזוזים מהסייגים שהגדרנו
    employeeData.dailyData.forEach(day => {
        // 1. קיזוז בגין מילואים עם עבודה
        if (day.reservesEvent && day.paidHours > 0 && day.standardDeficit > 0) {
            correctedDeficit -= day.standardDeficit;
            offsets.push({
                date: day.date,
                type: 'reserves_work',
                offset: day.standardDeficit,
                reason: 'קיזוז חוסר תקן בגין מילואים עם עבודה'
            });
        }
        
        // 2. קיזוז בגין חופש/מחלה/חופשה מרוכזת עם חוסר תקן
        if ((day.vacationEvent || day.sickLeaveEvent || day.concentratedVacationEvent) 
            && day.standardDeficit > 0) {
            correctedDeficit -= day.standardDeficit;
            offsets.push({
                date: day.date,
                type: day.vacationEvent ? 'vacation' : 
                      day.sickLeaveEvent ? 'sick_leave' : 'concentrated_vacation',
                offset: day.standardDeficit,
                reason: 'קיזוז חוסר תקן בגין היעדרות'
            });
        }
    });
    
    return {
        originalDeficit: originalDeficit,
        correctedDeficit: Math.max(0, correctedDeficit), // לא יכול להיות שלילי
        totalOffsets: originalDeficit - correctedDeficit,
        offsets: offsets,
        note: 'מתוקן לאחר קיזוזי מילואים והיעדרויות'
    };
}
```

**🔗 הערה למיפוי מול תלוש:**  
**השעות החוסר המתוקנות משפיעות על חישוב השכר הסופי**

### 22. הפסקה ✅ ⚠️ טעון בדיקה ותיקון
**מקור:** מתחת לתג עובד (בכותרת העובד)  
**הגדרה:** הפסקת צהריים חובה מעל 6 שעות עבודה ביום  
**⚠️ בעיה:** מקאנו לא תמיד מחשב נכון ברמה יומית  

**חוק:** מעל 6 שעות עבודה ביום = חובת 0.5 שעות הפסקה

```javascript
function validateAndCorrectBreaks(employeeData) {
    let corrections = [];
    let totalBreakHours = 0;
    let recalculationNeeded = false;
    
    employeeData.dailyData.forEach(day => {
        if (day.dayType === 'יום חול' && day.paidHours > 6) {
            // חובה: 0.5 שעות הפסקה
            let requiredBreak = 0.5;
            let reportedBreak = day.breakHours || 0;
            
            if (reportedBreak !== requiredBreak) {
                corrections.push({
                    employee: employeeData.name,
                    date: day.date,
                    workedHours: day.paidHours,
                    reportedBreak: reportedBreak,
                    requiredBreak: requiredBreak,
                    correction: requiredBreak - reportedBreak,
                    reason: 'תיקון הפסקה לפי חוק - מעל 6 שעות'
                });
                
                // תיקון נדרש בכל הקטגוריות
                recalculationNeeded = true;
            }
            
            totalBreakHours += requiredBreak;
        }
    });
    
    // התראה לתיקון 100%, 125%, 150% ושעות משולמות
    if (recalculationNeeded) {
        corrections.push({
            employee: employeeData.name,
            type: 'recalculation_alert',
            message: '⚠️ נדרש תיקון: 100%, 125%, 150% ושעות משולמות',
            reason: 'שינוי בהפסקות משפיע על כל חישובי השעות'
        });
    }
    
    return {
        totalBreakHours: totalBreakHours,
        corrections: corrections,
        recalculationNeeded: recalculationNeeded,
        note: 'בדיקה יומית - 0.5 שעות הפסקה מעל 6 שעות עבודה'
    };
}
```

**🔗 השפעה על חישובים:**
**תיקון הפסקות → תיקון 100% → תיקון 125%/150% → תיקון שעות משולמות**

**דוגמאות:**
- **9 שעות עבודה:** 8.5 שעות משולמות (עם הפסקה)
- **6 שעות עבודה:** 6 שעות משולמות (ללא הפסקה)
- **10 שעות עבודה:** 9.5 שעות משולמות (עם הפסקה)

### 23. קוד עובד
**סטטוס:** ממתין להגדרה

---

## 📊 סיכום התקדמות

**הושלמו:** 13/29 כותרות (45%)  
**נותרו:** 16 כותרות  

### כותרות הושלמו:
✅ מחלקה  
✅ תג בשכר  
✅ שם עובד  
✅ ימי תקן  
✅ ימי נוכחות  
✅ ימי ו'  
✅ חג  
✅ חופש  
✅ חופשה מרוכזת  
✅ מחלה  
✅ מחלה לתשלום  
✅ מילואים  
✅ ימים משולמים  

### הבא בתור:
🔄 הפרש לחישוב מקאנו (כותרת #14)

---

## 🔗 מיפוי מול תלוש שכר ⭐ חדש

### מטרה
**עדכון מודול בדיקות והשוואה מול מקאנו** - זיהוי הפרשים וחריגים

### שדות למיפוי
| שדה מקאנו | שדה תלוש | הערות מיפוי |
|------------|-----------|--------------|
| שם עובד | שם מלא | השוואת שמות |
| קוד עובד (מקאנו) | תג בשכר (תלוש) | **מיפוי נפרד נדרש** |
| ימי תקן | ימי עבודה בתלוש | השוואה + זיהוי הפרשים |
| שעות משולמות | סה"כ שעות | בדיקת התאמה |
| שעות 100% | שעות רגילות | השוואה בסיסית |
| שעות 125% | שעות נוספות 125% | לאחר תיקון מקאנו |
| שעות 150% | שעות נוספות 150% | לאחר תיקון מקאנו |
| ארוחות (מחושב) | רכיב ארוחות | זיהוי חריגי "תן ביס" |
| הפרשות | רכיבי הפרשה | גמל, פיצויים, קה"ש |

### חריגים מיוחדים בתלוש
```javascript
function identifyPayslipExceptions(payslipData) {
    let exceptions = [];
    
    // "תן ביס" - הערה בתלוש בלבד
    if (payslipData.notes && payslipData.notes.includes('תן ביס')) {
        exceptions.push({
            type: 'tan_bis_payslip',
            note: 'מידע תן ביס - ראה הערה בתלוש, לא בחישוב מקאנו',
            action: 'manual_mapping_required'
        });
    }
    
    // רכיבי שכר שלא קיימים במקאנו
    const mecanoFields = ['basic_salary', 'overtime_125', 'overtime_150', 'meals'];
    const payslipFields = Object.keys(payslipData.components);
    
    payslipFields.forEach(field => {
        if (!mecanoFields.includes(field)) {
            exceptions.push({
                type: 'payslip_only_component',
                field: field,
                value: payslipData.components[field],
                note: 'רכיב קיים בתלוש בלבד - לא במקאנו'
            });
        }
    });
    
    return exceptions;
}
```

### דוח השוואה מפורט
```javascript
function generateComparisonReport(mecanoData, payslipData) {
    let report = {
        matches: [],
        discrepancies: [],
        payslipOnlyFields: [],
        mecanoOnlyFields: []
    };
    
    // השוואת שדות משותפים
    const commonFields = ['workDays', 'totalHours', 'regularHours', 'meals'];
    
    commonFields.forEach(field => {
        const mecanoValue = mecanoData[field];
        const payslipValue = payslipData[field];
        const difference = Math.abs(mecanoValue - payslipValue);
        
        if (difference < 0.01) {
            report.matches.push({
                field: field,
                value: mecanoValue,
                status: 'תואם'
            });
        } else {
            report.discrepancies.push({
                field: field,
                mecanoValue: mecanoValue,
                payslipValue: payslipValue,
                difference: difference,
                percentage: (difference / mecanoValue * 100).toFixed(2),
                severity: difference > (mecanoValue * 0.1) ? 'קריטי' : 'בינוני'
            });
        }
    });
    
    return report;
}
```

### הנחיות לעדכון מודול בדיקות
1. **תג שכר**: צור מיפוי ידני קוד מקאנו ↔ תג תלוש
2. **"תן ביס"**: טפל בהערות תלוש במיפוי נפרד (לא בחישוב אוטומטי)
3. **רכיבי שכר נוספים**: זהה רכיבים שקיימים רק בתלוש
4. **סף חריגות**: הגדר סף של 5% להפרשים "מותרים"
5. **דוח פעולות**: תעד כל הפרש שנמצא ופעולת המעקב

---