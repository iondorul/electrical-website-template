-- Log persistent pentru erori de billing care nu trebuie să blocheze fluxul
-- userului, dar trebuie verificate manual periodic (nu doar console.error pe
-- server, ușor de ratat). Primul caz de folosire: anularea vechiului abonament
-- lunar eșuează după un switch reușit la plata anuală (checkout.session.completed,
-- flow=yearly-switch) — DB-ul tot indică noul abonament (corect, e cel activ),
-- dar vechiul abonament ar putea rămâne activ în Stripe și să se reînnoiască
-- neintenționat dacă anularea nu reușește.

CREATE TABLE IF NOT EXISTS public.billing_errors (
    id serial PRIMARY KEY,
    user_id integer NOT NULL REFERENCES public.users(id),
    context character varying(100) NOT NULL,
    stripe_subscription_id character varying(255),
    error_message text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_billing_errors_user_id ON public.billing_errors (user_id);
CREATE INDEX IF NOT EXISTS idx_billing_errors_created_at ON public.billing_errors (created_at);
