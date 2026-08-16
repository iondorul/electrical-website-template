-- Prerechizite pentru modulul Reports:
-- 1. Prag de stoc redus per material (nu exista niciun camp de referinta anterior).
-- 2. Index pe payments.invoice_id pentru agregarile din Reports/Financial.

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS min_stock numeric DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON public.payments (invoice_id);
