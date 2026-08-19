-- Elimină trial_started_at — nu există trial, doar planurile Free și Pro.
-- Un user cu plan='free' are mereu limitele Free (2 clienți, 2 proiecte,
-- 5 estimări/lună etc.), fără nicio excepție/acces temporar Pro.

ALTER TABLE public.users
  DROP COLUMN IF EXISTS trial_started_at;
