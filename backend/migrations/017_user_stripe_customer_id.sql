-- Adaugă stripe_customer_id pe users — istoric permanent al Stripe Customer
-- asociat userului, necesar pentru GET /api/stripe/invoices (stripe.invoices.list
-- cere un customer explicit). Spre deosebire de stripe_subscription_id (golit la
-- customer.subscription.deleted), această coloană NU se șterge niciodată — altfel
-- s-ar pierde legătura cu istoricul de facturi al unui user care și-a anulat
-- complet abonamentul. Nullable — userii Free fără nicio plată încă nu au unul.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS stripe_customer_id varchar(255);
