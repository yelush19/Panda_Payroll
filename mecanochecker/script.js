// מערכת מתקדמת לעיבוד 2 קבצי מקאנו - גרסה 5.0
// 1. דוח אירועים (EVENTSREPORT) - אירועים לכל עובד  
// 2. דוח מפורט (EmployeesDetailed) או דוח מרכז (platoon) - נתונים מספריים

let allEmployees = [];
let columns = [];
let visibleColumns = [];
let sortColumn = null;
let sortDirection = 1;
let reportPeriod = "";
let mappedData = [];
let correctionsLog = [];
let unmappedColumns = [];

// נתוני המערכת החדשה
let systemData = {
    eventsData: [],      // מדוח האירועים
    summaryData: [],     // מדוח המפורט/מרכז
    uploadedFiles: [],   // קבצים שהועלו
    dynamicColumns: [],  // עמודות דינמיות שזוהו
    reportPeriod: ""
};

// תצורת חודשים דינמית - נטענת מ-MonthConfig אם זמין
function getMonthlyConfig(periodKey) {
    if (typeof MonthConfig !== 'undefined') {
        const parts = periodKey.split('-');
        if (parts.length === 2) {
            const config = MonthConfig.getMonthConfig(parseInt(parts[0]), parseInt(parts[1]));
            return {
                maxWorkDays: config.maxWorkDays,
                holidays: config.holidays.map(h => h.date)
            };
        }
    }
    // fallback - חישוב בסיסי
    return { maxWorkDays: 22, holidays: [] };
}

// מיפוי בסיסי לעמודות תקניות
const baseColumnMapping = {
    'שם עובד': 'name',
    'קוד עובד': 'code', 
    'מחלקה': 'department',
    'ת.ז': 'id',
    'ימי תקן': 'standardDays',
    'ימי נוכחות': 'attendanceDays',
    'שעות נוכחות': 'attendanceHours',
    'שעות תקן': 'standardHours',
    'שעות משולמות': 'paidHours',
    'שעות חוסר': 'deficitHours',
    'שעות נוספות': 'overtimeHours',
    'הפסקות': 'breakHours',
    '100%': 'regular100',
    '125%': 'overtime125',
    '150%': 'overtime150',
    'ימי ו\'+ש\'': 'weekendDays',
    'ארוחות': 'meals'
};

// ========== MAIN FILE PROCESSING ==========

// העלאת קבצים מרובים
document.getElementById('fileInput').addEventListener('change', function(e) {
    const files = Array.from(e.target.files);
    
    if (files.length === 0) return;
    
    showStatus('info', `<div class="loading"></div> טוען ${files.length} קבצי מקאנו...`);
    
    setTimeout(() => {
        processMultipleMecanoFiles(files);
    }, 300);
});

// זיהוי אוטומטי של סוג קובץ
function detectMecanoFileType(filename, data) {
    const fname = filename.toLowerCase();
    
    // זיהוי לפי שם הקובץ
    if (fname.includes('events') || fname.includes('אירועים')) {
        return 'events';
    }
    if (fname.includes('detailed') || fname.includes('מפורט')) {
        return 'detailed';
    }
    if (fname.includes('platoon') || fname.includes('מרכז')) {
        return 'summary';
    }
    
    // זיהוי לפי תוכן הקובץ
    if (data && data.length > 0) {
        const headers = data[0] || [];
        const headerText = headers.join(' ').toLowerCase();
        
        // אם יש הרבה עמודות עם שמות אירועים
        if (headers.length > 10 && (headerText.includes('חג') || headerText.includes('מחלה'))) {
            return 'events';
        }
        
        // אם יש עמודות מספריות טיפוסיות
        if (headerText.includes('שעות') || headerText.includes('ימים')) {
            return headers.length > 15 ? 'detailed' : 'summary';
        }
    }
    
    return 'unknown';
}

// עיבוד קבצים מרובים
async function processMultipleMecanoFiles(files) {
    console.log(`🚀 מתחיל עיבוד ${files.length} קבצי מקאנו...`);
    
    try {
        // איפוס נתונים
        systemData = {
            eventsData: [],
            summaryData: [],
            uploadedFiles: [],
            dynamicColumns: [],
            reportPeriod: ""
        };
        
        // עיבוד כל קובץ
        for (const file of files) {
            console.log(`📂 מעבד קובץ: ${file.name}`);
            
            const rows = await parseExcelFile(file);
            const fileType = detectMecanoFileType(file.name, rows);
            
            console.log(`🔍 זוהה כסוג: ${fileType}`);
            
            // שמירת הקובץ
        const fileName = `מקאנו_מתקדם_${reportPeriod || new Date().toISOString().slice(0,10)}.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        showStatus('success', `✅ הקובץ יוצא בהצלחה: ${fileName}`);try {
        // איחוד הנתונים
        const mergedData = mergeDataSources();
        
        // הכנת נתונים לתצוגה
        allEmployees = mergedData;
        mappedData = createDisplayData(mergedData);
        columns = Object.keys(mappedData[0] || {});
        visibleColumns = [...columns];
        
        // עדכון תצוגה
        showStatus('success', `✅ עיבוד הושלם בהצלחה! 
        נמצאו ${mergedData.length} עובדים עם ${systemData.dynamicColumns.length} סוגי אירועים`);
        showReportPeriod();
        showColumnsToggle();
        displayTable();
        
        // שמירה אוטומטית
        savePersistentData('processed', {
            mappedData: mappedData,
            originalData: allEmployees,
            systemData: systemData
        });
        
        console.log('✅ עיבוד מתקדם הושלם בהצלחה!');
        
    } catch (error) {
        console.error('❌ שגיאה בייצוא:', error);
        showStatus('error', `שגיאה בייצוא: ${error.message}`);
    }
}

function createMappedDataSheet() {
    const ws_data = [
        ['דוח מאוחד - מקאנו מתקדם'],
        [`נוצר: ${new Date().toLocaleDateString('he-IL')}`],
        []
    ];
    
    // כותרות
    ws_data.push(visibleColumns);
    
    // נתונים
    mappedData.forEach(emp => {
        const row = visibleColumns.map(col => emp[col] || 0);
        ws_data.push(row);
    });
    
    return XLSX.utils.aoa_to_sheet(ws_data);
}

function createDetailedDataSheet() {
    const ws_data = [
        ['פירוט אירועים לכל עובד'],
        [],
        ['שם עובד', 'מחלקה', 'קוד עובד', 'אירועים מפורטים']
    ];
    
    allEmployees.forEach(emp => {
        const eventsText = Object.entries(emp.events)
            .map(([event, count]) => `${event}: ${count}`)
            .join(', ') || 'ללא אירועים';
            
        ws_data.push([emp.name, emp.department, emp.code, eventsText]);
    });
    
    return XLSX.utils.aoa_to_sheet(ws_data);
}

function createStatisticsSheet() {
    const ws_data = [
        ['סטטיסטיקות מערכת מקאנו מתקדמת'],
        [],
        ['סה"כ עובדים', allEmployees.length],
        ['קבצים עובדו', systemData.uploadedFiles.length],
        ['סוגי אירועים', systemData.dynamicColumns.length],
        []
    ];
    
    // פילוח לפי מחלקות
    const deptStats = {};
    allEmployees.forEach(emp => {
        const dept = emp.department || 'לא ידוע';
        deptStats[dept] = (deptStats[dept] || 0) + 1;
    });
    
    ws_data.push(['פילוח לפי מחלקות:']);
    Object.entries(deptStats).forEach(([dept, count]) => {
        ws_data.push([dept, count]);
    });
    
    // סיכום אירועים
    ws_data.push([]);
    ws_data.push(['סיכום אירועים:']);
    const eventStats = {};
    allEmployees.forEach(emp => {
        Object.entries(emp.events).forEach(([event, count]) => {
            eventStats[event] = (eventStats[event] || 0) + count;
        });
    });
    
    // סיכום אירועים לפי קטגוריות
    ws_data.push([]);
    ws_data.push(['סיכום אירועים לפי קטגוריות:']);
    const categoryStats = {};
    allEmployees.forEach(emp => {
        Object.entries(emp.events).forEach(([event, count]) => {
            const category = categorizeEvent(event);
            categoryStats[category] = (categoryStats[category] || 0) + count;
        });
    });
    
    Object.entries(categoryStats).forEach(([category, total]) => {
        ws_data.push([category, total]);
    });
    
    ws_data.push([]);
    ws_data.push(['פירוט אירועים מלא:']);
    Object.entries(eventStats).forEach(([event, total]) => {
        ws_data.push([event, total, categorizeEvent(event)]);
    });
    
    // קבצים שעובדו
    ws_data.push([]);
    ws_data.push(['קבצים שעובדו:']);
    systemData.uploadedFiles.forEach(file => {
        ws_data.push([file.name, file.type, `${file.rows} שורות`]);
    });
    
    return XLSX.utils.aoa_to_sheet(ws_data);
}

function showStatus(type, message) {
    const section = document.getElementById('statusSection');
    if (section) {
        section.style.display = 'block';
        let alertClass = 'alert';
        if (type === 'error') alertClass += ' error';
        else if (type === 'info') alertClass += ' info';
        else if (type === 'success') alertClass += ' success';
        
        const statusMessage = document.getElementById('statusMessage');
        if (statusMessage) {
            statusMessage.innerHTML = `<div class="${alertClass}">${message}</div>`;
        }
    }
}

// ========== PERSISTENT STORAGE MANAGEMENT ==========
const STORAGE_PREFIX = 'pandatech_mecano_advanced_';

function savePersistentData(dataType, data) {
    const timestamp = new Date().toISOString();
    const periodKey = reportPeriod ? reportPeriod.replace(/[^\w]/g, '_') : timestamp.slice(0,10);
    const storageKey = `${STORAGE_PREFIX}${dataType}_${periodKey}`;
    
    const storageData = {
        data: data,
        metadata: {
            reportPeriod: reportPeriod,
            savedAt: timestamp,
            employeeCount: allEmployees.length,
            dataType: dataType,
            version: '5.0-advanced',
            files: systemData.uploadedFiles
        }
    };
    
    try {
        localStorage.setItem(storageKey, JSON.stringify(storageData));
        console.log(`✅ נשמר בהצלחה: ${storageKey}`);
        showStatus('info', `💾 נתונים נשמרו לזיכרון - ${dataType}`);
        
        updateVersionsList(storageKey, storageData.metadata);
        addDataManagementButtons();
        
    } catch (e) {
        console.error('❌ שגיאה בשמירה:', e);
        showStatus('error', 'שגיאה בשמירת נתונים לזיכרון');
    }
}

function updateVersionsList(key, metadata) {
    const versionsKey = `${STORAGE_PREFIX}versions`;
    let versions = {};
    
    try {
        const stored = localStorage.getItem(versionsKey);
        if (stored) {
            versions = JSON.parse(stored);
        }
    } catch (e) {
        versions = {};
    }
    
    versions[key] = metadata;
    localStorage.setItem(versionsKey, JSON.stringify(versions));
}

function addDataManagementButtons() {
    const exportButton = document.getElementById('exportExcelBtn');
    if (exportButton && !document.getElementById('dataManagementButtons')) {
        const buttonsHTML = `
            <div id="dataManagementButtons" style="margin: 10px 0;">
                <button id="saveDataBtn" class="btn btn-secondary" onclick="saveCurrentData()">
                    💾 שמור נתונים
                </button>
                <button id="showVersionsBtn" class="btn btn-secondary" onclick="showAvailableVersions()">
                    📋 גרסאות שמורות
                </button>
                <button id="backupAllBtn" class="btn btn-secondary" onclick="backupAllData()">
                    🗂️ גיבוי מלא
                </button>
                <button id="clearStorageBtn" class="btn btn-secondary" onclick="clearAllStorage()">
                    🗑️ נקה זיכרון
                </button>
            </div>
        `;
        exportButton.parentElement.insertAdjacentHTML('beforeend', buttonsHTML);
    }
}

window.saveCurrentData = function() {
    if (allEmployees.length > 0) {
        savePersistentData('processed', {
            mappedData: mappedData,
            originalData: allEmployees,
            systemData: systemData
        });
    } else {
        showStatus('error', 'אין נתונים לשמירה');
    }
}

function showAvailableVersions() {
    const versionsKey = `${STORAGE_PREFIX}versions`;
    try {
        const stored = localStorage.getItem(versionsKey);
        if (stored) {
            const versions = JSON.parse(stored);
            
            let versionsList = '<div class="versions-list"><h4>גרסאות שמורות:</h4>';
            Object.entries(versions).forEach(([key, meta]) => {
                const date = new Date(meta.savedAt).toLocaleDateString('he-IL');
                const time = new Date(meta.savedAt).toLocaleTimeString('he-IL');
                const filesInfo = meta.files ? 
                    `${meta.files.length} קבצים` : 'לא ידוע';
                
                versionsList += `
                    <div class="version-item" style="margin: 10px 0; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                        <strong>${meta.reportPeriod || date}</strong> (${meta.employeeCount} עובדים, ${filesInfo})<br>
                        <small>נשמר: ${date} ${time} | גרסה: ${meta.version}</small><br>
                        <button onclick="loadStoredVersion('${key}')" class="btn btn-secondary">טען גרסה</button>
                        <button onclick="exportStoredVersion('${key}')" class="btn btn-secondary">ייצא לאקסל</button>
                        <button onclick="deleteStoredVersion('${key}')" class="btn btn-secondary">מחק</button>
                    </div>
                `;
            });
            versionsList += '</div>';
            
            showStatus('info', versionsList);
        } else {
            showStatus('info', '📋 אין גרסאות שמורות');
        }
    } catch (e) {
        console.error('❌ שגיאה בקריאת גרסאות:', e);
        showStatus('error', 'שגיאה בקריאת גרסאות שמורות');
    }
}

window.loadStoredVersion = function(key) {
    try {
        const stored = localStorage.getItem(key);
        if (stored) {
            const data = JSON.parse(stored);
            
            allEmployees = data.data.originalData || [];
            mappedData = data.data.mappedData || [];
            systemData = data.data.systemData || {};
            columns = Object.keys(mappedData[0] || {});
            visibleColumns = [...columns];
            
            showReportPeriod();
            showColumnsToggle();
            displayTable();
            
            showStatus('success', `✅ נטענה גרסה מ-${data.metadata.savedAt}`);
        }
    } catch (e) {
        console.error('❌ שגיאה בטעינת גרסה:', e);
        showStatus('error', 'שגיאה בטעינת הגרסה');
    }
}

window.deleteStoredVersion = function(key) {
    if (confirm('האם אתה בטוח שברצונך למחוק גרסה זו?')) {
        try {
            localStorage.removeItem(key);
            
            const versionsKey = `${STORAGE_PREFIX}versions`;
            const stored = localStorage.getItem(versionsKey);
            if (stored) {
                const versions = JSON.parse(stored);
                delete versions[key];
                localStorage.setItem(versionsKey, JSON.stringify(versions));
            }
            
            showStatus('success', '✅ הגרסה נמחקה בהצלחה');
            showAvailableVersions();
        } catch (e) {
            console.error('❌ שגיאה במחיקה:', e);
            showStatus('error', 'שגיאה במחיקת הגרסה');
        }
    }
}

// ייצוא גרסה שמורה לאקסל
window.exportStoredVersion = function(key) {
    try {
        const stored = localStorage.getItem(key);
        if (stored) {
            const data = JSON.parse(stored);
            
            // שחזר זמנית את הנתונים
            const tempMappedData = mappedData;
            const tempAllEmployees = allEmployees;
            const tempSystemData = systemData;
            const tempReportPeriod = reportPeriod;
            
            mappedData = data.data.mappedData || [];
            allEmployees = data.data.originalData || [];
            systemData = data.data.systemData || {};
            reportPeriod = data.metadata.reportPeriod || '';
            
            // ייצא
            exportAdvancedExcel();
            
            // החזר את הנתונים המקוריים
            mappedData = tempMappedData;
            allEmployees = tempAllEmployees;
            systemData = tempSystemData;
            reportPeriod = tempReportPeriod;
            
            showStatus('success', '✅ הגרסה יוצאה בהצלחה');
        }
    } catch (e) {
        console.error('❌ שגיאה בייצוא גרסה:', e);
        showStatus('error', 'שגיאה בייצוא הגרסה');
    }
}

// גיבוי מלא של כל הנתונים
window.backupAllData = function() {
    try {
        const versionsKey = `${STORAGE_PREFIX}versions`;
        const allVersions = localStorage.getItem(versionsKey);
        
        if (allVersions) {
            const versions = JSON.parse(allVersions);
            const backup = {
                timestamp: new Date().toISOString(),
                versions: versions,
                data: {}
            };
            
            // אסוף את כל הנתונים
            Object.keys(versions).forEach(key => {
                const data = localStorage.getItem(key);
                if (data) {
                    backup.data[key] = JSON.parse(data);
                }
            });
            
            // הורד כקובץ JSON
            const dataStr = JSON.stringify(backup, null, 2);
            const dataBlob = new Blob([dataStr], {type: 'application/json'});
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `PandaTech_Backup_${new Date().toISOString().slice(0,10)}.json`;
            link.click();
            
            showStatus('success', '✅ גיבוי מלא הורד בהצלחה');
        } else {
            showStatus('info', 'אין נתונים לגיבוי');
        }
    } catch (e) {
        console.error('❌ שגיאה בגיבוי:', e);
        showStatus('error', 'שגיאה ביצירת גיבוי');
    }
}

// ניקוי זיכרון מלא
window.clearAllStorage = function() {
    if (confirm('האם אתה בטוח שברצונך למחוק את כל הנתונים השמורים? פעולה זו בלתי הפיכה!')) {
        try {
            // מחק את כל המפתחות של המערכת
            const keysToDelete = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(STORAGE_PREFIX)) {
                    keysToDelete.push(key);
                }
            }
            
            keysToDelete.forEach(key => localStorage.removeItem(key));
            
            showStatus('success', `✅ נמחקו ${keysToDelete.length} פריטים מהזיכרון`);
            
            // הסר את כפתורי הניהול
            const buttons = document.getElementById('dataManagementButtons');
            if (buttons) {
                buttons.remove();
            }
        } catch (e) {
            console.error('❌ שגיאה בניקוי זיכרון:', e);
            showStatus('error', 'שגיאה בניקוי הזיכרון');
        }
    }
}

// ========== INITIALIZATION ==========

// טעינה אוטומטית בעת פתיחת הדף
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ מערכת מקאנו מתקדמת מוכנה - גרסה 5.0');
    console.log('📋 תומכת בדוח אירועים + דוח נתונים');
    
    // הוסף הודעת הסבר למשתמש
    const helpText = document.createElement('div');
    helpText.style.cssText = 'margin: 10px 0; padding: 15px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px; font-size: 14px;';
    helpText.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 24px;">🚀</span>
            <div>
                <strong>מערכת מקאנו מתקדמת - גרסה 5.0</strong><br>
                <small>📁 העלה 2 קבצים: דוח אירועים + דוח נתונים מפורט/מרכז<br>
                ✅ זיהוי אוטומטי של קבצים | ✅ עמודות אירועים דינמיות | ✅ איחוד חכם של נתונים</small>
            </div>
        </div>
    `;
    
    const fileInput = document.getElementById('fileInput');
    if (fileInput && fileInput.parentElement) {
        fileInput.parentElement.insertBefore(helpText, fileInput);
        
        // הוסף תכונת העלאה מרובה
        fileInput.setAttribute('multiple', 'true');
        fileInput.setAttribute('accept', '.xlsx,.xls');
    }
    
    // בדוק גרסאות שמורות
    const versionsKey = `${STORAGE_PREFIX}versions`;
    const savedVersions = localStorage.getItem(versionsKey);
    if (savedVersions) {
        try {
            const versions = JSON.parse(savedVersions);
            const versionCount = Object.keys(versions).length;
            if (versionCount > 0) {
                addDataManagementButtons();
            }
        } catch (e) {
            localStorage.removeItem(versionsKey);
        }
    }
}); // שמירת מידע על הקובץ            systemData.uploadedFiles.push({
                name: file.name,
                type: fileType,
                rows: rows.length
           });
            
            // עיבוד לפי סוג
            if (fileType === 'events') {
                processEventsReport(rows);
            } else if (fileType === 'detailed' || fileType === 'summary') {
                processSummaryReport(rows, fileType);
            } else {
                console.warn(`⚠️ סוג קובץ לא ידוע: ${file.name}`);
            }
        }
        
        // איחוד הנתונים
        const mergedData = mergeDataSources();
        
        // הכנת נתונים לתצוגה
        allEmployees = mergedData;
        mappedData = createDisplayData(mergedData);
        columns = Object.keys(mappedData[0] || {});
        visibleColumns = [...columns];
        
        // עדכון תצוגה
        showStatus('success', `✅ עיבוד הושלם בהצלחה! 
        נמצאו ${mergedData.length} עובדים עם ${systemData.dynamicColumns.length} סוגי אירועים`);
        showReportPeriod();
        showColumnsToggle();
        displayTable();
        
        // הצגת סיכום קבצים
        showFileSummary();
        
        // שמירה אוטומטית
        savePersistentData('processed', {
            mappedData: mappedData,
            originalData: allEmployees,
            systemData: systemData
        });
        
        console.log('✅ עיבוד מתקדם הושלם בהצלחה!');
        
    } catch (error) {
        console.error('❌ שגיאה בעיבוד מתקדם:', error);
        showStatus('error', `שגיאה: ${error.message}`);
    }
}

// עיבוד דוח האירועים
function processEventsReport(rows) {
    console.log('🎯 מעבד דוח אירועים מרכזי...');
    
    if (!rows || rows.length < 2) {
        throw new Error('דוח אירועים ריק או לא תקין');
    }
    
    const headers = rows[0];
    const eventColumns = [];
    
    // זיהוי דינמי של עמודות אירועים - ללא הגבלות!
    headers.forEach((header, index) => {
        if (index > 3 && header && typeof header === 'string' && header.trim() !== '') {
            const cleanEventName = normalizeEventName(header.trim());
            
            eventColumns.push({
                name: header.trim(),           // השם המקורי מהקובץ
                index: index,
                hebrewName: cleanEventName,    // השם הנקי (ללא הגבלות)
                category: categorizeEvent(cleanEventName)  // קטגוריה לסטטיסטיקות
            });
        }
    });
    
    console.log('📋 עמודות אירועים שזוהו (דינמי):');
    eventColumns.forEach(col => {
        console.log(`  - "${col.name}" → "${col.hebrewName}" (קטגוריה: ${col.category})`);
    });
    
    // עיבוד נתוני עובדים
    const eventsData = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[0]) continue;
        
        const employee = {
            name: String(row[0] || '').trim(),
            department: String(row[1] || 'לא ידוע').trim(),
            code: String(row[2] || '').trim(),
            id: String(row[3] || '').trim(),
            events: {}
        };
        
        if (!employee.name) continue;
        
        // חילוץ אירועים דינמי
        eventColumns.forEach(col => {
            const value = parseFloat(row[col.index]) || 0;
            if (value > 0) {
                employee.events[col.hebrewName] = value;
            }
        });
        
        eventsData.push(employee);
    }
    
    systemData.eventsData = eventsData;
    systemData.dynamicColumns = eventColumns;
    
    console.log(`✅ עובדו ${eventsData.length} עובדים עם ${eventColumns.length} סוגי אירועים`);
}

// נירמול שמות אירועים - דינמי ללא הגבלות
function normalizeEventName(eventName) {
    if (!eventName || typeof eventName !== 'string') {
        return 'לא ידוע';
    }
    
    // ניקוי בסיסי של השם
    let cleanName = eventName.trim();
    
    // הסרת תווים מיותרים (אם יש)
    cleanName = cleanName.replace(/[^\u0590-\u05FF\u0020\u002D\u0027]/g, ''); // השאר רק עברית, רווח, מקף וגרש
    
    // תיקון רווחים כפולים
    cleanName = cleanName.replace(/\s+/g, ' ').trim();
    
    // אם השם ריק אחרי הניקוי
    if (!cleanName) {
        return 'אירוע לא ידוע';
    }
    
    // החזר את השם הנקי - ללא שינוי או הגבלה!
    return cleanName;
}

// פונקציה חדשה: זיהוי קטגוריות אירועים (אופציונלי לסטטיסטיקות)
function categorizeEvent(eventName) {
    const cleanName = eventName.toLowerCase();
    
    // קטגוריות רחבות לסטטיסטיקות (לא משפיע על הנתונים!)
    if (cleanName.includes('חג') || cleanName.includes('ערב')) {
        return 'חגים';
    } else if (cleanName.includes('חופש') || cleanName.includes('נופש')) {
        return 'חופשות';
    } else if (cleanName.includes('מחלה') || cleanName.includes('רפואי')) {
        return 'רפואי';
    } else if (cleanName.includes('מילואים') || cleanName.includes('צבא')) {
        return 'שירות';
    } else if (cleanName.includes('לידה') || cleanName.includes('הורות')) {
        return 'הורות';
    } else if (cleanName.includes('אבל') || cleanName.includes('שכול')) {
        return 'אבל';
    } else {
        return 'אחר';
    }
}

// עיבוד דוח מרכז/מפורט
function processSummaryReport(rows, fileType) {
    console.log(`📊 מעבד דוח ${fileType}...`);
    
    if (!rows || rows.length < 2) {
        throw new Error(`דוח ${fileType} ריק או לא תקין`);
    }
    
    // חיפוש שורת הכותרות
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
        const row = rows[i];
        if (row && Array.isArray(row) && row.some(cell => 
            String(cell || '').includes('שם עובד') || 
            String(cell || '').includes('קוד עובד')
        )) {
            headerRowIndex = i;
            break;
        }
    }
    
    if (headerRowIndex === -1) {
        throw new Error(`לא נמצאו כותרות בדוח ${fileType}`);
    }
    
    const headers = rows[headerRowIndex];
    const summaryData = [];
    
    // מיפוי עמודות
    const columnMap = {};
    headers.forEach((header, index) => {
        if (header && typeof header === 'string') {
            const cleanHeader = header.trim();
            columnMap[cleanHeader] = index;
        }
    });
    
    console.log('📋 עמודות שזוהו:', Object.keys(columnMap));
    
    // עיבוד נתוני עובדים
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[0] || typeof row[0] !== 'string') continue;
        
        const nameCell = String(row[0]).trim();
        
        // דלג על שורות סיכום ושורות ריקות
        if (!nameCell || nameCell.includes('סה"כ') || !isNaN(nameCell) || nameCell.length < 2) continue;
        
        const employee = {
            name: nameCell,
            code: getValue(row, columnMap, ['קוד עובד', 'מספר עובד']),
            department: getValue(row, columnMap, ['מחלקה']),
            payrollTag: getValue(row, columnMap, ['תג בשכר']),
            attendanceHours: parseFloat(getValue(row, columnMap, ['שעות נוכחות'])) || 0,
            standardHours: parseFloat(getValue(row, columnMap, ['שעות תקן'])) || 0,
            deficitHours: parseFloat(getValue(row, columnMap, ['שעות חוסר'])) || 0,
            overtimeHours: parseFloat(getValue(row, columnMap, ['נוספות', 'שעות נוספות'])) || 0,
            paidHours: parseFloat(getValue(row, columnMap, ['שעות משולמות'])) || 0,
            standardDays: parseFloat(getValue(row, columnMap, ['ימי תקן'])) || 0,
            attendanceDays: parseFloat(getValue(row, columnMap, ['ימי נוכחות'])) || 0,
            meals: parseFloat(getValue(row, columnMap, ['ארוחות'])) || 0
        };
        
        summaryData.push(employee);
    }
    
    systemData.summaryData = summaryData;
    console.log(`✅ עובדו ${summaryData.length} עובדים בדוח ${fileType}`);
}

// פונקציית עזר לחילוץ ערכים מעמודות
function getValue(row, columnMap, possibleNames) {
    for (const name of possibleNames) {
        if (columnMap.hasOwnProperty(name)) {
            const value = row[columnMap[name]];
            return value !== undefined && value !== null ? String(value).trim() : '';
        }
    }
    return '';
}

// איחוד מקורות הנתונים
function mergeDataSources() {
    console.log('🔗 מאחד מקורות נתונים...');
    
    const mergedEmployees = [];
    const processedNames = new Set();
    
    // התחל עם נתוני האירועים (העיקריים)
    systemData.eventsData.forEach(eventsEmp => {
        if (processedNames.has(eventsEmp.name)) return;
        
        // חפש נתונים תואמים בדוח המרכז
        const summaryEmp = systemData.summaryData.find(s => 
            s.name === eventsEmp.name || s.code === eventsEmp.code
        );
        
        // צור עובד מאוחד
        const mergedEmployee = {
            name: eventsEmp.name,
            code: eventsEmp.code || (summaryEmp ? summaryEmp.code : ''),
            department: eventsEmp.department || (summaryEmp ? summaryEmp.department : ''),
            id: eventsEmp.id || '',
            
            // נתוני אירועים
            events: eventsEmp.events || {},
            
            // נתונים מספריים
            attendanceHours: summaryEmp ? summaryEmp.attendanceHours : 0,
            standardHours: summaryEmp ? summaryEmp.standardHours : 0,
            deficitHours: summaryEmp ? summaryEmp.deficitHours : 0,
            overtimeHours: summaryEmp ? summaryEmp.overtimeHours : 0,
            paidHours: summaryEmp ? summaryEmp.paidHours : 0,
            standardDays: summaryEmp ? summaryEmp.standardDays : 0,
            attendanceDays: summaryEmp ? summaryEmp.attendanceDays : 0,
            meals: summaryEmp ? summaryEmp.meals : 0
        };
        
        mergedEmployees.push(mergedEmployee);
        processedNames.add(eventsEmp.name);
    });
    
    // הוסף עובדים שיש להם רק נתונים מספריים
    systemData.summaryData.forEach(summaryEmp => {
        if (!processedNames.has(summaryEmp.name)) {
            const mergedEmployee = {
                name: summaryEmp.name,
                code: summaryEmp.code,
                department: summaryEmp.department,
                id: '',
                events: {},
                ...summaryEmp
            };
            
            mergedEmployees.push(mergedEmployee);
            processedNames.add(summaryEmp.name);
        }
    });
    
    console.log(`✅ אוחדו ${mergedEmployees.length} עובדים`);
    return mergedEmployees;
}

// יצירת נתונים לתצוגה
function createDisplayData(employees) {
    console.log('🎨 יוצר נתונים לתצוגה...');
    
    // יצירת עמודות דינמיות
    const baseColumns = [
        { key: 'name', name: 'שם עובד' },
        { key: 'code', name: 'קוד עובד' },
        { key: 'department', name: 'מחלקה' },
        { key: 'attendanceHours', name: 'שעות נוכחות' },
        { key: 'standardHours', name: 'שעות תקן' },
        { key: 'deficitHours', name: 'שעות חוסר' },
        { key: 'overtimeHours', name: 'שעות נוספות' },
        { key: 'attendanceDays', name: 'ימי נוכחות' },
        { key: 'meals', name: 'ארוחות' }
    ];
    
    // הוסף עמודות אירועים דינמיות
    const eventColumns = systemData.dynamicColumns.map(col => ({
        key: `events.${col.hebrewName}`,
        name: col.hebrewName
    }));
    
    const allColumns = [...baseColumns, ...eventColumns];
    
    // יצירת נתוני תצוגה
    const displayData = employees.map(emp => {
        const displayEmp = {};
        
        allColumns.forEach(col => {
            const fieldPath = col.key;
            const hebrewName = col.name;
            
            if (fieldPath.startsWith('events.')) {
                const eventType = fieldPath.replace('events.', '');
                displayEmp[hebrewName] = emp.events[eventType] || 0;
            } else {
                displayEmp[hebrewName] = emp[fieldPath] || 0;
            }
        });
        
        return displayEmp;
    });
    
    return displayData;
}

// הצגת סיכום קבצים
function showFileSummary() {
    const summaryHTML = `
        <div class="files-summary" style="margin: 15px 0; padding: 10px; background: #f8f9fa; border-radius: 5px;">
            <h4>📁 קבצים שעובדו:</h4>
            ${systemData.uploadedFiles.map(file => `
                <div style="margin: 5px 0;">
                    <strong>${file.name}</strong> (${file.type}) - ${file.rows} שורות
                </div>
            `).join('')}
        </div>
    `;
    
    const statusMessage = document.getElementById('statusMessage');
    if (statusMessage) {
        statusMessage.innerHTML += summaryHTML;
    }
}

// פונקציית עזר לפרסור Excel
async function parseExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                resolve(rows);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// ========== UI FUNCTIONS ==========

function showReportPeriod() {
    let area = document.getElementById('reportPeriodArea');
    if (!area) {
        area = document.createElement('div');
        area.id = 'reportPeriodArea';
        area.className = 'report-period-area';
        const mainCard = document.querySelector('.main-card-centered');
        const title = document.querySelector('.main-card-title');
        if (mainCard && title) {
            mainCard.insertBefore(area, title.nextSibling);
        }
    }
    area.innerHTML = reportPeriod ? 
        `<div class="period-display">📅 תקופת הדוח: <strong>${reportPeriod}</strong></div>` : '';
}

function showColumnsToggle() {
    let toggleArea = document.getElementById('columnsToggleArea');
    if (!toggleArea) {
        toggleArea = document.createElement('div');
        toggleArea.id = 'columnsToggleArea';
        toggleArea.className = 'columns-toggle-area';
        const reportPeriod = document.getElementById('reportPeriodArea');
        if (reportPeriod && reportPeriod.parentElement) {
            reportPeriod.parentElement.insertBefore(toggleArea, reportPeriod.nextSibling);
        }
    }
    
    const columnButtons = columns.map(col => {
        const isVisible = visibleColumns.includes(col);
        return `<button class="column-toggle ${isVisible ? 'active' : ''}" 
                       onclick="toggleColumn('${col}')">${col}</button>`;
    }).join('');
    
    toggleArea.innerHTML = `
        <div class="columns-header">
            <span>🔧 עמודות לתצוגה:</span>
            <button onclick="toggleAllColumns()" class="btn btn-small">הכל/כלום</button>
        </div>
        <div class="columns-buttons">${columnButtons}</div>
    `;
}

function toggleColumn(columnName) {
    const index = visibleColumns.indexOf(columnName);
    if (index > -1) {
        visibleColumns.splice(index, 1);
    } else {
        visibleColumns.push(columnName);
    }
    showColumnsToggle();
    displayTable();
}

function toggleAllColumns() {
    if (visibleColumns.length === columns.length) {
        visibleColumns = ['שם עובד', 'מחלקה', 'קוד עובד'];
    } else {
        visibleColumns = [...columns];
    }
    showColumnsToggle();
    displayTable();
}

function displayTable() {
    const tableContainer = document.getElementById('dataTable');
    if (!tableContainer || mappedData.length === 0) return;
    
    // סינון הנתונים לעמודות הנראות
    const visibleData = mappedData.map(row => {
        const filteredRow = {};
        visibleColumns.forEach(col => {
            filteredRow[col] = row[col] || 0;
        });
        return filteredRow;
    });
    
    // יצירת הטבלה
    let tableHTML = `
        <div class="table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        ${visibleColumns.map(col => 
                            `<th onclick="sortTable('${col}')" class="sortable">
                                ${col} ${sortColumn === col ? (sortDirection > 0 ? '↑' : '↓') : ''}
                            </th>`
                        ).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${visibleData.map(row => `
                        <tr>
                            ${visibleColumns.map(col => `<td>${row[col]}</td>`).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    tableContainer.innerHTML = tableHTML;
    
    // עדכון כפתור הייצוא
    updateExportButton();
}

function sortTable(column) {
    if (sortColumn === column) {
        sortDirection *= -1;
    } else {
        sortColumn = column;
        sortDirection = 1;
    }
    
    mappedData.sort((a, b) => {
        let aVal = a[column] || 0;
        let bVal = b[column] || 0;
        
        if (typeof aVal === 'string') {
            return sortDirection * aVal.localeCompare(bVal, 'he');
        } else {
            return sortDirection * (aVal - bVal);
        }
    });
    
    displayTable();
}

function updateExportButton() {
    let exportBtn = document.getElementById('exportExcelBtn');
    if (!exportBtn) {
        exportBtn = document.createElement('button');
        exportBtn.id = 'exportExcelBtn';
        exportBtn.className = 'btn btn-primary export-btn';
        exportBtn.onclick = exportAdvancedExcel;
        
        const tableContainer = document.getElementById('dataTable');
        if (tableContainer && tableContainer.parentElement) {
            tableContainer.parentElement.insertBefore(exportBtn, tableContainer);
        }
    }
    
    exportBtn.innerHTML = `📥 ייצא לאקסל (${mappedData.length} עובדים)`;
    exportBtn.disabled = mappedData.length === 0;
}

// ========== EXPORT FUNCTIONS ==========

function exportAdvancedExcel() {
    if (mappedData.length === 0) {
        showStatus('error', 'אין נתונים לייצוא');
        return;
    }
    
    try {
        const wb = XLSX.utils.book_new();
        
        // גיליון 1 - נתונים מרוכזים
        const ws1 = createMappedDataSheet();
        XLSX.utils.book_append_sheet(wb, ws1, 'נתונים מרוכזים');
        
        // גיליון 2 - פירוט אירועים
        const ws2 = createDetailedDataSheet();
        XLSX.utils.book_append_sheet(wb, ws2, 'פירוט אירועים');
        
        // גיליון 3 - סטטיסטיקות
        const ws3 = createStatisticsSheet();
        XLSX.utils.book_append_sheet(wb, ws3, 'סטטיסטיקות');
        
        // שמירת הקובץ
        const fileName = `מקאנו_מתקדם_${reportPeriod || new Date().toISOString().slice(0,10)}.xlsx`;
        XLSX.writeFile(wb, fileName);
        
        showStatus('success', `✅ הקובץ יוצא בהצלחה: ${fileName}`);
        
    } catch (error) {
        console.error('❌ שגיאה בייצוא:', error);
        showStatus('error', `שגיאה בייצוא: ${error.message}`);
    }
}