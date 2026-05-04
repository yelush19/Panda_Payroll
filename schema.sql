-- =============================================================
-- Litay PandaTech Payroll Checker - Supabase Schema
-- =============================================================
-- הרץ את הסקריפט הזה ב-Supabase SQL Editor
-- =============================================================

-- 1. טבלת פרופילי משתמשים (מורחבת מ-auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT NOT NULL,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'team' CHECK (role IN ('team', 'manager', 'admin')),
    dept TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. טבלת עובדים (פרופיל קבוע)
CREATE TABLE IF NOT EXISTS public.employees (
    id SERIAL PRIMARY KEY,
    employee_key TEXT NOT NULL UNIQUE,  -- מפתח מקורי מ-employeesData (1, 2, 3, new1...)
    name TEXT NOT NULL,
    id_number TEXT,                     -- ת.ז.
    dept TEXT,
    start_date TEXT,
    is_shareholder BOOLEAN DEFAULT false,
    is_hourly_employee BOOLEAN DEFAULT false,
    has_intensive_work BOOLEAN DEFAULT false,
    has_global_bonus BOOLEAN DEFAULT false,
    is_office_special_exception BOOLEAN DEFAULT false,
    has_ashel BOOLEAN DEFAULT false,
    has_advanced_study_in_contract BOOLEAN DEFAULT false,
    is_eligible_for_recovery BOOLEAN DEFAULT true,
    has_payslip BOOLEAN DEFAULT true,
    special_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. נתוני חודש לכל עובד
CREATE TABLE IF NOT EXISTS public.monthly_data (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER REFERENCES public.employees(id) ON DELETE CASCADE,
    period_key TEXT NOT NULL,           -- YYYY-MM format

    -- נתוני נוכחות (מקאנו)
    work_days_actual NUMERIC,
    vacation_days_used NUMERIC,
    sick_days_unpaid NUMERIC,
    sick_days_paid NUMERIC,
    reserve_days NUMERIC,
    holidays_paid NUMERIC,
    eve_holidays NUMERIC,

    -- נתוני תלוש
    work_days_paid NUMERIC,
    hours_in_payslip NUMERIC,
    paid_hours_in_mecano NUMERIC,
    meal_allowance NUMERIC,
    ashel_amount NUMERIC,

    -- שעות נוספות
    intensive_hours NUMERIC,
    overtime_125 NUMERIC,
    overtime_150 NUMERIC,
    sick_leave_payment NUMERIC,

    -- הבראה
    recovery_balance NUMERIC,
    recovery_used NUMERIC,
    recovery_reset NUMERIC,

    -- מילואים
    reserve_work_same_day_hours NUMERIC,
    reserve_double_pay_component NUMERIC,

    -- הפרשות
    base_salary NUMERIC,
    pension_employer NUMERIC,
    pension_required NUMERIC,
    compensation_employer NUMERIC,
    compensation_required NUMERIC,
    advanced_study_employer NUMERIC,
    advanced_study_required NUMERIC,

    -- חריגים
    exceptions_report TEXT,
    exception_category TEXT,
    exception_amount NUMERIC,

    saved_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE(employee_id, period_key)
);

-- 4. תוצאות בדיקה
CREATE TABLE IF NOT EXISTS public.check_results (
    id SERIAL PRIMARY KEY,
    period_key TEXT NOT NULL,
    results JSONB NOT NULL,            -- מערך תוצאות הבדיקה
    summary JSONB,                     -- סיכום (ok/warnings/errors counts)
    checked_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. נתוני חריגים
CREATE TABLE IF NOT EXISTS public.exceptions_data (
    id SERIAL PRIMARY KEY,
    period_key TEXT NOT NULL,
    data JSONB NOT NULL,               -- { exceptions: [...], employees: [...] }
    saved_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. נתוני מקאנו מעובדים
CREATE TABLE IF NOT EXISTS public.mecano_data (
    id SERIAL PRIMARY KEY,
    period_key TEXT NOT NULL,
    storage_key TEXT NOT NULL UNIQUE,   -- מפתח localStorage מקורי
    metadata JSONB,                    -- { reportPeriod, employeeCount, files... }
    mapped_data JSONB,                 -- נתונים ממופים
    original_data JSONB,               -- נתונים מקוריים
    system_data JSONB,                 -- נתוני מערכת
    uploaded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. סטטוס העלאות
CREATE TABLE IF NOT EXISTS public.upload_state (
    id SERIAL PRIMARY KEY,
    period_key TEXT NOT NULL,
    state JSONB NOT NULL,
    uploaded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. לוג פעולות (audit trail)
CREATE TABLE IF NOT EXISTS public.activity_log (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    action TEXT NOT NULL,              -- 'upload', 'check', 'export', 'login'...
    module TEXT,                       -- 'mecano', 'checks', 'comparison'...
    period_key TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================
-- INDEXES
-- =============================================================

CREATE INDEX IF NOT EXISTS idx_monthly_data_period ON public.monthly_data(period_key);
CREATE INDEX IF NOT EXISTS idx_monthly_data_employee ON public.monthly_data(employee_id);
CREATE INDEX IF NOT EXISTS idx_check_results_period ON public.check_results(period_key);
CREATE INDEX IF NOT EXISTS idx_exceptions_period ON public.exceptions_data(period_key);
CREATE INDEX IF NOT EXISTS idx_mecano_period ON public.mecano_data(period_key);
CREATE INDEX IF NOT EXISTS idx_activity_log_user ON public.activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_period ON public.activity_log(period_key);

-- =============================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================

-- הפעלת RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exceptions_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mecano_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- מדיניות: כל משתמש מאומת יכול לקרוא הכל
CREATE POLICY "Authenticated users can read all profiles"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id);

-- עובדים - קריאה לכולם, כתיבה למנהלים
CREATE POLICY "Authenticated users can read employees"
    ON public.employees FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Managers can insert employees"
    ON public.employees FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('manager', 'admin'))
    );

CREATE POLICY "Managers can update employees"
    ON public.employees FOR UPDATE
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('manager', 'admin'))
    );

-- נתוני חודש - קריאה לכולם, כתיבה למאומתים
CREATE POLICY "Authenticated users can read monthly_data"
    ON public.monthly_data FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can insert monthly_data"
    ON public.monthly_data FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Authenticated users can update monthly_data"
    ON public.monthly_data FOR UPDATE
    TO authenticated
    USING (true);

-- בדיקות, חריגים, מקאנו, העלאות - גישה מלאה למאומתים
CREATE POLICY "Authenticated users can read check_results"
    ON public.check_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert check_results"
    ON public.check_results FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can read exceptions_data"
    ON public.exceptions_data FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert exceptions_data"
    ON public.exceptions_data FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can read mecano_data"
    ON public.mecano_data FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert mecano_data"
    ON public.mecano_data FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can read upload_state"
    ON public.upload_state FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert upload_state"
    ON public.upload_state FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update upload_state"
    ON public.upload_state FOR UPDATE TO authenticated USING (true);

-- לוג פעולות - קריאה למנהלים, כתיבה לכולם
CREATE POLICY "Managers can read activity_log"
    ON public.activity_log FOR SELECT
    TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('manager', 'admin'))
        OR user_id = auth.uid()
    );

CREATE POLICY "Authenticated users can insert activity_log"
    ON public.activity_log FOR INSERT
    TO authenticated
    WITH CHECK (true);

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
-- FUNCTION: updated_at trigger
-- =============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_employees_updated_at
    BEFORE UPDATE ON public.employees
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_monthly_data_updated_at
    BEFORE UPDATE ON public.monthly_data
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_upload_state_updated_at
    BEFORE UPDATE ON public.upload_state
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
