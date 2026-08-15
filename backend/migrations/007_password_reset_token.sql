-- Adaugă suport pentru fluxul "Forgot Password": token de resetare (stocat
-- ca hash, nu în clar) cu expirare de 1 oră.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS reset_token_hash character varying(64),
  ADD COLUMN IF NOT EXISTS reset_token_expires_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_users_reset_token_hash
  ON public.users (reset_token_hash);
