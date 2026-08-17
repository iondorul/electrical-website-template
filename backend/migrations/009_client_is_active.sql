-- Adaugă is_active pe clients, pentru soft-delete uniform cu celelalte module
-- care au deja acest pattern (estimates, projects, quotes, invoices, materials).
-- Toți clienții existenți rămân activi implicit (DEFAULT true) — nu afectează datele curente.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
