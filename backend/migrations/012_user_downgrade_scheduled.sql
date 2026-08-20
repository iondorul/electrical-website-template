-- Flag pentru downgrade programat la Free (Stripe cancel_at_period_end).
-- Userul rămâne plan='pro' (păstrează accesul) cât timp downgrade_scheduled=true —
-- doar la evenimentul webhook customer.subscription.deleted (perioada chiar
-- expiră) userul trece efectiv pe plan='free' și flag-ul se resetează.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS downgrade_scheduled boolean NOT NULL DEFAULT false;
