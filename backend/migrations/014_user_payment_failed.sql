-- Marchează ultimul eșec de plată la reînnoirea automată a abonamentului Pro
-- (webhook Stripe invoice.payment_failed), pentru grace period: userul rămâne
-- plan='pro' cât timp Stripe reîncearcă plata automat. Coloana e NULL în mod
-- normal; se setează la now() pe eșec și se resetează la NULL fie la un retry
-- reușit (invoice.payment_succeeded), fie la eșecul final, când webhook-ul
-- existent customer.subscription.deleted trece userul pe plan='free' (nemodificat).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS payment_failed_at timestamp with time zone;
