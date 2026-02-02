# מיפוי שדות למודול השוואה - comparison-table.html

**תאריך:** 6 במאי 2025  
**מטרה:** מיפוי שדות להשוואת מקאנו ↔ תלושי שכר  
**מודול:** comparison-table.html

---

## 🎯 מהות המודול

**מה המודול עושה:**
```
קובץ מקאנו (מעובד) ↔ השוואה ↔ קובץ תלושי שכר
      ↓                  ↓              ↓
  נתונים מתוקנים    זיהוי הפרשים   נתונים מהשכר
```

---

## 📊 מבנה המיפוי הנדרש

### 1. מיפוי שדות זיהוי
```javascript
const identificationMapping = {
    mecano: {
        'employeeName': 'שם עובד',
        'employeeCode': 'קוד עובד',
        'department': 'מחלקה'
    },
    payslip: {
        'fullName': 'שם מלא',
        'payrollTag': 'תג בשכר', 
        'dept': 'מחלקה/אגף'
    }
};
```

### 2. מיפוי שדות להשוואה
```javascript
const comparisonMapping = {
    // ימי עבודה
    workDays: {
        mecano: 'workDays',        // ימי תקן מחושבים
        payslip: 'ימי עבודה',      // מהתלוש
        threshold: 1,               // הפרש מותר
        type: 'numeric'
    },
    
    // שעות רגילות
    regularHours: {
        mecano: 'regularHours',     // 100% מתוקן
        payslip: 'שעות רגילות',    
        threshold: 0.5,
        type: 'numeric'
    },
    
    // שעות נוספות 125%
    overtime125: {
        mecano: 'overtime125',      // מתוקן
        payslip: 'נוספות 125%',
        threshold: 0.1,
        type: 'numeric'
    },
    
    // שעות נוספות 150%
    overtime150: {
        mecano: 'overtime150',      // מתוקן
        payslip: 'נוספות 150%',
        threshold: 0.1,
        type: 'numeric'
    },
    
    // ארוחות
    meals: {
        mecano: 'mealValue',        // חישוב × 40₪
        payslip: 'דמי ארוחות',
        threshold: 40,              // הפרש בש"ח
        type: 'currency'
    },
    
    // ימי חופש
    vacation: {
        mecano: 'vacationDays',
        payslip: 'ימי חופש',
        threshold: 0,
        type: 'numeric'
    },
    
    // ימי מחלה
    sickDays: {
        mecano: 'sickDays',
        payslip: 'ימי מחלה',
        threshold: 0,
        type: 'numeric'
    }
};
```

### 3. שדות שקיימים רק בתלוש
```javascript
const payslipOnlyFields = [
    'תן ביס',              // לא מופיע במקאנו
    'ניכויים שונים',      // מדוח חריגים
    'תוספות שונות',       // מדוח חריגים
    'הפרשות סוציאליות',   // חישוב נפרד
    'מס הכנסה',           // חישוב שקלולית
    'ביטוח לאומי',        // חישוב שקלולית
    'נטו לתשלום'          // סיכום סופי
];
```

### 4. שדות שקיימים רק במקאנו
```javascript
const mecanoOnlyFields = [
    'ימי נוכחות',         // פירוט יומי
    'שעות חוסר',          // לפני קיזוזים
    'הפסקות',             // פירוט יומי
    'חופשה מרוכזת',      // רק מל"מ
    'מחלה לתשלום',        // פירוט
    'ימי ו+ש'             // ספירה
];
```

---

## 🔧 לוגיקת השוואה נדרשת

### 1. פונקציית השוואה ראשית
```javascript
function compareEmployeeData(mecanoEmp, payslipEmp) {
    const comparison = {
        employee: mecanoEmp.employeeName,
        matches: [],
        warnings: [],
        errors: [],
        notFound: []
    };
    
    // עבור על כל שדה להשוואה
    Object.entries(comparisonMapping).forEach(([field, config]) => {
        const mecanoValue = mecanoEmp[config.mecano];
        const payslipValue = payslipEmp[config.payslip];
        
        const result = compareField(
            mecanoValue, 
            payslipValue, 
            config.threshold,
            config.type
        );
        
        // סיווג התוצאה
        if (result.status === 'match') {
            comparison.matches.push(result);
        } else if (result.status === 'warning') {
            comparison.warnings.push(result);
        } else if (result.status === 'error') {
            comparison.errors.push(result);
        }
    });
    
    return comparison;
}
```

### 2. השוואת שדה בודד
```javascript
function compareField(mecanoVal, payslipVal, threshold, type) {
    // המרה לפי סוג
    let val1 = convertValue(mecanoVal, type);
    let val2 = convertValue(payslipVal, type);
    
    // חישוב הפרש
    let difference = Math.abs(val1 - val2);
    
    // קביעת סטטוס
    let status;
    if (difference === 0) {
        status = 'match';
    } else if (difference <= threshold) {
        status = 'warning';
    } else {
        status = 'error';
    }
    
    return {
        field: field,
        mecano: val1,
        payslip: val2,
        difference: difference,
        threshold: threshold,
        status: status
    };
}
```

### 3. טיפול בחריגים מיוחדים
```javascript
function handleSpecialCases(employee, comparison) {
    // יורם שלמה - ארוחות
    if (employee.employeeName === 'יורם שלמה') {
        // הסר אזהרת ארוחות
        comparison.warnings = comparison.warnings.filter(
            w => w.field !== 'meals'
        );
        comparison.specialNotes.push('ללא ארוחות + אשל');
    }
    
    // בעלי מניות
    if (['בנימין זהר', 'אבישי לייבנזון'].includes(employee.employeeName)) {
        comparison.specialNotes.push('בעל מניות - נתונים קבועים');
    }
    
    // עובדי משרד עם חריגי ארוחות
    const officeExceptions = ['ולדה', 'ירדן', 'ליאור', 'אלעד'];
    if (officeExceptions.some(name => employee.employeeName.includes(name))) {
        comparison.specialNotes.push('חריג ארוחות משרד');
    }
    
    return comparison;
}
```

---

## 📋 תוצאות השוואה - פורמט נדרש

### 1. טבלה ראשית
```
┌────────────┬────────────┬────────────┬────────────┬───────┬────────┐
│ שם עובד   │ שדה        │ מקאנו      │ תלוש       │ הפרש  │ סטטוס  │
├────────────┼────────────┼────────────┼────────────┼───────┼────────┤
│ דוד כהן    │ ימי עבודה  │ 21         │ 21         │ 0     │ ✅     │
│            │ שעות 125%  │ 12.5       │ 10.5       │ -2    │ ⚠️     │
│            │ ארוחות     │ 840        │ 840        │ 0     │ ✅     │
├────────────┼────────────┼────────────┼────────────┼───────┼────────┤
│ רחל לוי   │ ימי עבודה  │ 20         │ 21         │ +1    │ ❌     │
│            │ שעות רגילות│ 168        │ 176        │ +8    │ ❌     │
└────────────┴────────────┴────────────┴────────────┴───────┴────────┘
```

### 2. סיכום כללי
```
📊 סיכום השוואה - מאי 2025
━━━━━━━━━━━━━━━━━━━━━━━━━━
👥 סה"כ עובדים: 37
✅ תואמים מלא: 25 (67.6%)
⚠️ הפרשים קלים: 8 (21.6%)
❌ חריגות: 4 (10.8%)

📈 לפי שדה:
• ימי עבודה: 95% התאמה
• שעות 125%: 78% התאמה
• שעות 150%: 82% התאמה
• ארוחות: 89% התאמה
```

---

## 🚨 בדיקות QA נדרשות

### 1. בדיקות טעינה
- [ ] טעינת נתוני מקאנו מ-localStorage
- [ ] העלאת קובץ תלושים (Excel)
- [ ] פרסור נתוני תלושים נכון
- [ ] זיהוי פורמט עמודות

### 2. בדיקות מיפוי
- [ ] התאמת שמות עובדים
- [ ] מיפוי קוד ↔ תג שכר
- [ ] זיהוי כל השדות הנדרשים
- [ ] טיפול בשדות חסרים

### 3. בדיקות השוואה
- [ ] חישוב הפרשים נכון
- [ ] החלת ספי סטייה (thresholds)
- [ ] סימון נכון (✅/⚠️/❌)
- [ ] טיפול בחריגים מיוחדים

### 4. בדיקות פלט
- [ ] יצירת טבלת השוואה
- [ ] חישוב סטטיסטיקות
- [ ] ייצוא לExcel
- [ ] הדפסה/PDF

---

## 💾 שמירת תוצאות השוואה

```javascript
function saveComparisonResults(results) {
    const storageKey = `pandatech_comparison_${reportPeriod}`;
    const data = {
        results: results,
        metadata: {
            comparedAt: new Date().toISOString(),
            mecanoFile: 'from_localStorage',
            payslipFile: uploadedFileName,
            employeeCount: results.length,
            statistics: calculateStatistics(results)
        }
    };
    
    localStorage.setItem(storageKey, JSON.stringify(data));
}
```

---

**זה המיפוי הנכון למודול comparison-table?** 🎯