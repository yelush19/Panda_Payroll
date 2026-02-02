// employees-data.js - נתוני כל 37 העובדים
// מקור: אלפון עובדים 2025 + דרישות מעודכנות
//
// מבנה נתונים:
// - פרופיל עובד (קבוע): name, dept, id, startDate, isShareholder, hasAdvancedStudyInContract, etc.
// - נתוני חודש (משתנה): workDaysActual, hoursInPayslip, mealAllowance, etc.
//   הנתונים החודשיים למטה הם דוגמה (מאי 2025) - בשימוש אמיתי, נתונים אלו נטענים מקבצי מקאנו/תלושים.
//
// פונקציית עזר: EmployeeDataHelper.mergeMonthlyData(employeesData, monthlyDataArray)
//   מאפשרת מיזוג נתוני חודש חדשים על פרופילי העובדים הקבועים.

const employeesData = {
    // בעלי מניות
    1: { 
        name: "בנימין זהר", 
        dept: "בעלי מניות", 
        id: "317607316", 
        hasPayslip: true,
        startDate: "01/12/2006",
        isShareholder: true,
        
        // נתוני עבודה ממקאנו
        workDaysActual: 20,        // ימי עבודה בפועל מנוכחות מקאנו
        vacationDaysUsed: 1,       // ימי חופש שנוצלו
        sickDaysUnpaid: 0,         // ימי מחלה ללא תשלום
        sickDaysPaid: 0,           // ימי מחלה בתשלום
        reserveDays: 0,            // ימי מילואים
        holidaysPaid: 1,           // ימי חג בתשלום מלא
        eveHolidays: 0,            // ימי ערב חג
        
        // נתוני תלוש
        workDaysPaid: 21,          // ימים משולמים בתלוש
        hoursInPayslip: 182,       // שעות עבודה בתלוש
        paidHoursInMecano: 180,    // שעות משולמות במקאנו
        mealAllowance: 800,        // ארוחות בתלוש
        
        // שעות נוספות
        hasIntensiveWork: false,   // האם יש רכיב עבודה מאומצת
        hasGlobalBonus: true,      // האם יש תוספת גלובלית
        intensiveHours: 0,         // שעות מאומצות
        overtime125: 2.25,         // שעות נוספות 125%
        overtime150: 0,            // שעות נוספות 150%
        
        // מחלה
        sickLeavePayment: 0,       // רכיב ימי מחלה בתשלום בתלוש
        isHourlyEmployee: false,   // עובד שעתי (תוספת) או גלובלי (חיוב)
        
        // הבראה
        isEligibleForRecovery: true,    // זכאי להבראה (כל העובדים למעט שעתיים מתחת לשנה)
        recoveryBalance: 2500,          // יתרות הבראה צבורה
        recoveryUsed: 500,              // ניצול הבראה
        recoveryReset: 0,               // איפוס בגין היעדרויות
        
        // מילואים מיוחד
        reserveWorkSameDayHours: 0,     // שעות עבודה ביום מילואים
        reserveDoublePayComponent: 0,   // רכיב "ש"ע בימי מילואים"
        
        // הפרשות - בעלי מניות לפי סוכן ביטוח
        baseSalary: 35000,
        pensionEmployer: 2275,          // הפרשת פנסיה מעסיק בפועל
        pensionRequired: 2275,          // הפרשת פנסיה נדרשת (6.5%)
        compensationEmployer: 2916,     // פיצויי פיטורים בפועל
        compensationRequired: 2916,     // פיצויי פיטורים נדרשים (8.33%)
        advancedStudyEmployer: 0,       // קה"ש בפועל
        advancedStudyRequired: 0,       // קה"ש נדרש לפי חוזה
        hasAdvancedStudyInContract: false, // קה"ש בחוזה
        
        // דוח חריגים
        exceptionsReport: "אין",
        exceptionCategory: "",
        exceptionAmount: 0,
        
        // הערות מיוחדות
        specialNotes: "בעל מניות - הפרשות לפי סוכן ביטוח"
    },

    2: { 
        name: "אבישי לייבנזון", 
        dept: "בעלי מניות", 
        id: "120831804", 
        hasPayslip: true,
        startDate: "01/01/2014",
        isShareholder: true,
        
        workDaysActual: 4,
        vacationDaysUsed: 0,
        sickDaysUnpaid: 0,
        sickDaysPaid: 0,
        reserveDays: 0,
        holidaysPaid: 0,
        eveHolidays: 0,
        
        workDaysPaid: 4,
        hoursInPayslip: 32,
        paidHoursInMecano: 32,
        mealAllowance: 160, // 4 ימים × 40₪
        
        hasIntensiveWork: false,
        hasGlobalBonus: true,
        intensiveHours: 0,
        overtime125: 3.25,
        overtime150: 0,
        
        sickLeavePayment: 0,
        isHourlyEmployee: false,
        
        isEligibleForRecovery: true,
        recoveryBalance: 3000,
        recoveryUsed: 0,
        recoveryReset: 0,
        
        reserveWorkSameDayHours: 0,
        reserveDoublePayComponent: 0,
        
        baseSalary: 35000,
        pensionEmployer: 2275,
        pensionRequired: 2275,
        compensationEmployer: 2916,
        compensationRequired: 2916,
        advancedStudyEmployer: 2625,
        advancedStudyRequired: 2625,
        hasAdvancedStudyInContract: true,
        
        exceptionsReport: "קיזוז בגין דמי חנוכה - 500₪",
        exceptionCategory: "קיזוז",
        exceptionAmount: -500,
        
        specialNotes: "בעל מניות - הפרשות לפי סוכן ביטוח"
    },

    // מל"מ
    3: { 
        name: "חיים ראש", 
        dept: "מל\"מ", 
        id: "058273851", 
        hasPayslip: true,
        startDate: "02/10/2012",
        isShareholder: false,
        
        workDaysActual: 15,
        vacationDaysUsed: 0,
        sickDaysUnpaid: 0,
        sickDaysPaid: 4,
        reserveDays: 0,
        holidaysPaid: 1,
        eveHolidays: 0,
        
        workDaysPaid: 20, // 15 בפועל + 4 מחלה + 1 חג = 20
        hoursInPayslip: 146,
        paidHoursInMecano: 152,
        mealAllowance: 600, // 15 ימים × 40₪
        
        hasIntensiveWork: false,
        hasGlobalBonus: false,
        intensiveHours: 0,
        overtime125: 15.55,
        overtime150: 8.20,
        
        sickLeavePayment: 320, // 4 ימי מחלה × 80₪
        isHourlyEmployee: true, // שעתי = תוספת
        
        isEligibleForRecovery: true,
        recoveryBalance: 1800,
        recoveryUsed: 200,
        recoveryReset: 0,
        
        reserveWorkSameDayHours: 0,
        reserveDoublePayComponent: 0,
        
        baseSalary: 20586,
        pensionEmployer: 1338,
        pensionRequired: 1338,
        compensationEmployer: 1715,
        compensationRequired: 1715,
        advancedStudyEmployer: 1544,
        advancedStudyRequired: 1544,
        hasAdvancedStudyInContract: true,
        
        exceptionsReport: "שעות נוספות מיוחדות - אישור מנהל",
        exceptionCategory: "שעות",
        exceptionAmount: 0,
        
        specialNotes: ""
    },

    4: { 
        name: "דוד אחדות", 
        dept: "מל\"מ", 
        id: "148548141", 
        hasPayslip: true,
        startDate: "15/03/2015",
        isShareholder: false,
        
        workDaysActual: 20,
        vacationDaysUsed: 1,
        sickDaysUnpaid: 0,
        sickDaysPaid: 0,
        reserveDays: 0,
        holidaysPaid: 1,
        eveHolidays: 0,
        
        workDaysPaid: 20,
        hoursInPayslip: 160,
        paidHoursInMecano: 160,
        mealAllowance: 800, // 20 ימים × 40₪
        
        hasIntensiveWork: false,
        hasGlobalBonus: false,
        intensiveHours: 0,
        overtime125: 5.0,
        overtime150: 0,
        
        sickLeavePayment: 0,
        isHourlyEmployee: true,
        
        isEligibleForRecovery: true,
        recoveryBalance: 2200,
        recoveryUsed: 400,
        recoveryReset: 0,
        
        reserveWorkSameDayHours: 0,
        reserveDoublePayComponent: 0,
        
        baseSalary: 22000,
        pensionEmployer: 1430,
        pensionRequired: 1430,
        compensationEmployer: 1833,
        compensationRequired: 1833,
        advancedStudyEmployer: 1650,
        advancedStudyRequired: 1650,
        hasAdvancedStudyInContract: true,
        
        exceptionsReport: "אין",
        exceptionCategory: "",
        exceptionAmount: 0,
        
        specialNotes: ""
    },

    5: { 
        name: "לוי דביש", 
        dept: "מל\"מ", 
        id: "144217130", 
        hasPayslip: true,
        startDate: "10/06/2018",
        isShareholder: false,
        
        workDaysActual: 21,
        vacationDaysUsed: 0,
        sickDaysUnpaid: 0,
        sickDaysPaid: 0,
        reserveDays: 0,
        holidaysPaid: 1,
        eveHolidays: 0,
        
        workDaysPaid: 21, // חריגה!
        hoursInPayslip: 168,
        paidHoursInMecano: 169,
        mealAllowance: 840, // 21 ימים × 40₪
        
        hasIntensiveWork: false,
        hasGlobalBonus: false,
        intensiveHours: 0,
        overtime125: 2.0,
        overtime150: 0,
        
        sickLeavePayment: 0,
        isHourlyEmployee: true,
        
        isEligibleForRecovery: true,
        recoveryBalance: 1600,
        recoveryUsed: 0,
        recoveryReset: 0,
        
        reserveWorkSameDayHours: 0,
        reserveDoublePayComponent: 0,
        
        baseSalary: 18500,
        pensionEmployer: 1203,
        pensionRequired: 1203,
        compensationEmployer: 1541,
        compensationRequired: 1541,
        advancedStudyEmployer: 0, // חסר הפרשה!
        advancedStudyRequired: 1388,
        hasAdvancedStudyInContract: true, // יש בחוזה אבל לא מופרש
        
        exceptionsReport: "אין",
        exceptionCategory: "",
        exceptionAmount: 0,
        
        specialNotes: "חסר הפרשה לקה\"ש למרות שבחוזה"
    },

    // פרויקט דרום
    13: { 
        name: "יורם שלמה", 
        dept: "פרויקט דרום", 
        id: "111110236", 
        hasPayslip: true,
        startDate: "12/02/2017",
        isShareholder: false,
        
        workDaysActual: 20,
        vacationDaysUsed: 1,
        sickDaysUnpaid: 0,
        sickDaysPaid: 0,
        reserveDays: 0,
        holidaysPaid: 1,
        eveHolidays: 0,
        
        workDaysPaid: 20,
        hoursInPayslip: 160,
        paidHoursInMecano: 160,
        mealAllowance: 0, // ללא חיוב ארוחות!
        hasAshel: true,   // יש רכיב אשל
        ashelAmount: 300, // סכום אשל בתלוש
        
        hasIntensiveWork: false,
        hasGlobalBonus: false,
        intensiveHours: 0,
        overtime125: 10.0,
        overtime150: 5.0,
        
        sickLeavePayment: 0,
        isHourlyEmployee: true,
        
        isEligibleForRecovery: true,
        recoveryBalance: 1900,
        recoveryUsed: 300,
        recoveryReset: 0,
        
        reserveWorkSameDayHours: 0,
        reserveDoublePayComponent: 0,
        
        baseSalary: 17500,
        pensionEmployer: 1138,
        pensionRequired: 1138,
        compensationEmployer: 1458,
        compensationRequired: 1458,
        advancedStudyEmployer: 1313,
        advancedStudyRequired: 1313,
        hasAdvancedStudyInContract: true,
        
        exceptionsReport: "ללא ארוחות - לא אוכל בעבודה",
        exceptionCategory: "חריג קבוע",
        exceptionAmount: 0,
        
        specialNotes: "ללא חיוב ארוחות + רכיב אשל"
    },

    // משרד - חריגים מיוחדים בארוחות
    29: { 
        name: "ירדן אפל", 
        dept: "משרד", 
        id: "202343718", 
        hasPayslip: true,
        startDate: "12/04/2020",
        isShareholder: false,
        
        workDaysActual: 20,
        vacationDaysUsed: 1,
        sickDaysUnpaid: 0,
        sickDaysPaid: 0,
        reserveDays: 0,
        holidaysPaid: 1,
        eveHolidays: 0,
        
        workDaysPaid: 20,
        hoursInPayslip: 160,
        paidHoursInMecano: 160,
        mealAllowance: 850, // חריג מיוחד - לא לפי נוסחה!
        isOfficeSpecialException: true, // עובד משרד עם חריג מיוחד
        
        hasIntensiveWork: false,
        hasGlobalBonus: false,
        intensiveHours: 0,
        overtime125: 2.0,
        overtime150: 0,
        
        sickLeavePayment: 0,
        isHourlyEmployee: false,
        
        isEligibleForRecovery: true,
        recoveryBalance: 1800,
        recoveryUsed: 200,
        recoveryReset: 0,
        
        reserveWorkSameDayHours: 0,
        reserveDoublePayComponent: 0,
        
        baseSalary: 19500,
        pensionEmployer: 1268,
        pensionRequired: 1268,
        compensationEmployer: 1624,
        compensationRequired: 1624,
        advancedStudyEmployer: 1463,
        advancedStudyRequired: 1463,
        hasAdvancedStudyInContract: true,
        
        exceptionsReport: "חריג ארוחות מיוחד - 850₪",
        exceptionCategory: "חריג מיוחד",
        exceptionAmount: 850,
        
        specialNotes: "עובד משרד - חריג מיוחד בארוחות"
    },

    30: { 
        name: "ליאור מיכאל", 
        dept: "משרד", 
        id: "101321114", 
        hasPayslip: true,
        startDate: "20/12/2024",
        isShareholder: false,
        
        workDaysActual: 19,
        vacationDaysUsed: 2,
        sickDaysUnpaid: 0,
        sickDaysPaid: 0,
        reserveDays: 0,
        holidaysPaid: 1,
        eveHolidays: 0,
        
        workDaysPaid: 19,
        hoursInPayslip: 152,
        paidHoursInMecano: 152,
        mealAllowance: 920, // חריג מיוחד
        isOfficeSpecialException: true,
        
        hasIntensiveWork: false,
        hasGlobalBonus: false,
        intensiveHours: 0,
        overtime125: 1.0,
        overtime150: 0,
        
        sickLeavePayment: 0,
        isHourlyEmployee: false,
        
        isEligibleForRecovery: false, // מתחת לשנה
        recoveryBalance: 0,
        recoveryUsed: 0,
        recoveryReset: 0,
        
        reserveWorkSameDayHours: 0,
        reserveDoublePayComponent: 0,
        
        baseSalary: 18800,
        pensionEmployer: 1222,
        pensionRequired: 1222,
        compensationEmployer: 1566,
        compensationRequired: 1566,
        advancedStudyEmployer: 0,
        advancedStudyRequired: 0,
        hasAdvancedStudyInContract: false, // עובד חדש - אין בחוזה
        
        exceptionsReport: "עובד חדש - חריג ארוחות",
        exceptionCategory: "עובד חדש",
        exceptionAmount: 0,
        
        specialNotes: "עובד משרד חדש - חריג מיוחד בארוחות"
    },

    31: { 
        name: "אלעד בצלאל", 
        dept: "משרד", 
        id: "125466357", 
        hasPayslip: true,
        startDate: "08/01/2021",
        isShareholder: false,
        
        workDaysActual: 21,
        vacationDaysUsed: 0,
        sickDaysUnpaid: 0,
        sickDaysPaid: 0,
        reserveDays: 0,
        holidaysPaid: 1,
        eveHolidays: 0,
        
        workDaysPaid: 21, // חריגה!
        hoursInPayslip: 168,
        paidHoursInMecano: 168,
        mealAllowance: 1050, // חריג מיוחד
        isOfficeSpecialException: true,
        
        hasIntensiveWork: false,
        hasGlobalBonus: false,
        intensiveHours: 0,
        overtime125: 3.0,
        overtime150: 0,
        
        sickLeavePayment: 0,
        isHourlyEmployee: false,
        
        isEligibleForRecovery: true,
        recoveryBalance: 2100,
        recoveryUsed: 300,
        recoveryReset: 0,
        
        reserveWorkSameDayHours: 0,
        reserveDoublePayComponent: 0,
        
        baseSalary: 20500,
        pensionEmployer: 1333,
        pensionRequired: 1333,
        compensationEmployer: 1708,
        compensationRequired: 1708,
        advancedStudyEmployer: 1538,
        advancedStudyRequired: 1538,
        hasAdvancedStudyInContract: true,
        
        exceptionsReport: "חריג ארוחות + חריגת ימי עבודה",
        exceptionCategory: "חריג מיוחד",
        exceptionAmount: 1050,
        
        specialNotes: "עובד משרד - חריג מיוחד + חריגת ימים"
    },

    33: { 
        name: "ולדה טרא", 
        dept: "משרד", 
        id: "217686061", 
        hasPayslip: true,
        startDate: "25/06/2023",
        isShareholder: false,
        
        workDaysActual: 17,
        vacationDaysUsed: 4,
        sickDaysUnpaid: 0,
        sickDaysPaid: 0,
        reserveDays: 0,
        holidaysPaid: 1,
        eveHolidays: 0,
        
        workDaysPaid: 17,
        hoursInPayslip: 136,
        paidHoursInMecano: 136,
        mealAllowance: 780, // חריג מיוחד
        isOfficeSpecialException: true,
        
        hasIntensiveWork: false,
        hasGlobalBonus: false,
        intensiveHours: 0,
        overtime125: 1.0,
        overtime150: 0,
        
        sickLeavePayment: 0,
        isHourlyEmployee: false,
        
        isEligibleForRecovery: true,
        recoveryBalance: 1400,
        recoveryUsed: 100,
        recoveryReset: 0,
        
        reserveWorkSameDayHours: 0,
        reserveDoublePayComponent: 0,
        
        baseSalary: 17800,
        pensionEmployer: 1157,
        pensionRequired: 1157,
        compensationEmployer: 1483,
        compensationRequired: 1483,
        advancedStudyEmployer: 1335,
        advancedStudyRequired: 1335,
        hasAdvancedStudyInContract: true,
        
        exceptionsReport: "חריג ארוחות מיוחד",
        exceptionCategory: "חריג מיוחד",
        exceptionAmount: 780,
        
        specialNotes: "עובדת משרד - חריג מיוחד בארוחות"
    },

    // עובדים חדשים ללא תלושים
    "new1": {
        name: "אורי אשתר", 
        dept: "לא ידוע", 
        id: "NEW1", 
        hasPayslip: false,
        startDate: "01/05/2025",
        isShareholder: false,
        
        reason: "עובד חדש - אין תלוש", 
        inMecano: true, 
        inPayslips: false,
        
        exceptionsReport: "עובד חדש", 
        exceptionCategory: "עובד חדש",
        exceptionAmount: 0,
        
        specialNotes: "נדרש הכנת מסמכי קליטה"
    },

    "new2": {
        name: "איילה שירזי", 
        dept: "לא ידוע", 
        id: "NEW2", 
        hasPayslip: false,
        startDate: "15/05/2025",
        isShareholder: false,
        
        reason: "עובדת חדשה - אין תלוש", 
        inMecano: true, 
        inPayslips: false,
        
        exceptionsReport: "עובדת חדשה", 
        exceptionCategory: "עובד חדש",
        exceptionAmount: 0,
        
        specialNotes: "נדרש הכנת מסמכי קליטה"
    }
};

// רשימת עובדי משרד עם חריגים מיוחדים בארוחות
const officeSpecialEmployees = ["ירדן אפל", "ליאור מיכאל", "אלעד בצלאל", "ולדה טרא"];

// רשימת עובדים ללא חיוב ארוחות
const noMealChargeEmployees = ["יורם שלמה"];

// עזר למיזוג נתוני חודש על פרופילי עובדים
const EmployeeDataHelper = {
    // שדות פרופיל קבועים (לא משתנים מחודש לחודש)
    PROFILE_FIELDS: [
        'name', 'dept', 'id', 'startDate', 'isShareholder',
        'hasIntensiveWork', 'hasGlobalBonus', 'isHourlyEmployee',
        'isOfficeSpecialException', 'hasAshel',
        'hasAdvancedStudyInContract', 'specialNotes'
    ],

    // שדות חודשיים (משתנים כל חודש - מגיעים מקבצים)
    MONTHLY_FIELDS: [
        'workDaysActual', 'vacationDaysUsed', 'sickDaysUnpaid', 'sickDaysPaid',
        'reserveDays', 'holidaysPaid', 'eveHolidays',
        'workDaysPaid', 'hoursInPayslip', 'paidHoursInMecano', 'mealAllowance',
        'intensiveHours', 'overtime125', 'overtime150',
        'sickLeavePayment', 'recoveryBalance', 'recoveryUsed', 'recoveryReset',
        'reserveWorkSameDayHours', 'reserveDoublePayComponent',
        'baseSalary', 'pensionEmployer', 'pensionRequired',
        'compensationEmployer', 'compensationRequired',
        'advancedStudyEmployer', 'advancedStudyRequired',
        'exceptionsReport', 'exceptionCategory', 'exceptionAmount',
        'ashelAmount', 'hasPayslip'
    ],

    // חילוץ פרופיל קבוע בלבד
    extractProfile(employee) {
        const profile = {};
        this.PROFILE_FIELDS.forEach(field => {
            if (employee[field] !== undefined) {
                profile[field] = employee[field];
            }
        });
        return profile;
    },

    // מיזוג נתוני חודש חדשים על פרופיל קיים
    mergeMonthlyData(baseData, monthlyArray) {
        const merged = {};
        // העתק פרופילים קיימים
        Object.keys(baseData).forEach(key => {
            merged[key] = { ...baseData[key] };
        });

        // מיזוג נתוני חודש (אם נתקבלו)
        if (Array.isArray(monthlyArray)) {
            monthlyArray.forEach(monthData => {
                // חפש עובד לפי שם או ת.ז.
                const matchKey = Object.keys(merged).find(key => {
                    const emp = merged[key];
                    return emp.name === monthData.name || emp.id === monthData.id;
                });
                if (matchKey) {
                    this.MONTHLY_FIELDS.forEach(field => {
                        if (monthData[field] !== undefined) {
                            merged[matchKey][field] = monthData[field];
                        }
                    });
                }
            });
        }
        return merged;
    },

    // שמירת נתוני חודש ב-localStorage
    saveMonthlyData(periodKey, data) {
        const key = `pandatech_monthly_${periodKey}`;
        localStorage.setItem(key, JSON.stringify({
            period: periodKey,
            savedAt: new Date().toISOString(),
            data: data
        }));
    },

    // טעינת נתוני חודש מ-localStorage
    loadMonthlyData(periodKey) {
        try {
            const key = `pandatech_monthly_${periodKey}`;
            const stored = localStorage.getItem(key);
            if (stored) {
                return JSON.parse(stored).data;
            }
        } catch (e) {
            // ignore
        }
        return null;
    },

    // רשימת תקופות שמורות
    getSavedPeriods() {
        const periods = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('pandatech_monthly_')) {
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    periods.push({
                        key: key,
                        period: data.period,
                        savedAt: data.savedAt
                    });
                } catch (e) {
                    // ignore
                }
            }
        }
        return periods.sort((a, b) => b.period.localeCompare(a.period));
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { employeesData, officeSpecialEmployees, noMealChargeEmployees, EmployeeDataHelper };
}