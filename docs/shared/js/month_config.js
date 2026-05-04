// month_config.js - קונפיגורציית חודשים דינמית
// מרכז את כל ההגדרות התלויות בחודש עבודה

const MonthConfig = (function() {
    'use strict';

    // חגים ישראליים קבועים (לוח עברי - תאריכים גרגוריאניים משתנים)
    // יש לעדכן שנתית או לחשב דינמית
    const HOLIDAYS_BY_YEAR = {
        2025: {
            '2025-01-01': 'ראש השנה הלועזי',
            '2025-03-14': 'פורים',
            '2025-04-13': 'פסח - ערב חג',
            '2025-04-14': 'פסח - יום א',
            '2025-04-20': 'פסח - שביעי',
            '2025-05-01': 'יום העצמאות',
            '2025-06-02': 'שבועות',
            '2025-09-23': 'ראש השנה א',
            '2025-09-24': 'ראש השנה ב',
            '2025-10-02': 'יום כיפור',
            '2025-10-07': 'סוכות',
            '2025-10-14': 'שמחת תורה'
        },
        2026: {
            '2026-01-01': 'ראש השנה הלועזי',
            '2026-03-03': 'פורים',
            '2026-04-02': 'פסח - ערב חג',
            '2026-04-03': 'פסח - יום א',
            '2026-04-09': 'פסח - שביעי',
            '2026-04-22': 'יום העצמאות',
            '2026-05-22': 'שבועות',
            '2026-09-12': 'ראש השנה א',
            '2026-09-13': 'ראש השנה ב',
            '2026-09-21': 'יום כיפור',
            '2026-09-26': 'סוכות',
            '2026-10-03': 'שמחת תורה'
        }
    };

    // חישוב ימי עבודה מקסימליים לחודש נתון
    function calculateMaxWorkDays(year, month) {
        const daysInMonth = new Date(year, month, 0).getDate();
        let workDays = 0;

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const dayOfWeek = date.getDay();
            // ימים א-ה = ימי עבודה (0=ראשון, 6=שבת)
            // שישי (5) ושבת (6) = סוף שבוע
            if (dayOfWeek !== 5 && dayOfWeek !== 6) {
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const yearHolidays = HOLIDAYS_BY_YEAR[year] || {};
                if (!yearHolidays[dateStr]) {
                    workDays++;
                }
            }
        }

        return workDays;
    }

    // קבלת חגים לחודש נתון
    function getHolidaysForMonth(year, month) {
        const yearHolidays = HOLIDAYS_BY_YEAR[year] || {};
        const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
        const holidays = [];

        Object.entries(yearHolidays).forEach(([date, name]) => {
            if (date.startsWith(monthPrefix)) {
                holidays.push({ date, name });
            }
        });

        return holidays;
    }

    // קונפיגורציה מלאה לחודש
    function getMonthConfig(year, month) {
        const maxWorkDays = calculateMaxWorkDays(year, month);
        const holidays = getHolidaysForMonth(year, month);
        const monthNames = [
            '', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
            'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
        ];

        return {
            year: year,
            month: month,
            monthName: monthNames[month],
            periodKey: `${year}-${String(month).padStart(2, '0')}`,
            periodDisplay: `${monthNames[month]} ${year}`,
            maxWorkDays: maxWorkDays,
            holidays: holidays,
            holidayCount: holidays.length,
            daysInMonth: new Date(year, month, 0).getDate()
        };
    }

    // קבועים עסקיים (לא תלויים בחודש)
    const BUSINESS_CONSTANTS = {
        mealPricePerDay: 40,        // 40 שקל לארוחה
        pensionRate: 0.065,          // 6.5% פנסיה מעסיק
        compensationRate: 0.0833,    // 8.33% פיצויים
        advancedStudyRate: 0.075,    // 7.5% קה"ש
        hoursDiffTolerance: 1,       // טווח הפרש שעות מותר
        mealDiffTolerance: 40,       // טווח הפרש ארוחות מותר (שקלים)
        overtimeWarningThreshold: 50 // סף שעות נוספות לאזהרה
    };

    // localStorage key לשמירת בחירת החודש
    const STORAGE_KEY = 'pandatech_selected_month';

    // שמירת החודש הנבחר
    function saveSelectedMonth(year, month) {
        const config = getMonthConfig(year, month);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            year: year,
            month: month,
            savedAt: new Date().toISOString()
        }));
        return config;
    }

    // טעינת החודש הנבחר (או ברירת מחדל - חודש נוכחי)
    function loadSelectedMonth() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const data = JSON.parse(saved);
                return getMonthConfig(data.year, data.month);
            }
        } catch (e) {
            // ignore
        }
        // ברירת מחדל - חודש קודם (כי בדיקת תלושים היא תמיד לחודש שעבר)
        const now = new Date();
        let year = now.getFullYear();
        let month = now.getMonth(); // getMonth() = 0-11, חודש קודם
        if (month === 0) {
            month = 12;
            year--;
        }
        return getMonthConfig(year, month);
    }

    // יצירת HTML של בורר חודש
    function createMonthPickerHTML(containerId) {
        const current = loadSelectedMonth();
        const now = new Date();
        const currentYear = now.getFullYear();

        // טווח שנים: 2025 עד שנה הבאה
        const years = [];
        for (let y = 2025; y <= currentYear + 1; y++) {
            years.push(y);
        }

        return `
            <div id="${containerId}" class="month-picker-container" style="
                background: linear-gradient(135deg, #f0f7ff 0%, #e8f4fd 100%);
                border: 2px solid #30bced;
                border-radius: 12px;
                padding: 16px 20px;
                margin-bottom: 20px;
                display: flex;
                align-items: center;
                gap: 15px;
                flex-wrap: wrap;
                justify-content: center;
            ">
                <label style="font-weight: 600; color: #2b486a; font-size: 1.05rem;">
                    חודש עבודה:
                </label>
                <select id="monthPickerMonth" onchange="MonthConfig.onMonthChange()" style="
                    padding: 8px 16px;
                    border-radius: 8px;
                    border: 1.5px solid #30bced;
                    font-size: 1rem;
                    background: white;
                    color: #2b486a;
                    cursor: pointer;
                    min-width: 120px;
                ">
                    <option value="1">ינואר</option>
                    <option value="2">פברואר</option>
                    <option value="3">מרץ</option>
                    <option value="4">אפריל</option>
                    <option value="5">מאי</option>
                    <option value="6">יוני</option>
                    <option value="7">יולי</option>
                    <option value="8">אוגוסט</option>
                    <option value="9">ספטמבר</option>
                    <option value="10">אוקטובר</option>
                    <option value="11">נובמבר</option>
                    <option value="12">דצמבר</option>
                </select>
                <select id="monthPickerYear" onchange="MonthConfig.onMonthChange()" style="
                    padding: 8px 16px;
                    border-radius: 8px;
                    border: 1.5px solid #30bced;
                    font-size: 1rem;
                    background: white;
                    color: #2b486a;
                    cursor: pointer;
                    min-width: 90px;
                ">
                    ${years.map(y => `<option value="${y}">${y}</option>`).join('')}
                </select>
                <div id="monthPickerInfo" style="
                    background: white;
                    padding: 6px 14px;
                    border-radius: 8px;
                    font-size: 0.9rem;
                    color: #528163;
                    border: 1px solid #d1e8d5;
                ">
                    ${current.maxWorkDays} ימי עבודה | ${current.holidayCount} חגים
                </div>
            </div>
        `;
    }

    // עדכון בורר החודש בעת שינוי
    function onMonthChange() {
        const monthSelect = document.getElementById('monthPickerMonth');
        const yearSelect = document.getElementById('monthPickerYear');
        if (!monthSelect || !yearSelect) return;

        const year = parseInt(yearSelect.value);
        const month = parseInt(monthSelect.value);
        const config = saveSelectedMonth(year, month);

        // עדכון תצוגת המידע
        const info = document.getElementById('monthPickerInfo');
        if (info) {
            info.innerHTML = `${config.maxWorkDays} ימי עבודה | ${config.holidayCount} חגים`;
        }

        // שידור אירוע לכל המודולים שמאזינים
        window.dispatchEvent(new CustomEvent('monthChanged', { detail: config }));
    }

    // אתחול הבורר עם הערכים הנכונים
    function initMonthPicker() {
        const current = loadSelectedMonth();
        const monthSelect = document.getElementById('monthPickerMonth');
        const yearSelect = document.getElementById('monthPickerYear');

        if (monthSelect) monthSelect.value = current.month;
        if (yearSelect) yearSelect.value = current.year;
    }

    // רשימת חודשים זמינים (לתפריט)
    function getAvailableMonths() {
        const months = [];
        const now = new Date();
        const currentYear = now.getFullYear();

        for (let y = 2025; y <= currentYear + 1; y++) {
            const maxMonth = (y === currentYear + 1) ? 1 : 12;
            for (let m = 1; m <= maxMonth; m++) {
                months.push(getMonthConfig(y, m));
            }
        }
        return months;
    }

    // API ציבורי
    return {
        getMonthConfig: getMonthConfig,
        calculateMaxWorkDays: calculateMaxWorkDays,
        getHolidaysForMonth: getHolidaysForMonth,
        saveSelectedMonth: saveSelectedMonth,
        loadSelectedMonth: loadSelectedMonth,
        createMonthPickerHTML: createMonthPickerHTML,
        onMonthChange: onMonthChange,
        initMonthPicker: initMonthPicker,
        getAvailableMonths: getAvailableMonths,
        BUSINESS_CONSTANTS: BUSINESS_CONSTANTS,
        HOLIDAYS_BY_YEAR: HOLIDAYS_BY_YEAR
    };
})();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MonthConfig;
}
