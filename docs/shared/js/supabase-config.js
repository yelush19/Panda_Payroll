// supabase-config.js
// קונפיגורציה ציבורית של Supabase. URL + anon key (שני אלה ציבוריים ובטוח להופיע בקוד).
//
// לאחר השינוי הזה - יש להריץ את db/schema-v2.sql ב-SQL Editor.

window.SupabaseConfig = (function() {
  'use strict';

  return {
    URL:      'https://jefbriphqubyzmrrqech.supabase.co',
    ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplZmJyaXBocXVieXptcnJxZWNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwMzkwMjEsImV4cCI6MjA4NTYxNTAyMX0.yGborMCwLuBdUAnrrIxkvyGXF0E0XFwarS6tch0WJC8',
  };
})();
