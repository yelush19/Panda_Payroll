// checks-logic.js - לוגיקת כל הבדיקות המעודכנות

class PayrollChecker {
    constructor(monthConfig) {
        // טעינת קונפיגורציה דינמית מ-MonthConfig (אם זמין)
        const config = monthConfig || (typeof MonthConfig !== 'undefined' ? MonthConfig.loadSelectedMonth() : null);
        const constants = (typeof MonthConfig !== 'undefined') ? MonthConfig.BUSINESS_CONSTANTS : {};

        this.maxWorkDays = config ? config.maxWorkDays : 21;
        this.currentPeriod = config ? config.periodDisplay : '';
        this.mealPricePerDay = constants.mealPricePerDay || 40;
        this.pensionRate = constants.pensionRate || 0.065;
        this.compensationRate = constants.compensationRate || 0.0833;
        this.advancedStudyRate = constants.advancedStudyRate || 0.075;
        this.hoursDiffTolerance = constants.hoursDiffTolerance || 1;
        this.mealDiffTolerance = constants.mealDiffTolerance || 40;
        this.overtimeWarningThreshold = constants.overtimeWarningThreshold || 50;
    }

    // 1️⃣ בדיקת ימי עבודה ויעדרויות
    checkWorkDaysAndAbsences(employee) {
        const totalPaidDays = employee.workDaysActual + 
                             employee.vacationDaysUsed + 
                             employee.sickDaysPaid + 
                             employee.reserveDays + 
                             employee.holidaysPaid + 
                             (employee.eveHolidays * 0.5);

        const isValid = employee.workDaysPaid <= this.maxWorkDays;
        const calculatedDays = Math.ceil(totalPaidDays);
        const difference = employee.workDaysPaid - calculatedDays;

        return {
            type: "workDays",
            title: "ימי עבודה ויעדרויות",
            isValid: isValid,
            severity: isValid ? (difference === 0 ? 'success' : 'warning') : 'error',
            data: {
                actualWorkDays: employee.workDaysActual,
                vacationUsed: employee.vacationDaysUsed,
                sickPaid: employee.sickDaysPaid,
                sickUnpaid: employee.sickDaysUnpaid,
                reserveDays: employee.reserveDays,
                holidaysPaid: employee.holidaysPaid,
                eveHolidays: employee.eveHolidays,
                totalCalculated: calculatedDays,
                paidInPayslip: employee.workDaysPaid,
                maxAllowed: this.maxWorkDays,
                difference: difference
            },
            message: isValid ? 
                (difference === 0 ? "✅ תקין - ימי עבודה תואמים" : `⚠️ הפרש: ${difference} ימים`) :
                `❌ חריגה: ${employee.workDaysPaid} > ${this.maxWorkDays} ימים`,
            source: "מקור: דוח מקאנו (נוכחות + היעדרויות) vs תלוש"
        };
    }

    // 2️⃣ בדיקת שעות עבודה
    checkWorkHours(employee) {
        const hoursDiff = Math.abs(employee.hoursInPayslip - employee.paidHoursInMecano);
        const isValid = hoursDiff <= this.hoursDiffTolerance;

        return {
            type: "workHours",
            title: "שעות עבודה",
            isValid: isValid,
            severity: isValid ? 'success' : 'warning',
            data: {
                hoursInPayslip: employee.hoursInPayslip,
                hoursInMecano: employee.paidHoursInMecano,
                difference: hoursDiff,
                allowedRange: `±${this.hoursDiffTolerance} שעה`
            },
            message: isValid ? 
                "✅ תקין - הפרש שעות ±1" : 
                `⚠️ הפרש: ${hoursDiff} שעות (מעל המותר)`,
            source: "מקור: תלוש vs דוח מקאנו"
        };
    }

    // 3️⃣ בדיקת שעות נוספות לפי סוג עובד
    checkOvertimeHours(employee) {
        let message, isValid = true, severity = 'success';
        let data = {
            hasIntensiveWork: employee.hasIntensiveWork,
            hasGlobalBonus: employee.hasGlobalBonus,
            intensiveHours: employee.intensiveHours || 0,
            overtime125: employee.overtime125,
            overtime150: employee.overtime150,
            totalOvertime: employee.overtime125 + employee.overtime150
        };

        if (employee.hasIntensiveWork || employee.hasGlobalBonus) {
            // סוג א': עם רכיב עבודה מאומצת/תוספת גלובלית
            data.type = "עובד עם רכיב מיוחד";
            message = employee.hasIntensiveWork ? 
                "✅ תקין - יש רכיב עבודה מאומצת" : 
                "✅ תקין - יש תוספת גלובלית";
        } else {
            // סוג ב': ללא רכיב מיוחד - בדיקה רגילה
            data.type = "עובד רגיל";
            const totalOvertime = employee.overtime125 + employee.overtime150;
            if (totalOvertime > this.overtimeWarningThreshold) {
                isValid = false;
                severity = 'warning';
                message = `⚠️ שעות נוספות גבוהות: ${totalOvertime} שעות`;
            } else {
                message = "✅ תקין - שעות נוספות במסגרת";
            }
        }

        return {
            type: "overtime",
            title: "שעות נוספות",
            isValid: isValid,
            severity: severity,
            data: data,
            message: message,
            source: "מקור: תלוש vs דיווח שעות נוספות במקאנו"
        };
    }

    // 4️⃣ בדיקת ארוחות מעודכנת
    checkMeals(employee) {
        let isValid = true, severity = 'success', message = "";
        let expectedMeals = 0, actualMeals = employee.mealAllowance;
        let checkType = "";

        // בדיקת סוג העובד
        if (employee.name === "יורם שלמה") {
            // יורם שלמה - ללא חיוב ארוחות
            checkType = "ללא חיוב ארוחות";
            expectedMeals = 0;
            const hasAshel = employee.hasAshel || false;
            const ashelAmount = employee.ashelAmount || 0;
            
            if (actualMeals === 0 && hasAshel) {
                message = `✅ תקין - ללא חיוב ארוחות + רכיב אשל ${ashelAmount}₪`;
            } else if (actualMeals > 0) {
                isValid = false;
                severity = 'error';
                message = `❌ שגיאה - יש חיוב ארוחות ${actualMeals}₪ למרות שלא אמור`;
            } else {
                message = "✅ תקין - ללא חיוב ארוחות";
            }
        } else if (employee.isOfficeSpecialException) {
            // עובדי משרד עם חריג מיוחד
            checkType = "חריג מיוחד - עובד משרד";
            expectedMeals = "לפי דוח חריגים";
            message = `⚠️ חריג מיוחד - בדוק התאמה לדוח חריגים: ${actualMeals}₪`;
            severity = 'warning';
        } else {
            // עובדים רגילים - לפי נוסחה
            checkType = "עובד רגיל";
            expectedMeals = employee.workDaysActual * this.mealPricePerDay;
            const difference = Math.abs(actualMeals - expectedMeals);
            
            if (difference <= this.mealDiffTolerance) {
                message = "✅ תקין - ארוחות תואמות נוסחה";
            } else {
                isValid = false;
                severity = 'warning';
                message = `⚠️ הפרש: ${difference}₪ (מעל ±${this.mealDiffTolerance}₪)`;
            }
        }

        return {
            type: "meals",
            title: "ארוחות",
            isValid: isValid,
            severity: severity,
            data: {
                checkType: checkType,
                actualMeals: actualMeals,
                expectedMeals: expectedMeals,
                workDaysActual: employee.workDaysActual,
                pricePerDay: this.mealPricePerDay,
                difference: typeof expectedMeals === 'number' ? Math.abs(actualMeals - expectedMeals) : 0,
                hasAshel: employee.hasAshel || false,
                ashelAmount: employee.ashelAmount || 0
            },
            message: message,
            source: "מקור: תלוש vs חישוב או דוח חריגים"
        };
    }

    // 5️⃣ בדיקת ימי מחלה - תשלום וחיוב
    checkSickLeave(employee) {
        const hasSickDays = employee.sickDaysPaid > 0;
        const hasSickPayment = employee.sickLeavePayment > 0;
        let isValid = true, severity = 'success', message = "";

        if (!hasSickDays && !hasSickPayment) {
            message = "✅ תקין - אין ימי מחלה";
        } else if (hasSickDays && hasSickPayment) {
            // יש ימי מחלה ויש תשלום/חיוב
            const expectedBehavior = employee.isHourlyEmployee ? "תוספת" : "חיוב";
            message = `✅ יש ימי מחלה: ${employee.sickDaysPaid} ימים, ${expectedBehavior}: ${employee.sickLeavePayment}₪`;
        } else if (hasSickDays && !hasSickPayment) {
            isValid = false;
            severity = 'warning';
            message = `⚠️ יש ${employee.sickDaysPaid} ימי מחלה אבל אין רכיב בתלוש`;
        } else {
            isValid = false;
            severity = 'warning';
            message = `⚠️ יש רכיב מחלה ${employee.sickLeavePayment}₪ אבל אין ימי מחלה במקאנו`;
        }

        return {
            type: "sickLeave",
            title: "ימי מחלה - תשלום וחיוב",
            isValid: isValid,
            severity: severity,
            data: {
                sickDaysPaid: employee.sickDaysPaid,
                sickLeavePayment: employee.sickLeavePayment,
                isHourlyEmployee: employee.isHourlyEmployee,
                expectedBehavior: employee.isHourlyEmployee ? "תוספת" : "חיוב"
            },
            message: message,
            source: "מקור: היעדרויות מקאנו vs רכיבי תלוש"
        };
    }

    // 6️⃣ בדיקת הבראה וניצול
    checkRecoveryBenefit(employee) {
        const isEligible = employee.isEligibleForRecovery;
        let isValid = true, severity = 'success', message = "";

        if (!isEligible) {
            message = "✅ לא זכאי להבראה - עובד שעתי מתחת לשנה";
        } else {
            const hasBalance = employee.recoveryBalance > 0;
            const hasUsage = employee.recoveryUsed > 0;
            
            if (hasBalance || hasUsage) {
                message = `✅ זכאי להבראה - יתרה: ${employee.recoveryBalance}₪, ניצול: ${employee.recoveryUsed}₪`;
            } else {
                severity = 'warning';
                message = "⚠️ זכאי להבראה אבל אין נתונים";
            }
        }

        return {
            type: "recovery",
            title: "הבראה וניצול",
            isValid: isValid,
            severity: severity,
            data: {
                isEligible: isEligible,
                startDate: employee.startDate,
                recoveryBalance: employee.recoveryBalance || 0,
                recoveryUsed: employee.recoveryUsed || 0,
                recoveryReset: employee.recoveryReset || 0
            },
            message: message,
            source: "מקור: תלוש (תאריך תחילה + רכיבי הבראה)"
        };
    }

    // 7️⃣ בדיקת מילואים מיוחד
    checkReserveService(employee) {
        const hasReserveDays = employee.reserveDays > 0;
        const hasReserveWork = employee.reserveWorkSameDayHours > 0;
        const hasDoublePayComponent = employee.reserveDoublePayComponent > 0;
        let isValid = true, severity = 'success', message = "";

        if (!hasReserveDays) {
            message = "✅ אין ימי מילואים";
        } else if (hasReserveWork && hasDoublePayComponent) {
            message = `✅ תקין - עבד ביום מילואים: ${employee.reserveWorkSameDayHours} שעות, תשלום כפול: ${employee.reserveDoublePayComponent}₪`;
        } else if (hasReserveWork && !hasDoublePayComponent) {
            isValid = false;
            severity = 'warning';
            message = `⚠️ עבד ביום מילואים אבל אין רכיב תשלום כפול`;
        } else {
            message = `✅ מילואים רגיל - ${employee.reserveDays} ימים`;
        }

        return {
            type: "reserve",
            title: "מילואים מיוחד",
            isValid: isValid,
            severity: severity,
            data: {
                reserveDays: employee.reserveDays,
                reserveWorkSameDayHours: employee.reserveWorkSameDayHours || 0,
                reserveDoublePayComponent: employee.reserveDoublePayComponent || 0
            },
            message: message,
            source: "מקור: דוח מקאנו + תלוש"
        };
    }

    // 8️⃣ בדיקת דוח חריגים
    checkExceptionsReport(employee) {
        const hasExceptions = employee.exceptionsReport !== "אין";
        let severity = hasExceptions ? 'warning' : 'success';
        let message = hasExceptions ? 
            `⚠️ יש בקשות: ${employee.exceptionsReport}` : 
            "✅ אין בקשות בדוח חריגים";

        return {
            type: "exceptions",
            title: "דוח חריגים",
            isValid: true, // תמיד תקין, רק מידע
            severity: severity,
            data: {
                exceptionsReport: employee.exceptionsReport,
                exceptionCategory: employee.exceptionCategory || "",
                exceptionAmount: employee.exceptionAmount || 0
            },
            message: message,
            source: "מקור: דוח חריגים חודשי"
        };
    }

    // פונקציה מרכזת לכל הבדיקות
    runAllChecks(employee) {
        if (!employee.hasPayslip) {
            return [{
                type: "newEmployee",
                title: "עובד חדש",
                isValid: false,
                severity: 'info',
                data: {
                    name: employee.name,
                    startDate: employee.startDate,
                    inMecano: employee.inMecano,
                    inPayslips: employee.inPayslips
                },
                message: "⚠️ עובד חדש - נדרש מעקב",
                source: "מקור: השוואת רשימות"
            }];
        }

        return [
            this.checkWorkDaysAndAbsences(employee),
            this.checkWorkHours(employee),
            this.checkOvertimeHours(employee),
            this.checkMeals(employee),
            this.checkSickLeave(employee),
            this.checkRecoveryBenefit(employee),
            this.checkReserveService(employee),
            this.checkExceptionsReport(employee)
        ];
    }

    // חישוב סטטוס כללי לעובד
    calculateEmployeeStatus(employee) {
        if (!employee.hasPayslip) return 'new';
        
        const checks = this.runAllChecks(employee);
        const errors = checks.filter(c => c.severity === 'error').length;
        const warnings = checks.filter(c => c.severity === 'warning').length;
        
        if (errors > 0) return 'error';
        if (warnings > 0) return 'warning';
        return 'ok';
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PayrollChecker;
}