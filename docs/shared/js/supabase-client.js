// supabase-client.js
// יצירת קליינט יחיד ל-Supabase + עזרי auth/session.
//
// טוען את הספרייה מ-CDN של Supabase (esm.sh) דרך תג <script type="module">.
// בקובץ HTML יש להוסיף לפני סקריפטים אחרים:
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//   <script src="shared/js/supabase-config.js"></script>
//   <script src="shared/js/supabase-client.js"></script>

window.SB = (function() {
  'use strict';

  if (typeof supabase === 'undefined') {
    console.warn('Supabase library not loaded. Make sure to include @supabase/supabase-js before this file.');
  }
  if (typeof SupabaseConfig === 'undefined') {
    console.warn('SupabaseConfig not loaded. Make sure to include supabase-config.js before this file.');
  }

  // Singleton client
  const client = (typeof supabase !== 'undefined' && typeof SupabaseConfig !== 'undefined')
    ? supabase.createClient(SupabaseConfig.URL, SupabaseConfig.ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;

  async function getSession() {
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) { console.error('getSession error:', error); return null; }
    return data.session;
  }

  async function getUser() {
    const s = await getSession();
    return s ? s.user : null;
  }

  async function signInWithPassword(email, password) {
    if (!client) throw new Error('Supabase client not initialized');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signUp(email, password, fullName) {
    if (!client) throw new Error('Supabase client not initialized');
    const { data, error } = await client.auth.signUp({
      email, password,
      options: { data: { full_name: fullName || '' } },
    });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
  }

  // עוטף לדף שמחייב התחברות. אם לא מחובר - מפנה ללוגין.
  async function requireAuth(loginUrl) {
    const session = await getSession();
    if (!session) {
      const redirect = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = (loginUrl || '/auth/login.html') + '?next=' + redirect;
      return null;
    }
    return session;
  }

  return {
    client,
    getSession,
    getUser,
    signInWithPassword,
    signUp,
    signOut,
    requireAuth,
  };
})();
