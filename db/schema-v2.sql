-- =============================================================
-- Litay PandaTech Payroll - Supabase Schema v2
-- =============================================================
-- מבנה מעודכן התואם למודולים החדשים (Em_Index, ארכיון Meckano, HR-1).
-- הרץ ב-Supabase SQL Editor.
--
-- מחליף את schema.sql הישן (ששמרה Yelena כתיעוד פתוחי).
-- =============================================================

-- =============================================================
-- 1. Profiles - משתמשי המערכת (חשבי שכר, מנהלים, צופים)
-- =============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT NOT NULL,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'team' CHECK (role IN ('viewer', 'team', 'manager', 'admin')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================
-- 2. Employees Master Index - אינדקס עובדים מרכזי (מחליף Em_Index של Meckano + employees_data.js הישן)
-- =============================================================

CREATE TABLE IF NOT EXISTS public.employees_master (
    id BIGSERIAL PRIMARY KEY,

    -- זיהוי
    employee_no TEXT NOT NULL UNIQUE,            -- מספר עובד מ-Meckano (לא משתנה)
    national_id TEXT NOT NULL,                   -- ת.ז. 9 ספרות (UNIQUE per organization)
    last_name   TEXT NOT NULL,
    first_name  TEXT NOT NULL,
    full_name   TEXT GENERATED ALWAYS AS (TRIM(first_name || ' ' || last_name)) STORED,

    -- מאפיינים בסיסיים
    department      TEXT,
    employee_type   TEXT CHECK (employee_type IN ('גלובלי', 'שעתי', 'קבלן', 'מנכ"ל', 'פרויקט', NULL, '')),
    start_date      DATE,
    end_date        DATE,

    -- סטטוס מיוחד עם תקופה
    special_status      TEXT CHECK (special_status IN ('חופשת לידה', 'חל"ת', 'תאונת עבודה', NULL, '')),
    special_status_from DATE,
    special_status_to   DATE,

    -- תוספת גלובלית בגין שעות נוספות
    global_overtime_hours NUMERIC(6, 2),         -- סף שעות; NULL = אין תוספת

    -- רכיבי שכר (Phase HR-3)
    base_salary                     NUMERIC(10, 2),
    hourly_rate                     NUMERIC(8, 2),
    pension_rate_employer           NUMERIC(5, 4) DEFAULT 0.065,
    pension_rate_employee           NUMERIC(5, 4) DEFAULT 0.06,
    compensation_rate               NUMERIC(5, 4) DEFAULT 0.0833,
    has_advanced_study_in_contract  BOOLEAN DEFAULT false,
    advanced_study_rate_employer    NUMERIC(5, 4) DEFAULT 0.075,
    advanced_study_rate_employee    NUMERIC(5, 4) DEFAULT 0.025,
    has_intensive_work_bonus        BOOLEAN DEFAULT false,
    intensive_work_hours            NUMERIC(6, 2),
    has_global_bonus                BOOLEAN DEFAULT false,
    meal_allowance_per_day          NUMERIC(6, 2) DEFAULT 40,
    is_office_special_exception     BOOLEAN DEFAULT false,

    -- יתרות (Phase HR-4)
    vacation_balance_days           NUMERIC(6, 2) DEFAULT 0,
    vacation_annual_quota           NUMERIC(4, 1) DEFAULT 14,
    sick_balance_days               NUMERIC(6, 2) DEFAULT 0,
    recovery_balance_amount         NUMERIC(10, 2) DEFAULT 0,
    recovery_used_amount            NUMERIC(10, 2) DEFAULT 0,
    is_eligible_for_recovery        BOOLEAN DEFAULT true,

    -- מסמכים (Phase HR-2)
    doc_form_101            TEXT DEFAULT 'missing' CHECK (doc_form_101 IN ('missing','pending','approved')),
    doc_employment_contract TEXT DEFAULT 'missing' CHECK (doc_employment_contract IN ('missing','pending','approved')),
    doc_kupot_form          TEXT DEFAULT 'missing' CHECK (doc_kupot_form IN ('missing','pending','approved')),
    doc_bank_details        TEXT DEFAULT 'missing' CHECK (doc_bank_details IN ('missing','pending','approved')),

    notes TEXT,

    -- אודיט
    created_at  TIMESTAMPTZ DEFAULT now(),
    created_by  UUID REFERENCES auth.users(id),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    updated_by  UUID REFERENCES auth.users(id),
    imported_at TIMESTAMPTZ,                     -- מתי יובא לראשונה מ-Em_Index
    source      TEXT                             -- 'em_index' / 'manual' / 'onboarding'
);

CREATE INDEX IF NOT EXISTS idx_employees_master_natid     ON public.employees_master(national_id);
CREATE INDEX IF NOT EXISTS idx_employees_master_dept      ON public.employees_master(department);
CREATE INDEX IF NOT EXISTS idx_employees_master_type      ON public.employees_master(employee_type);
CREATE INDEX IF NOT EXISTS idx_employees_master_active    ON public.employees_master(end_date) WHERE end_date IS NULL;

-- =============================================================
-- 3. Meckano Archives - ארכיון דוחות חודשיים גולמיים
-- =============================================================

CREATE TABLE IF NOT EXISTS public.meckano_archives (
    id          BIGSERIAL PRIMARY KEY,
    period      TEXT NOT NULL,                   -- 'YYYY-MM'
    year        INT  NOT NULL,
    month       INT  NOT NULL CHECK (month BETWEEN 1 AND 12),

    file_name   TEXT,
    total_blocks INT,
    sheet_name  TEXT DEFAULT 'report',

    -- הנתונים המעובדים: blocks[] עם days, summary, events
    blocks JSONB NOT NULL,

    -- מטא לרשימת גיליונות שהיו בקובץ המקור
    workbook_sheets JSONB,

    -- אודיט
    uploaded_at TIMESTAMPTZ DEFAULT now(),
    uploaded_by UUID REFERENCES auth.users(id),

    UNIQUE(period)                                -- חודש = רשומה אחת. ייבוא מחדש מעדכן.
);

CREATE INDEX IF NOT EXISTS idx_meckano_archives_period ON public.meckano_archives(period);
CREATE INDEX IF NOT EXISTS idx_meckano_archives_year_month ON public.meckano_archives(year, month);

-- =============================================================
-- 4. Manual Adjustments - תיוגים ידניים שיילנה הוסיפה (לחישוב הפרשים)
--    דוגמה: 'הופחתו 2 ימי מחלה לקיזוז + 2 ימי חל"ת' אצל דוד לוי
-- =============================================================

CREATE TABLE IF NOT EXISTS public.manual_adjustments (
    id          BIGSERIAL PRIMARY KEY,
    employee_id BIGINT REFERENCES public.employees_master(id) ON DELETE CASCADE,
    employee_no TEXT NOT NULL,                   -- duplicate למקרה שעובד נמחק
    period      TEXT NOT NULL,                   -- 'YYYY-MM'
    field       TEXT NOT NULL,                   -- 'sick_kizuz', 'chalat', 'absence', וכו'
    delta       NUMERIC NOT NULL,                -- +/- ערך לתיקון
    reason      TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now(),
    created_by  UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_manual_adj_emp_period ON public.manual_adjustments(employee_no, period);

-- =============================================================
-- 5. Audit Log - לוג פעולות מערכת (העלאות, עריכות, ייצואים)
-- =============================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID REFERENCES auth.users(id),
    action      TEXT NOT NULL,                   -- 'upload', 'edit', 'export', 'login', 'bulk_apply'
    module      TEXT,                            -- 'em_index', 'meckano_archive', 'days_summary', 'worksheet', וכו'
    entity_id   TEXT,                            -- מזהה הפריט המושפע (למשל employee_no)
    period      TEXT,                            -- אם רלוונטי
    details     JSONB,                           -- old_value/new_value/context
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user   ON public.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_period ON public.audit_log(period);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.audit_log(created_at DESC);

-- =============================================================
-- 5b. Payslip Archives (Shiklulit/TAMAL data per month)
--     מקבילו של meckano_archives — לתלושי השכר משיקלולית.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.payslip_archives (
    id          BIGSERIAL PRIMARY KEY,
    period      TEXT NOT NULL,                    -- 'YYYY-MM'
    year        INT  NOT NULL,
    month       INT  NOT NULL CHECK (month BETWEEN 1 AND 12),

    -- 4 דוחות שיקלולית — כל אחד JSONB עם {meta, employees, components_dict}
    components_report           JSONB,            -- "רכיבים לעובדים"
    imputed_income_report       JSONB,            -- "הכנסות זקופות"
    voluntary_deductions_report JSONB,            -- "ניכויי רשות"
    absences_report             JSONB,            -- "דו"ח העדרויות"

    -- מילון רכיבים מאוחד מכל הדוחות (קוד → שם)
    all_components_dict JSONB,

    employee_count INT,

    -- אודיט
    uploaded_at TIMESTAMPTZ DEFAULT now(),
    uploaded_by UUID REFERENCES auth.users(id),

    UNIQUE(period)                                -- חודש = רשומה אחת. ייבוא מחדש מעדכן.
);

CREATE INDEX IF NOT EXISTS idx_payslip_archives_period ON public.payslip_archives(period);
CREATE INDEX IF NOT EXISTS idx_payslip_archives_year_month ON public.payslip_archives(year, month);

-- RLS
ALTER TABLE public.payslip_archives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all payslip" ON public.payslip_archives FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================================================
-- 6. Reserve Module Tables (Phase H — for future)
-- =============================================================

CREATE TABLE IF NOT EXISTS public.reserve_periods (
    id              BIGSERIAL PRIMARY KEY,
    employee_id     BIGINT REFERENCES public.employees_master(id),
    employee_no     TEXT NOT NULL,
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    calendar_days   INT GENERATED ALWAYS AS ((end_date - start_date) + 1) STORED,
    work_days       INT,                         -- ראשון-חמישי בלבד
    weekend_days    INT,
    daily_rate_snapshot NUMERIC(10, 2),
    expected_payment    NUMERIC(10, 2),
    actual_paid         NUMERIC(10, 2),
    bituach_leumi_amount NUMERIC(10, 2),
    bituach_leumi_received_at DATE,
    diff_amount NUMERIC(10, 2),
    settlement_payroll_month TEXT,
    status      TEXT CHECK (status IN ('draft','submitted_to_bl','received_from_bl','settled','rejected')),
    notes       TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reserve_periods_emp    ON public.reserve_periods(employee_no);
CREATE INDEX IF NOT EXISTS idx_reserve_periods_status ON public.reserve_periods(status);

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees_master    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meckano_archives    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_adjustments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reserve_periods     ENABLE ROW LEVEL SECURITY;

-- profiles: כל מאומת קורא, עדכון רק את עצמו
CREATE POLICY "auth read profiles"  ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "self update profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- employees_master: קריאה+כתיבה לכל מאומת (יילנה+צוותה). מנהלים בלבד למחיקה.
CREATE POLICY "auth read employees"   ON public.employees_master FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert employees" ON public.employees_master FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update employees" ON public.employees_master FOR UPDATE TO authenticated USING (true);
CREATE POLICY "admin delete employees" ON public.employees_master FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('manager','admin'))
);

-- meckano_archives: גישה מלאה למאומתים
CREATE POLICY "auth all meckano"   ON public.meckano_archives FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- manual_adjustments: גישה מלאה למאומתים
CREATE POLICY "auth all manual_adj" ON public.manual_adjustments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- audit_log: כתיבה לכולם, קריאה רק למנהלים או למשתמש עצמו
CREATE POLICY "auth insert audit"   ON public.audit_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "manager read audit"  ON public.audit_log FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('manager','admin'))
    OR user_id = auth.uid()
);

-- reserve_periods: גישה מלאה למאומתים
CREATE POLICY "auth all reserve" ON public.reserve_periods FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================================================
-- TRIGGER: יצירת פרופיל אוטומטית בהרשמה
-- =============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        'team'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================
-- TRIGGER: updated_at אוטומטי
-- =============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_profiles_updated_at         BEFORE UPDATE ON public.profiles         FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_employees_master_updated_at BEFORE UPDATE ON public.employees_master FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================
-- DONE. תוצאה:
--   6 טבלאות עיקריות
--   RLS פעיל על כולן
--   Triggers ל-profile auto-create + updated_at
--
-- צעדים הבאים:
--   1. צור פרויקט Supabase (https://supabase.com)
--   2. SQL Editor → הדבק את הקובץ הזה → Run
--   3. Settings → API → העתק Project URL + anon public key
--   4. שלח לי את שניהם כדי שאוסיף אותם לקוד
-- =============================================================
