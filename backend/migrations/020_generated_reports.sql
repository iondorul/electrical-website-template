-- Arhivă de rapoarte PDF generate (modul Reports).
-- PDF-ul e stocat ca bytea în Postgres (nu pe disc) — discul e efemer pe
-- planul gratuit Render, ales deja ca target de hosting; Neon (Postgres)
-- e persistent.

CREATE TABLE IF NOT EXISTS public.generated_reports (
    id serial PRIMARY KEY,
    report_number character varying(20) NOT NULL UNIQUE,
    report_type character varying(20) NOT NULL,
    report_name character varying(255) NOT NULL,
    filters_json jsonb,
    file_name character varying(255) NOT NULL,
    file_size integer NOT NULL,
    file_data bytea NOT NULL,
    status character varying(20) NOT NULL DEFAULT 'ready',
    generated_at timestamp with time zone NOT NULL DEFAULT now(),
    generated_by integer NOT NULL REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS idx_generated_reports_generated_by ON public.generated_reports (generated_by);
CREATE INDEX IF NOT EXISTS idx_generated_reports_type ON public.generated_reports (report_type);
CREATE INDEX IF NOT EXISTS idx_generated_reports_generated_at ON public.generated_reports (generated_at);
