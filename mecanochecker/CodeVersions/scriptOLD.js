let allEmployees = [];
let columns = [];
let visibleColumns = [];
let sortColumn = null;
let sortDirection = 1;
let reportPeriod = "";
let mappedData = [];
let correctionsLog = [];
let unmappedColumns = [];

// תצורת חודשים דינמית
const monthlyConfig = {
    "2025-05": { maxWorkDays: 21, holidays: ['2025-05-01'] },
    "2025-06": { maxWorkDays: 22, holidays: ['2025-06-12'] },
    "2025-07": { maxWorkDays: 21, holidays: [] }
};

// חגי פנדה טק 2025
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

// מיפוי 23 כותרות מקאנו ← → תלוש (בעברית!)
const columnMapping = {
    'שם עובד': 'employeeName',
    'קוד עובד': 'employeeCode', 
    'מחלקה': 'department',
    'ימי תקן': 'workDays',
    'ימי נוכחות': 'attendanceDays',
    'ימי ו\'+ש\'': 'weekendDays',
    'חג': 'holidayDays',
    'חופש': 'vacationDays',
    'חופשה מרוכזת': 'concentratedVacation',
    'מחלה': 'sickDays',
    'מחלה לתשלום': 'paidSickDays',
    'מילואים': 'reservesDays',
    'ימים משולמים': 'paidDays',
    'חישוב כמות לשווי ארוחות': 'mealEligibleDays',
    'חריג-לשווי ארוחות': 'mealExceptions',
    'שעות משולמות': 'paidHours',
    '100%': 'regularHours',
    '125%': 'overtime125',
    '150%': 'overtime150',
    'נוספות': 'totalOvertime',
    'שעות חוסר': 'hoursDeficit',
    'הפסקה': 'breakHours',
    'תג בשכר': 'payrollTag'
};

// מיפוי הפוך - מאנגלית לעברית
const reverseColumnMapping = {};
Object.entries(columnMapping).forEach(([hebrew, english]) => {
    reverseColumnMapping[english] = hebrew;
});

// --- קריאה מהקובץ ---
document.getElementById('fileInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    showStatus('info', `<div class="loading"></div> טוען קובץ מקאנו פרטני לעובדים...`);
    
    setTimeout(() => {
        readExcel(file);
    }, 300);
});

function readExcel(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            
            // עיבוד נתוני מקאנו (מבנה עובדים פרטניים)
            processMecanoData(rows);
            
            // מיפוי נתונים ל-23 כותרות
            mapDataToStandardColumns();
            
            // הצגת תוצאות
            showStatus('success', `הקובץ נטען בהצלחה! נמצאו ${allEmployees.length} עובדים`);
            showReportPeriod();
            showColumnsToggle();
            displayTable();
            
        } catch (error) {
            showStatus('error', `שגיאה בקריאת הקובץ: ${error.message}`);
            console.error('שגיאה מפורטת:', error);
        }
    };
    reader.readAsArrayBuffer(file);
}

function processMecanoData(rows) {
    console.log('🔍 מעבד קובץ מקאנו פרטני לעובדים...');
    
    allEmployees = [];
    let currentEmployee = null;
    reportPeriod = "";
    
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        
        const firstCell = String(row[0] || '').trim();
        
        // זיהוי תחילת עובד חדש
        if (isEmployeeStartLine(firstCell, row)) {
            // שמור את העובד הקודם
            if (currentEmployee) {
                finalizeEmployee(currentEmployee);
                allEmployees.push(currentEmployee);
            }
            
            // התחל עובד חדש
            currentEmployee = {
                name: firstCell,
                department: row[7] || 'לא ידוע',
                period: rows[i + 1] ? String(rows[i + 1][0] || '') : '',
                employeeCode: rows[i + 1] ? String(rows[i + 1][5] || '') : '',
                dailyData: [],
                summary: {},
                events: {},
                hoursCalculation: {}
            };
            
            // שמור את תקופת הדוח מהעובד הראשון
            if (!reportPeriod && currentEmployee.period) {
                reportPeriod = currentEmployee.period;
            }
        }
        
        // אסוף נתונים יומיים (שורות עם תאריכים)
        if (currentEmployee && isDailyDataLine(firstCell)) {
            currentEmployee.dailyData.push({
                date: firstCell,
                type: row[1] || '',
                entry: row[2] || null,
                exit: row[3] || null,
                totalHours: parseFloat(row[4]) || 0,
                break: parseFloat(row[5]) || 0,
                paidHours: parseFloat(row[6]) || 0,
                standard: row[7] || '',
                deficit: parseFloat(row[8]) || 0,
                regularHours: parseFloat(row[9]) || 0,
                overtime125: parseFloat(row[10]) || 0,
                overtime150: parseFloat(row[11]) || 0
            });
        }
        
        // אסוף נתוני סיכום
        if (currentEmployee && isSummaryLine(firstCell)) {
            const value = parseNumericValue(row[2]) || parseNumericValue(row[1]) || 0;
            currentEmployee.summary[firstCell] = value;
        }
        
        // אסוף נתוני אירועים (חופש, מחלה וכו')
        if (currentEmployee && isEventLine(firstCell)) {
            const value = parseNumericValue(row[2]) || parseNumericValue(row[1]) || 0;
            currentEmployee.events[firstCell] = value;
        }
        
        // אסוף נתוני שעות לחישוב
        if (currentEmployee && isHoursCalculationLine(firstCell)) {
            const value = parseNumericValue(row[2]) || parseNumericValue(row[1]) || 0;
            currentEmployee.hoursCalculation[firstCell] = value;
        }
    }
    
    // שמור את העובד האחרון
    if (currentEmployee) {
        finalizeEmployee(currentEmployee);
        allEmployees.push(currentEmployee);
    }
    
    console.log(`✅ נמצאו ${allEmployees.length} עובדים תקינים`);
    
    // בדוק שיש עובדים
    if (allEmployees.length === 0) {
        throw new Error("לא נמצאו עובדים תקינים בקובץ מקאנו");
    }
    
    // הגדר כותרות לטבלה (בעברית!)
    columns = Object.keys(columnMapping);
    visibleColumns = [...columns];
    
    console.log('👤 דוגמה לעובד:', allEmployees[0]);
}

function isEmployeeStartLine(firstCell, row) {
    // בדוק אם זו שורת תחילת עובד
    if (!firstCell || firstCell.length < 3) return false;
    if (firstCell.includes('-') || firstCell.includes('תאריך')) return false;
    if (firstCell.includes('סיכום') || firstCell.includes('.')) return false;
    if (firstCell.match(/^\d/)) return false;
    if (firstCell.includes('ימי') || firstCell.includes('שעות')) return false;
    if (firstCell.includes('הצגת') || firstCell.includes('חישוב')) return false;
    if (firstCell === 'איחור' || firstCell === 'נסיעות') return false;
    
    // וודא שיש מחלקה בעמודה 8
    const department = row[7];
    if (department && (department.includes('מל"מ') || department.includes('משרד') || 
                      department.includes('רפאל') || department.includes('רוה"מ') || 
                      department.includes('קבלני'))) {
        return true;
    }
    
    return false;
}

function isDailyDataLine(firstCell) {
    // בדוק אם זו שורת נתונים יומית (פורמט: "א - 01")
    return firstCell.match(/^[א-ש] - \d{2}$/);
}

function isSummaryLine(firstCell) {
    // בדוק אם זו שורת סיכום
    const summaryPatterns = [
        'ימי נוכחות', 'ימי תקן', 'שעות נוכחות', 'שעות תקן', 
        'שעות משולמות', 'שעות חוסר', 'איחור'
    ];
    return summaryPatterns.some(pattern => firstCell.includes(pattern));
}

function isEventLine(firstCell) {
    // בדוק אם זו שורת אירוע (חופש, מחלה וכו')
    const eventPatterns = [
        'חופש', 'מחלה', 'מילואים', 'חופשה מרוכזת'
    ];
    return eventPatterns.some(pattern => firstCell.includes(pattern));
}

function isHoursCalculationLine(firstCell) {
    // בדוק אם זו שורת חישוב שעות
    const hoursPatterns = [
        '100%', '125%', '150%', 'הפסקה'
    ];
    return hoursPatterns.some(pattern => firstCell.includes(pattern));
}

function parseNumericValue(value) {
    // המר ערך למספר
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const cleaned = value.replace(/[,\s]/g, '');
        const num = parseFloat(cleaned);
        return isNaN(num) ? 0 : num;
    }
    return 0;
}

function finalizeEmployee(employee) {
    // השלם חישובים עבור העובד
    
    // חישוב ימי סופ"ש עם עבודה
    employee.weekendWorkDays = employee.dailyData.filter(day => 
        (day.date.startsWith('ו -') || day.date.startsWith('ש -')) && day.paidHours > 0
    ).length;
    
    // חישוב ימי חג
    employee.holidayDays = employee.dailyData.filter(day => 
        day.type === 'חג'
    ).length;
    
    // חישוב ימי עבודה בפועל לארוחות (רק ימים א'-ה' עם נוכחות)
    employee.actualWorkDays = employee.dailyData.filter(day => 
        day.type === 'יום חול' && day.entry && day.exit &&
        !day.date.startsWith('ו -') && !day.date.startsWith('ש -')
    ).length;
    
    // חישוב סה"כ שעות נוספות מהנתונים היומיים
    employee.totalOvertime125 = employee.dailyData.reduce((sum, day) => sum + (day.overtime125 || 0), 0);
    employee.totalOvertime150 = employee.dailyData.reduce((sum, day) => sum + (day.overtime150 || 0), 0);
    
    // זיהוי חריגים
    employee.exceptions = [];
    if (employee.name.includes('יורם שלמה')) {
        employee.exceptions.push('ללא ארוחות + אשל');
    }
    
    // זיהוי עובדים שלא מילאו דו"ח
    if (employee.actualWorkDays === 0 && employee.summary['ימי נוכחות'] === 0) {
        employee.exceptions.push('לא מילא דו"ח שעות');
    }
    
    // בדיקת תקינות
    if (!employee.summary['ימי נוכחות']) {
        employee.exceptions.push('חסרים נתוני נוכחות');
    }
}

function mapDataToStandardColumns() {
    mappedData = [];
    correctionsLog = [];
    
    allEmployees.forEach(emp => {
        let mappedEmp = {};
        
        // מיפוי בסיסי
        mappedEmp['שם עובד'] = emp.name;
        mappedEmp['קוד עובד'] = emp.employeeCode;
        mappedEmp['מחלקה'] = emp.department;
        
        // נתוני נוכחות
        mappedEmp['ימי נוכחות'] = emp.summary['ימי נוכחות'] || 0;
        mappedEmp['שעות משולמות'] = emp.summary['שעות משולמות'] || 0;
        mappedEmp['שעות חוסר'] = emp.summary['שעות חוסר'] || 0;
        
        // חישובים מתקדמים
        mappedEmp['ימי תקן'] = calculateWorkDays(emp);
        mappedEmp['ימי ו\'+ש\''] = emp.weekendWorkDays;
        mappedEmp['חג'] = emp.holidayDays;
        
        // ארוחות
        mappedEmp['חישוב כמות לשווי ארוחות'] = emp.actualWorkDays;
        mappedEmp['חריג-לשווי ארוחות'] = emp.exceptions.join('; ');
        
        // אירועים - מהנתונים המפורטים בקובץ
        mappedEmp['חופש'] = extractEventDays(emp, 'חופש');
        mappedEmp['מחלה'] = extractEventDays(emp, 'מחלה');
        mappedEmp['מחלה לתשלום'] = extractEventDays(emp, 'מחלה לתשלום');
        mappedEmp['מילואים'] = extractEventDays(emp, 'מילואים');
        mappedEmp['חופשה מרוכזת'] = extractEventDays(emp, 'חופשה מרוכזת');
        
        // שעות - מחושבות מהנתונים היומיים
        mappedEmp['100%'] = emp.hoursCalculation['100%'] || calculateRegularHours(emp);
        mappedEmp['125%'] = emp.hoursCalculation['125%'] || emp.totalOvertime125;
        mappedEmp['150%'] = emp.hoursCalculation['150%'] || emp.totalOvertime150;
        mappedEmp['נוספות'] = mappedEmp['125%'] + mappedEmp['150%'];
        
        // הפסקות
        mappedEmp['הפסקה'] = emp.hoursCalculation['הפסקה'] || calculateBreakHours(emp);
        
        // ימים משולמים = ימי תקן
        mappedEmp['ימים משולמים'] = mappedEmp['ימי תקן'];
        
        // תג בשכר (יתמלא במיפוי מול תלוש)
        mappedEmp['תג בשכר'] = emp.employeeCode;
        
        mappedData.push(mappedEmp);
    });
    
    // זיהוי כותרות לא מומפות
    identifyUnmappedColumns();
}

function extractEventDays(emp, eventType) {
    // חלץ ימי אירוע מהבלוק "הצגת אירועים" או מהנתונים היומיים
    if (emp.events[eventType]) {
        return emp.events[eventType];
    }
    
    // חפש בנתונים היומיים
    let count = 0;
    emp.dailyData.forEach(day => {
        if (day.type === 'יום חול' && !day.entry && !day.exit) {
            // יום ריק - בדוק אם יש הערה של האירוע
            // כרגע נניח שזה לא אירוע אלא חוסר נתונים
        }
    });
    
    return count;
}

function calculateRegularHours(emp) {
    // חשב שעות רגילות מהנתונים היומיים
    return emp.dailyData.reduce((sum, day) => sum + (day.regularHours || 0), 0);
}

function calculateWorkDays(emp) {
    // חישוב ימי תקן: נוכחות + חג + היעדרויות משולמות
    let workDays = emp.summary['ימי נוכחות'] || 0;
    workDays += emp.holidayDays; // ימי חג
    workDays += emp.weekendWorkDays; // ימי סופ"ש עם עבודה
    workDays += extractEventDays(emp, 'חופש');
    workDays += extractEventDays(emp, 'חופשה מרוכזת');
    workDays += extractEventDays(emp, 'מחלה לתשלום');
    workDays += extractEventDays(emp, 'מילואים');
    
    return workDays;
}

function calculateBreakHours(emp) {
    // חישוב הפסקות: 0.5 שעות לכל יום מעל 6 שעות
    let totalBreaks = 0;
    emp.dailyData.forEach(day => {
        if (day.type === 'יום חול' && day.paidHours > 6) {
            totalBreaks += 0.5;
        }
    });
    return totalBreaks;
}

function identifyUnmappedColumns() {
    unmappedColumns = [];
    
    // בדוק אם יש נתונים נוספים שלא מופו
    const additionalFields = [];
    
    allEmployees.forEach(emp => {
        Object.keys(emp.summary).forEach(key => {
            if (!columns.includes(key) && !additionalFields.includes(key)) {
                additionalFields.push(key);
            }
        });
        Object.keys(emp.events).forEach(key => {
            if (!columns.includes(key) && !additionalFields.includes(key)) {
                additionalFields.push(key);
            }
        });
    });
    
    additionalFields.forEach(field => {
        const employeeCount = allEmployees.filter(emp => 
            (emp.summary[field] && emp.summary[field] !== 0) || 
            (emp.events[field] && emp.events[field] !== 0)
        ).length;
        
        if (employeeCount > 0) {
            unmappedColumns.push({
                name: field,
                employeeCount: employeeCount
            });
        }
    });
    
    if (unmappedColumns.length > 0) {
        console.warn('⚠️ נמצאו שדות נוספים:', unmappedColumns);
        showUnmappedColumnsAlert();
    }
}

function showUnmappedColumnsAlert() {
    const alertHTML = `
        <div class="alert info" style="margin: 15px 0;">
            <strong>⚠️ נמצאו שדות נוספים במקאנו:</strong><br>
            ${unmappedColumns.map(col => `• "${col.name}" (${col.employeeCount} עובדים)`).join('<br>')}
            <br><br>
            <button onclick="handleUnmappedColumns('copy')" class="btn btn-secondary">כלול בדוח</button>
            <button onclick="handleUnmappedColumns('skip')" class="btn btn-secondary">דלג</button>
        </div>
    `;
    const statusMessage = document.getElementById('statusMessage');
    if (statusMessage) {
        statusMessage.innerHTML += alertHTML;
    }
}

function handleUnmappedColumns(action) {
    if (action === 'copy') {
        // הוסף את השדות הנוספים למיפוי
        unmappedColumns.forEach(col => {
            columnMapping[col.name] = col.name.replace(/\s+/g, '_');
        });
        showStatus('info', '✅ שדות נוספים נכללו בדוח');
    } else if (action === 'skip') {
        showStatus('info', '⚠️ שדות נוספים דולגו');
    }
    // רענן את הטבלה
    displayTable();
}

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
    area.innerHTML = reportPeriod ? `<b>תקופת הדוח:</b> ${reportPeriod}` : '';
}

function showColumnsToggle() {
    const section = document.getElementById('columnsToggleSection');
    if (section) {
        section.style.display = 'block';
        const list = document.getElementById('columnsToggleList');
        if (list) {
            list.innerHTML = '';
            
            // הצגת 23 הכותרות הממופות בעברית
            Object.keys(columnMapping).forEach(col => {
                const label = document.createElement('label');
                label.innerHTML = `<input type="checkbox" value="${col}" checked> ${col}`;
                label.querySelector('input').addEventListener('change', (e) => {
                    if (e.target.checked) {
                        if (!visibleColumns.includes(col)) {
                            visibleColumns.push(col);
                        }
                    } else {
                        visibleColumns = visibleColumns.filter(c => c !== col);
                    }
                    displayTable();
                });
                list.appendChild(label);
            });
            
            visibleColumns = Object.keys(columnMapping);
        }
    }
}

function displayTable() {
    const section = document.getElementById('tableSection');
    if (section) {
        section.style.display = 'block';
        const table = document.getElementById('dataTable');
        if (table) {
            const thead = table.querySelector('thead');
            const tbody = table.querySelector('tbody');
            
            // HEADER בעברית
            let headerHTML = '<tr>';
            visibleColumns.forEach(col => {
                headerHTML += `<th>
                    <button class="sort-button${sortColumn===col?' sort-active':''}" onclick="sortByColumn('${col}')">
                        ${col}
                        <span class="sort-arrow">${sortColumn===col ? (sortDirection===1?'▲':'▼') : ''}</span>
                    </button>
                </th>`;
            });
            headerHTML += '</tr>';
            thead.innerHTML = headerHTML;
            
            // BODY - נתונים ממופים
            tbody.innerHTML = '';
            mappedData.forEach(emp => {
                let row = '<tr>';
                visibleColumns.forEach(col => {
                    let val = emp[col];
                    if (val === undefined || val === null || val === "") val = 0;
                    if (typeof val === "string" && !isNaN(val) && val !== "") val = Number(val);
                    row += `<td>${val}</td>`;
                });
                row += '</tr>';
                tbody.innerHTML += row;
            });
        }
    }
}

window.sortByColumn = function(col) {
    if (sortColumn === col) {
        sortDirection *= -1;
    } else {
        sortColumn = col;
        sortDirection = 1;
    }
    
    mappedData.sort((a, b) => {
        let aVal = a[col];
        let bVal = b[col];
        if (aVal === undefined || aVal === null || aVal === "") aVal = 0;
        if (bVal === undefined || bVal === null || bVal === "") bVal = 0;
        if (!isNaN(aVal) && !isNaN(bVal)) {
            return (Number(aVal) - Number(bVal)) * sortDirection;
        }
        return String(aVal ?? '').localeCompare(String(bVal ?? ''), 'he') * sortDirection;
    });
    displayTable();
}

// ייצוא Excel מתקדם
document.getElementById('exportExcelBtn').addEventListener('click', function() {
    exportAdvancedExcel();
});

function exportAdvancedExcel() {
    const wb = XLSX.utils.book_new();
    
    // גיליון 1: נתונים מומפים (בעברית!)
    const mappedSheet = createMappedDataSheet();
    XLSX.utils.book_append_sheet(wb, mappedSheet, "נתונים מומפים");
    
    // גיליון 2: דוח מפורט
    const detailedSheet = createDetailedDataSheet();
    XLSX.utils.book_append_sheet(wb, detailedSheet, "נתונים מפורטים");
    
    // גיליון 3: מיפוי תלושים
    const payslipSheet = createPayslipMappingSheet();
    XLSX.utils.book_append_sheet(wb, payslipSheet, "מיפוי תלושים");
    
    // גיליון 4: סטטיסטיקות
    const statsSheet = createStatisticsSheet();
    XLSX.utils.book_append_sheet(wb, statsSheet, "סטטיסטיקות");
    
    // שם קובץ נכון עם התאריך מתקופת הדוח
    const reportDate = reportPeriod ? reportPeriod.replace(/[^\d]/g, '') : new Date().toISOString().slice(0,10).replace(/-/g, '');
    const fileName = `MecanoEmployeesDetailed_${reportDate}.xlsx`;
    
    XLSX.writeFile(wb, fileName);
    showStatus('success', `✅ ייצוא Excel הושלם בהצלחה! נשמר כ-${fileName}`);
}

function createMappedDataSheet() {
    const ws_data = [];
    
    // כותרת עם תקופת דוח
    if (reportPeriod) ws_data.push([`תקופת הדוח: ${reportPeriod}`]);
    ws_data.push([]); // שורה ריקה
    
    // כותרות 23 עמודות בעברית
    const headers = Object.keys(columnMapping);
    ws_data.push(headers);
    
    // נתונים ממופים
    mappedData.forEach(emp => {
        const row = headers.map(col => {
            let val = emp[col];
            if (val === undefined || val === null || val === "") val = 0;
            return val;
        });
        ws_data.push(row);
    });
    
    // הוספת כותרות לא מומפות (אם יש)
    if (unmappedColumns.length > 0) {
        ws_data.push([]);
        ws_data.push(['=== שדות נוספים שנמצאו ===']);
        unmappedColumns.forEach(col => {
            ws_data.push([col.name, `${col.employeeCount} עובדים`]);
        });
    }
    
    return XLSX.utils.aoa_to_sheet(ws_data);
}

function createDetailedDataSheet() {
    const ws_data = [
        ['דוח מפורט - כל העובדים'],
        [],
        ['שם עובד', 'מחלקה', 'קוד עובד', 'ימי נוכחות', 'שעות משולמות', 'שעות חוסר', 'ימי סופ"ש', 'חריגים']
    ];
    
    allEmployees.forEach(emp => {
        ws_data.push([
            emp.name,
            emp.department,
            emp.employeeCode,
            emp.summary['ימי נוכחות'] || 0,
            emp.summary['שעות משולמות'] || 0,
            emp.summary['שעות חוסר'] || 0,
            emp.weekendWorkDays,
            emp.exceptions.join('; ')
        ]);
    });
    
    return XLSX.utils.aoa_to_sheet(ws_data);
}

function createPayslipMappingSheet() {
    const ws_data = [
        ['מיפוי מקאנו ← → תלוש שכר'],
        ['להשלמה ידנית'],
        [],
        ['שדה מקאנו', 'שדה תלוש', 'הפרש', 'סטטוס', 'הערות']
    ];
    
    // template למילוי - בעברית
    Object.keys(columnMapping).forEach(mecanoField => {
        ws_data.push([mecanoField, '', '', 'ממתין למיפוי', '']);
    });
    
    return XLSX.utils.aoa_to_sheet(ws_data);
}

function createStatisticsSheet() {
    const ws_data = [
        ['סטטיסטיקות עיבוד קובץ מקאנו פרטני לעובדים'],
        [],
        ['סה"כ עובדים', allEmployees.length],
        ['תקופת דוח', reportPeriod],
        [],
        ['פילוח לפי מחלקות:']
    ];
    
    // פילוח לפי מחלקות
    const deptStats = {};
    allEmployees.forEach(emp => {
        const dept = emp.department || 'לא ידוע';
        deptStats[dept] = (deptStats[dept] || 0) + 1;
    });
    
    Object.entries(deptStats).forEach(([dept, count]) => {
        ws_data.push([dept, count]);
    });
    
    ws_data.push([]);
    ws_data.push(['עובדים עם חריגים:']);
    allEmployees.filter(emp => emp.exceptions.length > 0).forEach(emp => {
        ws_data.push([emp.name, emp.exceptions.join('; ')]);
    });
    
    ws_data.push([]);
    ws_data.push(['סיכום נתונים:']);
    ws_data.push(['עובדים עם נתוני נוכחות', allEmployees.filter(emp => emp.summary['ימי נוכחות'] > 0).length]);
    ws_data.push(['עובדים עם שעות חוסר', allEmployees.filter(emp => emp.summary['שעות חוסר'] > 0).length]);
    ws_data.push(['עובדים שעבדו בסופ"ש', allEmployees.filter(emp => emp.weekendWorkDays > 0).length]);
    
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
const STORAGE_PREFIX = 'pandatech_mecano_';

// שמירה קבועה עם ניהול גרסאות
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
            version: '3.0',
            fileName: `MecanoEmployeesDetailed_${periodKey}.xlsx`
        }
    };
    
    try {
        localStorage.setItem(storageKey, JSON.stringify(storageData));
        console.log(`✅ נשמר בהצלחה: ${storageKey}`);
        showStatus('info', `💾 נתונים נשמרו לזיכרון קבוע - ${dataType}`);
        
        // עדכון רשימת גרסאות
        updateVersionsList(storageKey, storageData.metadata);
        
        // הוסף כפתורי ניהול נתונים
        addDataManagementButtons();
        
    } catch (e) {
        console.error('❌ שגיאה בשמירה:', e);
        showStatus('error', 'שגיאה בשמירת נתונים לזיכרון');
    }
}

// טעינת נתונים קבועים
function loadPersistentData(period) {
    const periodKey = period.replace(/[^\w]/g, '_');
    const storageKey = `${STORAGE_PREFIX}processed_${periodKey}`;
    
    try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
            const data = JSON.parse(stored);
            return data;
        }
    } catch (e) {
        console.error('❌ שגיאה בטעינה:', e);
    }
    return null;
}

// ניהול גרסאות
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

// הצגת גרסאות זמינות
function showAvailableVersions() {
    const versionsKey = `${STORAGE_PREFIX}versions`;
    try {
        const stored = localStorage.getItem(versionsKey);
        if (stored) {
            const versions = JSON.parse(stored);
            console.log('📋 גרסאות זמינות:', versions);
            
            let versionsList = '<div class="versions-list"><h4>גרסאות שמורות:</h4>';
            Object.entries(versions).forEach(([key, meta]) => {
                const date = new Date(meta.savedAt).toLocaleDateString('he-IL');
                const time = new Date(meta.savedAt).toLocaleTimeString('he-IL');
                versionsList += `
                    <div class="version-item" style="margin: 10px 0; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                        <strong>${meta.reportPeriod || 'לא ידוע'}</strong> (${meta.employeeCount} עובדים)<br>
                        <small>נשמר: ${date} ${time}</small><br>
                        <button onclick="loadStoredVersion('${key}')" class="btn btn-secondary">טען גרסה</button>
                        <button onclick="deleteStoredVersion('${key}')" class="btn btn-secondary">מחק</button>
                        <button onclick="exportStoredVersion('${key}')" class="btn btn-secondary">ייצא לאקסל</button>
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

// טעינת גרסה שמורה
window.loadStoredVersion = function(key) {
    try {
        const stored = localStorage.getItem(key);
        if (stored) {
            const data = JSON.parse(stored);
            
            // שחזר את הנתונים
            allEmployees = data.data.originalData || [];
            mappedData = data.data.mappedData || [];
            correctionsLog = data.data.corrections || [];
            unmappedColumns = data.data.unmappedColumns || [];
            reportPeriod = data.metadata.reportPeriod || '';
            
            // עדכן את התצוגה
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

// מחיקת גרסה שמורה
window.deleteStoredVersion = function(key) {
    if (confirm('האם אתה בטוח שברצונך למחוק גרסה זו?')) {
        try {
            localStorage.removeItem(key);
            
            // עדכן רשימת גרסאות
            const versionsKey = `${STORAGE_PREFIX}versions`;
            const stored = localStorage.getItem(versionsKey);
            if (stored) {
                const versions = JSON.parse(stored);
                delete versions[key];
                localStorage.setItem(versionsKey, JSON.stringify(versions));
            }
            
            showStatus('success', '✅ הגרסה נמחקה בהצלחה');
            showAvailableVersions(); // רענן את הרשימה
        } catch (e) {
            console.error('❌ שגיאה במחיקה:', e);
            showStatus('error', 'שגיאה במחיקת הגרסה');
        }
    }
}

// ייצוא גרסה שמורה
window.exportStoredVersion = function(key) {
    try {
        const stored = localStorage.getItem(key);
        if (stored) {
            const data = JSON.parse(stored);
            
            // שחזר זמנית את הנתונים
            const tempMappedData = mappedData;
            const tempAllEmployees = allEmployees;
            const tempReportPeriod = reportPeriod;
            
            mappedData = data.data.mappedData || [];
            allEmployees = data.data.originalData || [];
            reportPeriod = data.metadata.reportPeriod || '';
            
            // ייצא
            exportAdvancedExcel();
            
            // החזר את הנתונים המקוריים
            mappedData = tempMappedData;
            allEmployees = tempAllEmployees;
            reportPeriod = tempReportPeriod;
        }
    } catch (e) {
        console.error('❌ שגיאה בייצוא גרסה:', e);
        showStatus('error', 'שגיאה בייצוא הגרסה');
    }
}

// הוספת כפתורי ניהול נתונים
function addDataManagementButtons() {
    const exportButton = document.getElementById('exportExcelBtn');
    if (exportButton && !document.getElementById('dataManagementButtons')) {
        const buttonsHTML = `
            <div id="dataManagementButtons" style="margin: 10px 0;">
                <button id="showVersionsBtn" class="btn btn-secondary" onclick="showAvailableVersions()">
                    📋 גרסאות שמורות
                </button>
                <button id="backupAllBtn" class="btn btn-secondary" onclick="backupAllData()">
                    💾 גיבוי מלא
                </button>
                <button id="clearStorageBtn" class="btn btn-secondary" onclick="clearAllStorage()">
                    🗑️ נקה זיכרון
                </button>
            </div>
        `;
        exportButton.parentElement.insertAdjacentHTML('beforeend', buttonsHTML);
    }
}

// גיבוי מלא
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

// ניקוי זיכרון
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

// שמירה אוטומטית לאחר עיבוד
function mapDataToStandardColumns() {
    mappedData = [];
    correctionsLog = [];
    
    allEmployees.forEach(emp => {
        let mappedEmp = {};
        
        // מיפוי בסיסי
        mappedEmp['שם עובד'] = emp.name;
        mappedEmp['קוד עובד'] = emp.employeeCode;
        mappedEmp['מחלקה'] = emp.department;
        
        // נתוני נוכחות
        mappedEmp['ימי נוכחות'] = emp.summary['ימי נוכחות'] || 0;
        mappedEmp['שעות משולמות'] = emp.summary['שעות משולמות'] || 0;
        mappedEmp['שעות חוסר'] = emp.summary['שעות חוסר'] || 0;
        
        // חישובים מתקדמים
        mappedEmp['ימי תקן'] = calculateWorkDays(emp);
        mappedEmp['ימי ו\'+ש\''] = emp.weekendWorkDays;
        mappedEmp['חג'] = emp.holidayDays;
        
        // ארוחות
        mappedEmp['חישוב כמות לשווי ארוחות'] = emp.actualWorkDays;
        mappedEmp['חריג-לשווי ארוחות'] = emp.exceptions.join('; ');
        
        // אירועים - מהנתונים המפורטים בקובץ
        mappedEmp['חופש'] = extractEventDays(emp, 'חופש');
        mappedEmp['מחלה'] = extractEventDays(emp, 'מחלה');
        mappedEmp['מחלה לתשלום'] = extractEventDays(emp, 'מחלה לתשלום');
        mappedEmp['מילואים'] = extractEventDays(emp, 'מילואים');
        mappedEmp['חופשה מרוכזת'] = extractEventDays(emp, 'חופשה מרוכזת');
        
        // שעות - מחושבות מהנתונים היומיים
        mappedEmp['100%'] = emp.hoursCalculation['100%'] || calculateRegularHours(emp);
        mappedEmp['125%'] = emp.hoursCalculation['125%'] || emp.totalOvertime125;
        mappedEmp['150%'] = emp.hoursCalculation['150%'] || emp.totalOvertime150;
        mappedEmp['נוספות'] = mappedEmp['125%'] + mappedEmp['150%'];
        
        // הפסקות
        mappedEmp['הפסקה'] = emp.hoursCalculation['הפסקה'] || calculateBreakHours(emp);
        
        // ימים משולמים = ימי תקן
        mappedEmp['ימים משולמים'] = mappedEmp['ימי תקן'];
        
        // תג בשכר (יתמלא במיפוי מול תלוש)
        mappedEmp['תג בשכר'] = emp.employeeCode;
        
        mappedData.push(mappedEmp);
    });
    
    // זיהוי כותרות לא מומפות
    identifyUnmappedColumns();
    
    // שמירה אוטומטית לאחר עיבוד
    savePersistentData('processed', {
        mappedData: mappedData,
        corrections: correctionsLog,
        unmappedColumns: unmappedColumns,
        originalData: allEmployees
    });
}

// טעינה אוטומטית בעת פתיחת הדף
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ מערכת עיבוד קובץ מקאנו פרטני לעובדים מוכנה');
    console.log('📋 MecanoEmployeesDetailed מכל גרסת מקאנו');
    
    // הוסף הודעת הסבר למשתמש
    const helpText = document.createElement('div');
    helpText.style.cssText = 'margin: 10px 0; padding: 10px; background: #f0f8ff; border-radius: 5px; font-size: 14px;';
    helpText.innerHTML = `
        <strong>📋 MecanoEmployeesDetailed מכל גרסת מקאנו</strong>
    `;
    
    const fileInput = document.getElementById('fileInput');
    if (fileInput && fileInput.parentElement) {
        fileInput.parentElement.insertBefore(helpText, fileInput);
    }
    
    // בדוק אם יש נתונים שמורים
    const versionsKey = `${STORAGE_PREFIX}versions`;
    const savedVersions = localStorage.getItem(versionsKey);
    if (savedVersions) {
        try {
            const versions = JSON.parse(savedVersions);
            const versionCount = Object.keys(versions).length;
            if (versionCount > 0) {
                showStatus('info', `💾 נמצאו ${versionCount} גרסאות שמורות - השתמש בכפתור "גרסאות שמורות"`);
                addDataManagementButtons();
            }
        } catch (e) {
            console.log('🔧 ניקוי נתונים פגומים בזיכרון');
            localStorage.removeItem(versionsKey);
        }
    }
});