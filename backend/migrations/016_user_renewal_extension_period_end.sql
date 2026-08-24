-- Data efectivă de expirare după o "reînnoire anticipată" plătită (buton
-- "Reînnoiește acum" pe erp-plans.html) — un top-up de 1 lună la preț fix
-- (€14.90, Stripe Checkout Session mode:'payment', fără proration), separat
-- de abonamentul Stripe normal (care rămâne neatins și continuă să
-- factureze automat pe propriul lui ciclu). NU citim asta live din Stripe —
-- Stripe subscription.current_period_end nu știe nimic despre acest top-up,
-- deci trebuie persistat local. NULL în mod normal; setat de webhook-ul
-- checkout.session.completed (flow:'renew-now') la vechiul current_period_end
-- + 1 lună; resetat la NULL când abonamentul chiar se încheie
-- (customer.subscription.deleted), ca să nu rămână stale pe un cont
-- redevenit Free.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS renewal_extension_period_end timestamp with time zone;
