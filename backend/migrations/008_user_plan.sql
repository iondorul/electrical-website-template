-- Adaugă planul de abonament al userului (Free / Pro).
-- trial_started_at (migrarea 005) rămâne complet neschimbată: userul nou primește
-- plan='free' + trial_started_at=NOW() la înregistrare, iar accesul temporar de nivel
-- Pro se calculează în backend din trial_started_at, fără nicio scriere pe coloana plan.
-- La expirarea trial-ului userul rămâne efectiv 'free', fără nicio actualizare de date.

CREATE TYPE public.user_plan AS ENUM (
    'free',
    'pro'
);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS plan public.user_plan NOT NULL DEFAULT 'free';
