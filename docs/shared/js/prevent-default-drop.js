// prevent-default-drop.js
// מונע מהדפדפן לפתוח קובץ כשגוררים אותו לאזור שאינו upload-zone.
// בלי זה - גרירה לכל מקום בעמוד פותחת את הקובץ במקום להעלות אותו.

(function() {
  'use strict';
  // dragover: מותר לכל מקום (כדי שהזון תקבל את האירוע)
  document.addEventListener('dragover', function(e) {
    e.preventDefault();
  }, false);

  // drop: רק במקום שאינו upload-zone, מונעים את הפעולה
  document.addEventListener('drop', function(e) {
    const inDropZone = e.target.closest('.upload-zone, [data-drop-zone], input[type="file"]');
    if (!inDropZone) {
      e.preventDefault();
    }
  }, false);
})();
