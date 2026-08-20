-- Adaugă suport pentru trimiterea facturilor pe email (PDF) și datele firmei emitente.
--
-- Notă: coloanele sent_at/sent_to_email pe invoices sunt create direct în
-- 013_recover_missing_tables.sql (invoices nu are CREATE TABLE propriu-zis
-- decât acolo — vezi acel fișier). Pe o instanță nouă, 003 rulează înaintea
-- lui 013, deci ALTER TABLE public.invoices de aici ar eșua ("relation does
-- not exist"); de aceea a fost mutat direct în definiția tabelului din 013.

CREATE TABLE IF NOT EXISTS public.company_settings (
    id serial PRIMARY KEY,
    user_id integer NOT NULL UNIQUE REFERENCES public.users(id),
    company_name character varying(255) NOT NULL,
    address text,
    city character varying(100),
    country character varying(100),
    postal_code character varying(20),
    vat_number character varying(50),
    registration_number character varying(50),
    iban character varying(50),
    bank_name character varying(255),
    phone character varying(50),
    email character varying(255),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
