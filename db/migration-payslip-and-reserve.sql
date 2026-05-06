-- ===================================================================
-- Migration: payslip_archives table + reserve_periods unique constraint
-- ===================================================================
-- הפעלה: Supabase Dashboard → SQL Editor → New Query → הדבק והרץ.
-- בטוח להריץ פעם או יותר (משתמש ב-IF NOT EXISTS / ON CONSTRAINT).
-- ===================================================================

-- 1) Payslip Archives (מקבילה ל-meckano_archives, לתלושי שיקלולית)
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

    UNIQUE(period)                                -- חודש = רשומה אחת
);

CREATE INDEX IF NOT EXISTS idx_payslip_archives_period ON public.payslip_archives(period);
CREATE INDEX IF NOT EXISTS idx_payslip_archives_year_month ON public.payslip_archives(year, month);

-- RLS — רק משתמשים מאומתים, כולם יכולים לקרוא+לכתוב
ALTER TABLE public.payslip_archives ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payslip_archives' AND policyname = 'auth all payslip'
  ) THEN
    CREATE POLICY "auth all payslip" ON public.payslip_archives
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;


-- 2) Reserve Periods - unique constraint עבור upsert לפי (employee_no, start_date)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reserve_periods_emp_start_unique'
  ) THEN
    ALTER TABLE public.reserve_periods
      ADD CONSTRAINT reserve_periods_emp_start_unique
      UNIQUE (employee_no, start_date);
  END IF;
END $$;


-- 3) (אופציונלי) ניקוי כפילויות לפני אכיפת ה-unique
-- אם מקבלים שגיאה "duplicate key value violates unique constraint" כשמריצים את ה-ALTER:
-- DELETE FROM public.reserve_periods WHERE id NOT IN (
--   SELECT MIN(id) FROM public.reserve_periods GROUP BY employee_no, start_date
-- );
