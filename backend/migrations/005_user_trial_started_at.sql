-- Adaugă suport pentru trial-ul gratuit de 14 zile la înregistrare.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS trial_started_at timestamp with time zone;
