-- Adaugă stripe_subscription_id pe users, ca să putem afișa data reală de
-- reînnoire a abonamentului Pro (Stripe subscription.current_period_end).
-- Nullable — userii pe Free nu au niciodată un abonament Stripe activ.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS stripe_subscription_id varchar(255);
