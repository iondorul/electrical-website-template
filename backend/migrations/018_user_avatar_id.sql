-- Adaugă avatar_id pe users — id-ul unui avatar tematic (electrician) ales
-- dintr-o galerie fixă (vezi AVATAR_CATALOG în frontend/js/shell.js).
-- NULL = niciun avatar ales încă — starea implicită (iconiță generică) rămâne
-- neschimbată. Nu stocăm imagini/fișiere, doar un id validat server-side
-- printr-o listă fixă (VALID_AVATAR_IDS în authController.js).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_id varchar(20);
