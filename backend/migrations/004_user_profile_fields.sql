-- Adaugă suport pentru câmpul telefon în profilul utilizatorului (Setări → Cont & Securitate).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone character varying(50);
