// payroll-ui.js - UI interactions and display logic

// Initialize on load
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    initializeDropZone();
});

// Setup event listeners
function setupEventListeners() {
    // File input
    document.getElementById('fileInput').addEventListener('change', handleFileSelect);
    
    // Drop zone
    const dropZone = document.getElementById('dropZone');
    dropZone.addEventListener('click', () => document.getElementById('fileInput').click());
    
    // Search and filter
    const searchInput = document.getElementById('searchEmployee');
    if (searchInput) {
        searchInput.addEventListener('input', filterEmployees);
    }
    
    const filterType = document.getElementById('filterType');
    if (filterType) {
        filterType.addEventListener('change', filterEmployees);
    }
}

// Initialize drag and drop
function initializeDropZone() {
    const dropZone = document.getElementById('dropZone');
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });
}

// Handle file selection
function handleFileSelect(e) {
    handleFiles(e.target.files);
}

// Handle files
function handleFiles(files) {
    Array.from(files).forEach(file => {
        const fileType = detectFileType(file.name);
        
        // Store file reference
        if (fileType === 'mecano') {
            uploadedFiles.mecano = file;
            updateFileGuide('check-mecano', true);
        } else if (fileType === 'payslips') {
            uploadedFiles.payslips = file;
            updateFileGuide('check-payslips', true);
        } else if (fileType === 'exceptions') {
            uploadedFiles.exceptions = file;
            updateFileGuide('check-exceptions', true);
        }
        
        // Add to file list display
        addFileToList(file, fileType);
    });
    
    // Enable start button if minimum files are uploaded
    checkReadyToAnalyze();
}

// Add file to display list
function addFileToList(file, fileType) {
    const fileList = document.getElementById('fileList');
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    
    const icon = getFileIcon(fileType);
    const size = (file.size / 1024).toFixed(2);
    
    fileItem.innerHTML = `
        <div class="file-info">
            <div class="file-icon">${icon}</div>
            <div>
                <div style="font-weight: 600;">${file.name}</div>
                <div style="font-size: 14px; color: #666;">${size} KB</div>
            </div>
        </div>
        <span class="file-status success">הועלה בהצלחה ✓</span>
    `;
    
    fileList.appendChild(fileItem);
}

// Get icon for file type
function getFileIcon(fileType) {
    const icons = {
        mecano: '📊',
        payslips: '💰',
        exceptions: '📋',
        mapping: '🔗',
        unknown: '📄'
    };
    return icons[fileType] || icons.unknown;
}

// Update file guide checkmarks
function updateFileGuide(checkId, checked) {
    const checkElement = document.getElementById(checkId);
    if (checkElement) {
        checkElement.textContent = checked ? '✅' : '⭕';
        checkElement.classList.toggle('checked', checked);
    }
}

// Check if ready to analyze
function checkReadyToAnalyze() {
    const startBtn = document.getElementById('startBtn');
    const hasMinimumFiles = uploadedFiles.mecano && 
                           (uploadedFiles.payslips || uploadedFiles.exceptions);
    
    startBtn.disabled = !hasMinimumFiles;
}

// Switch between tabs
function showTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = 'none';
    });
    
    // Show selected tab
    document.getElementById(`${tabName}-tab`).style.display = 'block';
    
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target.classList.add('active');
}

// Start analysis
async function startAnalysis() {
    if (!uploadedFiles.mecano) {
        alert('נא להעלות קובץ נוכחות ממקאנו');
        return;
    }
    
    // Switch to checks tab
    showTab('check');
    
    // Show loading state
    showChecksLoading();
    
    try {
        // Run analysis
        const results = await runPayrollAnalysis();
        
        // Display check results
        displayCheckResults(results.checks);
        
        // Update summary
        updateAnalysisSummary(results.summary);
        
        // Populate employee cards
        populateEmployeeCards(results.employees, results.issues);
        
        // Generate report
        generateReportSummary(results);
        
    } catch (error) {
        console.error('Analysis error:', error);
        alert('שגיאה בביצוע הבדיקה: ' + error.message);
    }
}

// Show loading state for checks
function showChecksLoading() {
    const checksGrid = document.getElementById('checksGrid');
    checksGrid.innerHTML = '<div class="loading-message">מבצע בדיקות אוטומטיות...</div>';
}

// Display check results
function displayCheckResults(checks) {
    const checksGrid = document.getElementById('checksGrid');
    checksGrid.innerHTML = '';
    
    let completedChecks = 0;
    
    checks.forEach((check, index) => {
        setTimeout(() => {
            const checkCard = createCheckCard(check);
            checksGrid.appendChild(checkCard);
            
            // Animate progress
            setTimeout(() => {
                const progressFill = checkCard.querySelector('.check-progress-fill');
                if (progressFill) {
                    progressFill.style.width = check.progress + '%';
                }
            }, 100);
            
            completedChecks++;
            updateMainProgress(completedChecks, checks.length);
            
        }, index * 500); // Stagger animations
    });
}

// Create check card element
function createCheckCard(check) {
    const card = document.createElement('div');
    card.className = `check-card ${check.status}`;
    
    const statusIcon = {
        pass: '✓',
        warning: '!',
        fail: '✗',
        running: '⟳'
    };
    
    card.innerHTML = `
        <div class="check-header">
            <span class="check-title">${check.name}</span>
            <div class="check-icon ${check.status}">${statusIcon[check.status]}</div>
        </div>
        <div class="check-details">${check.details}</div>
        <div class="check-progress">
            <div class="check-progress-fill ${check.status}" style="width: 0%"></div>
        </div>
    `;
    
    return card;
}

// Update main progress bar
function updateMainProgress(completed, total) {
    const percentage = (completed / total) * 100;
    document.getElementById('mainProgress').style.width = percentage + '%';
    document.getElementById('progressText').textContent = 
        percentage === 100 ? 'הבדיקה הושלמה!' : `${Math.round(percentage)}% הושלם`;
}

// Update analysis summary
function updateAnalysisSummary(summary) {
    document.getElementById('criticalCount').textContent = summary.criticalIssues;
    document.getElementById('warningCount').textContent = summary.warnings;
    document.getElementById('okCount').textContent = summary.passed;
    
    // Update report summary
    document.getElementById('totalEmployees').textContent = summary.totalEmployees;
    document.getElementById('totalIssues').textContent = 
        summary.criticalIssues + summary.warnings;
    document.getElementById('potentialSaving').textContent = 
        '₪' + summary.potentialSaving.toLocaleString();
    document.getElementById('timeSaved').textContent = 
        Math.round(summary.totalEmployees * 0.5) + ' שעות';
}

// Populate employee cards
function populateEmployeeCards(employees, issues) {
    const employeeGrid = document.getElementById('employeeGrid');
    employeeGrid.innerHTML = '';
    
    // Group issues by employee
    const issuesByEmployee = {};
    issues.forEach(issue => {
        if (!issuesByEmployee[issue.employee]) {
            issuesByEmployee[issue.employee] = [];
        }
        issuesByEmployee[issue.employee].push(issue);
    });
    
    // Create cards for employees with issues
    Object.entries(issuesByEmployee).forEach(([empName, empIssues]) => {
        const employee = employees.find(e => e.name === empName);
        if (employee) {
            const card = createEmployeeCard(employee, empIssues);
            employeeGrid.appendChild(card);
        }
    });
}

// Create employee card
function createEmployeeCard(employee, issues) {
    const card = document.createElement('div');
    card.className = 'employee-card';
    
    const severity = issues.some(i => i.type === 'error') ? 'error' : 'warning';
    const issueCount = issues.length;
    
    card.innerHTML = `
        <div class="employee-header">
            <span class="employee-name">${employee.name}</span>
            <span class="employee-status ${severity}">${issueCount} חריגות</span>
        </div>
        <div class="employee-stats">
            <div class="stat-item">
                <div class="stat-label">ימי עבודה</div>
                <div class="stat-value">${employee.workDays}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">שעות נוספות</div>
                <div class="stat-value">${employee.overtime125 + employee.overtime150}</div>
            </div>
        </div>
        <div class="anomaly-list">
            ${issues.slice(0, 3).map(issue => `
                <div class="anomaly-item">
                    <div class="anomaly-icon ${issue.type}">${issue.type === 'error' ? '✗' : '!'}</div>
                    <span>${issue.message}</span>
                </div>
            `).join('')}
        </div>
    `;
    
    card.addEventListener('click', () => showEmployeeDetails(employee, issues));
    
    return card;
}

// Show employee details modal
function showEmployeeDetails(employee, issues) {
    const modal = document.getElementById('employeeModal');
    const modalContent = document.getElementById('modalContent');
    
    modalContent.innerHTML = `
        <h2>${employee.name}</h2>
        <div class="employee-details">
            <h3>פרטי העובד</h3>
            <table class="details-table">
                <tr><td>קוד עובד:</td><td>${employee.code}</td></tr>
                <tr><td>ימי עבודה:</td><td>${employee.workDays}</td></tr>
                <tr><td>ימי חופש:</td><td>${employee.vacationDays}</td></tr>
                <tr><td>ימי מחלה:</td><td>${employee.sickDays}</td></tr>
                <tr><td>שעות רגילות:</td><td>${employee.workHours}</td></tr>
                <tr><td>שעות נוספות 125%:</td><td>${employee.overtime125}</td></tr>
                <tr><td>שעות נוספות 150%:</td><td>${employee.overtime150}</td></tr>
            </table>
            
            <h3>חריגות שנמצאו</h3>
            <div class="issues-list">
                ${issues.map(issue => `
                    <div class="issue-item ${issue.type}">
                        <strong>${issue.checkName}:</strong> ${issue.message}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
}

// Close modal
function closeModal() {
    document.getElementById('employeeModal').style.display = 'none';
}

// Filter employees
function filterEmployees() {
    const searchTerm = document.getElementById('searchEmployee').value.toLowerCase();
    const filterType = document.getElementById('filterType').value;
    
    const cards = document.querySelectorAll('.employee-card');
    
    cards.forEach(card => {
        const name = card.querySelector('.employee-name').textContent.toLowerCase();
        const status = card.querySelector('.employee-status').classList.contains('error') ? 
                      'critical' : 'warning';
        
        const matchesSearch = name.includes(searchTerm);
        const matchesFilter = !filterType || filterType === status;
        
        card.style.display = matchesSearch && matchesFilter ? 'block' : 'none';
    });
}

// Generate report summary
function generateReportSummary(results) {
    const findingsList = document.getElementById('findingsList');
    findingsList.innerHTML = '';
    
    results.findings.forEach((finding, index) => {
        const findingItem = document.createElement('div');
        findingItem.className = 'finding-item';
        
        findingItem.innerHTML = `
            <div class="finding-number ${finding.type}">${index + 1}</div>
            <div>
                <strong>${finding.title}</strong>
                <div style="font-size: 14px; color: #666; margin-top: 5px;">
                    ${finding.details}
                </div>
            </div>
        `;
        
        findingsList.appendChild(findingItem);
    });
}

// Export full report
function exportFullReport() {
    exportToExcel();
}

// Share report
function shareReport() {
    const subject = 'דוח בדיקת שכר - ' + new Date().toLocaleDateString('he-IL');
    const body = 'מצורף דוח בדיקת שכר אוטומטי';
    
    // In real implementation, this would send via email API
    alert('הדוח יישלח למנהלים הרלוונטיים');
}

// Print report
function printReport() {
    window.print();
}

// Window click handler for modal
window.onclick = function(event) {
    const modal = document.getElementById('employeeModal');
    if (event.target === modal) {
        closeModal();
    }
}