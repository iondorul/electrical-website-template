-- Migrare de recuperare: invoices, invoice_items, payments, materials nu au niciun
-- CREATE TABLE în tot repo-ul (nici schema.sql, nici migrările anterioare) — există
-- doar live, în baza de date locală. Fără această migrare, un deploy pe o instanță
-- nouă (ex. Neon) ar porni cu schema.sql + migrările 001-012 și ar lipsi aceste 4
-- tabele complet. Structura de mai jos e recreată exact din DB locală (pg_dump
-- --schema-only), inclusiv enum-ul invoice_status, indexurile, FK-urile și
-- trigger-ele de updated_at.
--
-- Idempotentă: toate statement-urile pot fi rulate sigur atât pe o bază nouă/goală
-- (ex. Neon, la primul deploy), cât și pe una unde aceste obiecte există deja live
-- (ex. DB-ul local curent). CREATE TABLE/SEQUENCE/INDEX folosesc IF NOT EXISTS
-- (suportat nativ). CREATE TYPE, ADD CONSTRAINT (PK/FK) nu au echivalent nativ
-- IF NOT EXISTS în PostgreSQL — sunt învelite în DO $$ ... EXCEPTION WHEN
-- duplicate_object THEN NULL; END $$;. Trigger-ele folosesc CREATE OR REPLACE
-- TRIGGER (PostgreSQL 14+).

--
-- Name: invoice_status; Type: TYPE; Schema: public
--

DO $$ BEGIN
    CREATE TYPE public.invoice_status AS ENUM (
        'draft',
        'issued',
        'partially_paid',
        'paid',
        'overdue',
        'canceled'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

--
-- Name: invoices; Type: TABLE; Schema: public
--

CREATE TABLE IF NOT EXISTS public.invoices (
    id integer NOT NULL,
    invoice_number character varying(50) NOT NULL,
    quote_id integer,
    client_id integer NOT NULL,
    project_id integer,
    status public.invoice_status DEFAULT 'draft'::public.invoice_status NOT NULL,
    issue_date date DEFAULT CURRENT_DATE NOT NULL,
    due_date date NOT NULL,
    subtotal_materials numeric(12,2) DEFAULT 0.00 NOT NULL,
    subtotal_labor numeric(12,2) DEFAULT 0.00 NOT NULL,
    subtotal_equipment numeric(12,2) DEFAULT 0.00 NOT NULL,
    subtotal numeric(12,2) DEFAULT 0.00 NOT NULL,
    discount_amount numeric(12,2) DEFAULT 0.00 NOT NULL,
    total_net numeric(12,2) DEFAULT 0.00 NOT NULL,
    vat_rate numeric(5,2) DEFAULT 19.00 NOT NULL,
    vat_amount numeric(12,2) DEFAULT 0.00 NOT NULL,
    total_gross numeric(12,2) DEFAULT 0.00 NOT NULL,
    paid_amount numeric(12,2) DEFAULT 0.00 NOT NULL,
    currency_code character(3) DEFAULT 'EUR'::bpchar NOT NULL,
    terms_and_conditions text,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by integer NOT NULL,
    updated_by integer,
    sent_at timestamp with time zone,
    sent_to_email character varying(255)
);

CREATE SEQUENCE IF NOT EXISTS public.invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.invoices_id_seq OWNED BY public.invoices.id;

ALTER TABLE ONLY public.invoices ALTER COLUMN id SET DEFAULT nextval('public.invoices_id_seq'::regclass);

DO $$ BEGIN
    ALTER TABLE ONLY public.invoices
        ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);
EXCEPTION
    WHEN duplicate_object OR invalid_table_definition THEN NULL;
END $$;

--
-- Name: invoice_items; Type: TABLE; Schema: public
--

CREATE TABLE IF NOT EXISTS public.invoice_items (
    id integer NOT NULL,
    invoice_id integer NOT NULL,
    category character varying(50) NOT NULL,
    item_code character varying(100),
    description text NOT NULL,
    quantity numeric(10,3) DEFAULT 1.000 NOT NULL,
    unit_of_measure character varying(20) NOT NULL,
    unit_price numeric(12,2) DEFAULT 0.00 NOT NULL,
    margin_percent numeric(5,2) DEFAULT 0.00 NOT NULL,
    total_price numeric(12,2) DEFAULT 0.00 NOT NULL,
    notes text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.invoice_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.invoice_items_id_seq OWNED BY public.invoice_items.id;

ALTER TABLE ONLY public.invoice_items ALTER COLUMN id SET DEFAULT nextval('public.invoice_items_id_seq'::regclass);

DO $$ BEGIN
    ALTER TABLE ONLY public.invoice_items
        ADD CONSTRAINT invoice_items_pkey PRIMARY KEY (id);
EXCEPTION
    WHEN duplicate_object OR invalid_table_definition THEN NULL;
END $$;

--
-- Name: materials; Type: TABLE; Schema: public
--

CREATE TABLE IF NOT EXISTS public.materials (
    id integer NOT NULL,
    created_by integer NOT NULL,
    item_code character varying(50),
    name text NOT NULL,
    category character varying(50) NOT NULL,
    unit_of_measure character varying(20) NOT NULL,
    unit_price numeric(12,2) DEFAULT 0.00 NOT NULL,
    stock_quantity numeric(10,3) DEFAULT 0.000 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    min_stock numeric DEFAULT 0
);

CREATE SEQUENCE IF NOT EXISTS public.materials_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.materials_id_seq OWNED BY public.materials.id;

ALTER TABLE ONLY public.materials ALTER COLUMN id SET DEFAULT nextval('public.materials_id_seq'::regclass);

DO $$ BEGIN
    ALTER TABLE ONLY public.materials
        ADD CONSTRAINT materials_pkey PRIMARY KEY (id);
EXCEPTION
    WHEN duplicate_object OR invalid_table_definition THEN NULL;
END $$;

--
-- Name: payments; Type: TABLE; Schema: public
--

CREATE TABLE IF NOT EXISTS public.payments (
    id integer NOT NULL,
    invoice_id integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    payment_date date DEFAULT CURRENT_DATE NOT NULL,
    payment_method character varying(30) DEFAULT 'bank_transfer'::character varying NOT NULL,
    reference_number character varying(100),
    notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by integer NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);

DO $$ BEGIN
    ALTER TABLE ONLY public.payments
        ADD CONSTRAINT payments_pkey PRIMARY KEY (id);
EXCEPTION
    WHEN duplicate_object OR invalid_table_definition THEN NULL;
END $$;

--
-- Indexes
--

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON public.invoice_items USING btree (invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON public.invoices USING btree (client_id) WHERE (is_active = true);

CREATE INDEX IF NOT EXISTS idx_invoices_project_id ON public.invoices USING btree (project_id) WHERE (is_active = true);

CREATE INDEX IF NOT EXISTS idx_materials_category ON public.materials USING btree (category) WHERE (is_active = true);

CREATE INDEX IF NOT EXISTS idx_materials_created_by ON public.materials USING btree (created_by) WHERE (is_active = true);

CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON public.payments USING btree (invoice_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_quote_id ON public.invoices USING btree (quote_id) WHERE ((is_active = true) AND (quote_id IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_invoice_number ON public.invoices USING btree (created_by, invoice_number) WHERE (is_active = true);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_item_code ON public.materials USING btree (created_by, item_code) WHERE ((is_active = true) AND (item_code IS NOT NULL));

--
-- Triggers (funcția public.update_updated_at_column() e deja creată în schema.sql)
--

CREATE OR REPLACE TRIGGER trg_update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_update_materials_updated_at BEFORE UPDATE ON public.materials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Foreign keys
--

DO $$ BEGIN
    ALTER TABLE ONLY public.invoices
        ADD CONSTRAINT invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE RESTRICT;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE ONLY public.invoices
        ADD CONSTRAINT invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE ONLY public.invoices
        ADD CONSTRAINT invoices_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE RESTRICT;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE ONLY public.invoices
        ADD CONSTRAINT invoices_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.quotes(id) ON DELETE RESTRICT;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE ONLY public.invoices
        ADD CONSTRAINT invoices_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE ONLY public.invoice_items
        ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE ONLY public.materials
        ADD CONSTRAINT materials_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE ONLY public.payments
        ADD CONSTRAINT payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE ONLY public.payments
        ADD CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
