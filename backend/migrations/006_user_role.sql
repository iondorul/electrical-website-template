-- Adaugă rolul utilizatorului, afișat dinamic în header (în loc de valoarea
-- hardcodată "Administrator" folosită anterior în frontend).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS role character varying(50) NOT NULL DEFAULT 'Administrator';
