-- Adaugă suport pentru trimiterea facturilor pe email (PDF) și datele firmei emitente.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS sent_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS sent_to_email character varying(255);

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
