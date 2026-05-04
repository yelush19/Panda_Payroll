// joint-ceos-store.js
// אחסון נתוני מנכ"לים משותפים שלא מדווחים ב-Meckano (בנימין זהר, אבישי לייבנזון).
//
// הם פטורים מדיווח שעות, לכן בכל חודש יש לשאול אותם:
//   - האם היו בחופש/מחלה/מילואים? אם כן, כמה ימים?
//   - הם מקבלים שכר מלא (כל ימי א-ה בחודש)
//
// הנתונים נשמרים פר חודש פר עובד.

window.JointCeosStore = (function() {
  'use strict';

  const STORE_KEY = 'pandatech_joint_ceos_v1';

  function loadAll() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveAll(data) {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  }

  // קבל רשומה לעובד+חודש (יוצר אם לא קיים)
  function getMonthly(employeeNo, period) {
    const all = loadAll();
    const key = String(employeeNo) + ':' + period;
    return all[key] || {
      employee_no:  employeeNo,
      period:       period,
      vacation_days: 0,
      sick_days:    0,
      miluim_days:  0,
      notes:        '',
      confirmed_by: '',          // שם של מי שאישר את הנתונים
      confirmed_at: null,
      updated_at:   null,
    };
  }

  function saveMonthly(employeeNo, period, fields) {
    const all = loadAll();
    const key = String(employeeNo) + ':' + period;
    all[key] = {
      ...getMonthly(employeeNo, period),
      ...fields,
      employee_no: employeeNo,
      period:      period,
      updated_at:  new Date().toISOString(),
    };
    saveAll(all);
    return all[key];
  }

  function listForPeriod(period) {
    const all = loadAll();
    return Object.values(all).filter(r => r.period === period);
  }

  function listForEmployee(employeeNo) {
    const all = loadAll();
    return Object.values(all).filter(r => String(r.employee_no) === String(employeeNo));
  }

  // האם עובד מסוים מסומן כ"מנכ"ל ללא דיווח" באינדקס?
  // הקריטריון: employee_type === 'מנכ"ל' AND has_no_meckano_reporting flag
  // אבל פשוט יותר: סומן ידנית ב-employee.is_joint_ceo
  function isJointCeo(employee) {
    if (!employee) return false;
    return !!employee.is_joint_ceo;
  }

  function clearAll() {
    localStorage.removeItem(STORE_KEY);
  }

  return {
    loadAll, saveMonthly, getMonthly,
    listForPeriod, listForEmployee,
    isJointCeo, clearAll,
  };
})();
