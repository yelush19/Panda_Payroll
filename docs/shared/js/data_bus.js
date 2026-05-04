// data_bus.js - אפיק נתונים משותף בין מודולים
// מרכז את קריאה/כתיבה של נתונים ב-localStorage לשימוש כל המודולים

const DataBus = (function() {
    'use strict';

    const KEYS = {
        SELECTED_MONTH: 'pandatech_selected_month',
        MECANO_PREFIX: 'pandatech_mecano_advanced_',
        MECANO_VERSIONS: 'pandatech_mecano_advanced_versions',
        MONTHLY_PREFIX: 'pandatech_monthly_',
        UPLOAD_STATE: 'pandatech_upload_state',
        EXCEPTIONS_DATA: 'pandatech_exceptions_data',
        CHECK_RESULTS: 'pandatech_check_results'
    };

    // --- קריאת נתוני מקאנו מעובדים (מהמודול mecanochecker) ---
    function getLatestMecanoData() {
        try {
            const versionsRaw = localStorage.getItem(KEYS.MECANO_VERSIONS);
            if (!versionsRaw) return null;

            const versions = JSON.parse(versionsRaw);
            const keys = Object.keys(versions);
            if (keys.length === 0) return null;

            // מצא את הגרסה האחרונה
            const latestKey = keys.sort((a, b) => {
                const dateA = versions[a].savedAt || '';
                const dateB = versions[b].savedAt || '';
                return dateB.localeCompare(dateA);
            })[0];

            const raw = localStorage.getItem(latestKey);
            if (!raw) return null;

            const parsed = JSON.parse(raw);
            return {
                key: latestKey,
                metadata: parsed.metadata,
                mappedData: parsed.data.mappedData || [],
                originalData: parsed.data.originalData || [],
                systemData: parsed.data.systemData || {}
            };
        } catch (e) {
            return null;
        }
    }

    // קריאת נתוני מקאנו לתקופה ספציפית
    function getMecanoDataForPeriod(periodKey) {
        try {
            const versionsRaw = localStorage.getItem(KEYS.MECANO_VERSIONS);
            if (!versionsRaw) return null;

            const versions = JSON.parse(versionsRaw);
            const matchingKey = Object.keys(versions).find(key => {
                const meta = versions[key];
                return meta.reportPeriod && meta.reportPeriod.includes(periodKey);
            });

            if (!matchingKey) return null;

            const raw = localStorage.getItem(matchingKey);
            if (!raw) return null;

            const parsed = JSON.parse(raw);
            return {
                mappedData: parsed.data.mappedData || [],
                originalData: parsed.data.originalData || []
            };
        } catch (e) {
            return null;
        }
    }

    // --- שמירה וקריאה של תוצאות בדיקה ---
    function saveCheckResults(periodKey, results) {
        const key = `${KEYS.CHECK_RESULTS}_${periodKey}`;
        localStorage.setItem(key, JSON.stringify({
            period: periodKey,
            savedAt: new Date().toISOString(),
            results: results
        }));
    }

    function loadCheckResults(periodKey) {
        try {
            const key = `${KEYS.CHECK_RESULTS}_${periodKey}`;
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            return JSON.parse(raw).results;
        } catch (e) {
            return null;
        }
    }

    // --- שמירה וקריאה של נתוני חריגים ---
    function saveExceptionsData(periodKey, data) {
        const key = `${KEYS.EXCEPTIONS_DATA}_${periodKey}`;
        localStorage.setItem(key, JSON.stringify({
            period: periodKey,
            savedAt: new Date().toISOString(),
            data: data
        }));
    }

    function loadExceptionsData(periodKey) {
        try {
            const key = `${KEYS.EXCEPTIONS_DATA}_${periodKey}`;
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            return JSON.parse(raw).data;
        } catch (e) {
            return null;
        }
    }

    // --- מצב העלאה (איזה קבצים הועלו) ---
    function saveUploadState(state) {
        localStorage.setItem(KEYS.UPLOAD_STATE, JSON.stringify({
            savedAt: new Date().toISOString(),
            ...state
        }));
    }

    function loadUploadState() {
        try {
            const raw = localStorage.getItem(KEYS.UPLOAD_STATE);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    // --- פונקציות עזר ---

    // בדיקה אם יש נתונים זמינים לתקופה
    function hasDataForPeriod(periodKey) {
        return {
            mecano: getMecanoDataForPeriod(periodKey) !== null,
            monthly: localStorage.getItem(`${KEYS.MONTHLY_PREFIX}${periodKey}`) !== null,
            exceptions: localStorage.getItem(`${KEYS.EXCEPTIONS_DATA}_${periodKey}`) !== null,
            checks: localStorage.getItem(`${KEYS.CHECK_RESULTS}_${periodKey}`) !== null
        };
    }

    // סיכום כל הנתונים הזמינים (לדף הבית)
    function getDataSummary() {
        const summary = {
            hasMecanoData: false,
            hasMonthlyData: false,
            hasExceptions: false,
            hasCheckResults: false,
            periods: [],
            latestPeriod: null
        };

        try {
            // בדוק נתוני מקאנו
            const mecano = getLatestMecanoData();
            if (mecano) {
                summary.hasMecanoData = true;
                summary.latestPeriod = mecano.metadata.reportPeriod;
            }

            // מצא כל התקופות השמורות
            const periodsSet = new Set();
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(KEYS.MONTHLY_PREFIX)) {
                    const period = key.replace(KEYS.MONTHLY_PREFIX, '');
                    periodsSet.add(period);
                    summary.hasMonthlyData = true;
                }
            }
            summary.periods = Array.from(periodsSet).sort().reverse();
        } catch (e) {
            // ignore
        }

        return summary;
    }

    // יצירת HTML עבור סטטוס נתונים (להוספה במודולים)
    function createDataStatusHTML() {
        const summary = getDataSummary();
        const statusItems = [];

        if (summary.hasMecanoData) {
            statusItems.push('<span style="color: #10b981;">נתוני מקאנו זמינים</span>');
        } else {
            statusItems.push('<span style="color: #ef4444;">אין נתוני מקאנו - העלה קבצים</span>');
        }

        if (summary.hasMonthlyData) {
            statusItems.push(`<span style="color: #10b981;">${summary.periods.length} תקופות שמורות</span>`);
        }

        return `
            <div class="data-status-bar" style="
                background: #f8fbfe;
                border: 1px solid #e1e8ed;
                border-radius: 8px;
                padding: 8px 16px;
                margin-bottom: 12px;
                font-size: 0.85rem;
                display: flex;
                gap: 15px;
                align-items: center;
                flex-wrap: wrap;
            ">
                <strong>נתונים:</strong>
                ${statusItems.join(' | ')}
            </div>
        `;
    }

    return {
        KEYS: KEYS,
        getLatestMecanoData: getLatestMecanoData,
        getMecanoDataForPeriod: getMecanoDataForPeriod,
        saveCheckResults: saveCheckResults,
        loadCheckResults: loadCheckResults,
        saveExceptionsData: saveExceptionsData,
        loadExceptionsData: loadExceptionsData,
        saveUploadState: saveUploadState,
        loadUploadState: loadUploadState,
        hasDataForPeriod: hasDataForPeriod,
        getDataSummary: getDataSummary,
        createDataStatusHTML: createDataStatusHTML
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataBus;
}
