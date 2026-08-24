# ElectricalVPF — CLAUDE.md

Acest fișier oferă context pentru Claude Code (și orice alt asistent AI) atunci când lucrează în acest repo. Informațiile de mai jos reflectă starea reală a proiectului, verificată direct din cod, migrări și baza de date (nu presupuneri).

## Ce este proiectul

Repo-ul conține **două aplicații distincte** în același spațiu:

1. **Site public de prezentare** (rădăcina repo: `index.html`, `about.html`, `service.html`, `pricing.html`, `contact.html`, `404.html` + `css/`, `js/`, `img/`, `lib/`, `scss/`) — template static HTML Codex ("ElectricalVpf — Dăm viață casei tale"), marketing, fără backend.
2. **ElectricalVPF ERP** — aplicație de gestiune pentru firme de electricieni (CRM, estimări, oferte, facturi, materiale, rapoarte), formată din `frontend/` (SPA vanilla JS) + `backend/` (API Express/PostgreSQL).

Tot ce urmează se referă la ERP (`frontend/` + `backend/`), zona activă de dezvoltare.

## Stack tehnologic

**Backend** (`backend/`):
- Node.js + **Express 5**
- **PostgreSQL** via `pg` (Pool, SQL brut — fără ORM)
- Auth: `jsonwebtoken` (JWT, expiry 7d) + `bcrypt`
- PDF-uri: `pdfkit` (fonturi DejaVuSans în `backend/assets/fonts/`)
- Email tranzacțional: `nodemailer` către **SMTP2GO**
- Dev: `nodemon`

**Frontend ERP** (`frontend/`):
- **Vanilla JS**, fără framework, fără build step, fără `package.json`
- O pagină `.html` per modul + un fișier `.js` corespunzător în `frontend/js/`
- **Bootstrap 5.3.7** (CDN) + **Font Awesome 6.7.2** (CDN)
- Font: **Inter** (Google Fonts)

## Structura folderelor

```
backend/
  config/db.js          → pg Pool, citește DB_* din .env
  constants/             → errors.js, statuses.js (nu hardcoda statusuri în controllere)
  controllers/           → un fișier per domeniu (authController, clientController, ...)
  middleware/authMiddleware.js
  migrations/            → scripturi SQL incrementale (ALTER/CREATE), vezi secțiunea DB
  models/                → client.js, project.js, user.js (user.js e gol momentan)
  routes/                → un fișier per domeniu, montate în server.js sub /api/*
  services/               → logica de business + query-uri SQL
  server.js              → entry point Express

frontend/
  *.html                 → o pagină per modul (dashboard, clients, projects, estimating,
                            quotes, invoices, materials, reports, settings, login, register, ...)
  js/*.js                → logica JS a fiecărei pagini (1:1 cu .html)
  js/settings/*Tab.js    → sub-module tab-based pentru settings.html (vezi convenția de mai jos)
  js/config.js           → API_BASE_URL, DEFAULT_PAGE_LIMIT
  components/            → sidebar.html, topbar.html (parțiale reutilizate)
  css/                   → dashboard.css, login.css, reports.css, settings.css

schema.sql                → dump VECHI/PARȚIAL, NU e sursă de adevăr (vezi "Probleme cunoscute")
```

## Pattern arhitectural backend

`routes → controllers → services → db (pg pool, SQL brut)`

- Fiecare modul (clients, projects, estimates, quotes, invoices, materials, company-settings, reports) are propriul `xRoutes.js` + `xController.js` + `xService.js`.
- Constantele (statusuri, coduri de eroare) sunt centralizate în `backend/constants/`, nu hardcodate în controllere.
- Convenție răspuns API: `{ success: boolean, data/message/error }`.
- Autentificare: JWT verificat de `middleware/authMiddleware.js`.

## Pattern frontend: modulul Settings

`frontend/settings.html` + `frontend/js/settings.js` randează un shell generic care citește tab-urile din `window.SettingsTabs` (array populat de fișierele `frontend/js/settings/*Tab.js`, fiecare auto-înregistrându-se). **Adăugarea unui tab nou = un fișier nou + un `<script>` în `settings.html`, fără a atinge `settings.js`.** Tab-uri existente: `accountTab.js`, `billingTab.js` (integrare Stripe reală — afișează planul curent din `users.plan`, data de reînnoire din `/stripe/subscription-status`, badge Pro clickabil către `erp-plans.html`), `companyTab.js`, `privacyTab.js`.

## Baza de date (PostgreSQL, instanță locală `ElectricalVPF`)

**14 tabele**, verificate direct din DB (nu din `schema.sql`, care e învechit):
`users`, `clients`, `projects`, `estimates`, `estimate_items`, `quotes`, `quote_items`, `invoices`, `invoice_items`, `payments`, `materials`, `company_settings`, `generated_reports`, `billing_errors` (migrarea `015_billing_errors.sql` — log persistent pentru erori de billing, ex. anularea eșuată a unui abonament vechi la switch-ul Lunar→Anual, vezi secțiunea Stripe de mai jos).

**Enum-uri PostgreSQL reale**: `quote_status` (draft, sent, approved, rejected, expired, canceled), `invoice_status` (draft, issued, partially_paid, paid, overdue, canceled).
**Notă:** `estimates.status` și `projects.status`/`priority` folosesc `CHECK constraint` pe `varchar`, nu enum — inconsistență existentă, de păstrat (nu de "corectat" fără cerere explicită).

**Pattern soft-delete**: `is_active boolean` pe `projects`, `estimates`, `quotes`, `invoices`, `materials`. Tabelele de linii (`*_items`) și `payments` nu au `is_active` — se șterg hard, în cascadă cu părintele (FK `ON DELETE CASCADE`).

**Bani**: `numeric(12,2)` pentru sume, `numeric(10,2)`/`numeric(10,3)` pentru cantități, `numeric(5,2)` pentru procente/TVA. Monedă implicită `EUR`, TVA implicit `19.00`.

### Probleme cunoscute la nivel de schemă — de reținut înainte de orice migrare/deploy

- **`schema.sql` e un dump vechi**, dinainte de modulele Invoices/Payments/Materials — conține doar `clients`, `estimates`, `estimate_items`, `projects`, `quote_items`, `quotes`, `users`. NU folosi acest fișier ca sursă de adevăr pentru schema curentă.
- **`invoices`, `invoice_items`, `payments`, `materials` nu aveau niciun `CREATE TABLE` în repo** — rezolvat prin migrarea `013_recover_missing_tables.sql` (20 august 2026), care le recreează exact (inclusiv enum-ul `invoice_status`), reprodusă din `pg_dump --schema-only` pe DB-ul local. Coloanele/indexul adăugate ulterior de `003`/`004` (`sent_at`, `sent_to_email`, `min_stock`, `idx_payments_invoice_id`) au fost mutate direct în `013`, iar `003`/`004` au fost editate să nu mai presupună că tabelele există deja (altfel ar eșua pe o instanță nouă, unde rulează înaintea lui `013`).
  **Idempotentă** (fix aplicat 20 august 2026, găsit la code review): `013` rulează sigur atât pe o instanță nouă/goală, cât și pe una unde obiectele există deja live (ex. DB-ul local curent). `CREATE TABLE`/`CREATE SEQUENCE`/`CREATE INDEX` folosesc `IF NOT EXISTS`; `CREATE TYPE` și `ADD CONSTRAINT` (PK/FK, fără echivalent nativ `IF NOT EXISTS` în PostgreSQL) sunt învelite în `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` (blocurile de PRIMARY KEY prind și `invalid_table_definition` — eroarea reală la re-adăugarea unui PK, diferită de `duplicate_object` de la FK); trigger-ele folosesc `CREATE OR REPLACE TRIGGER` (PostgreSQL 14+, compatibil Neon). Verificat: `schema.sql` + toate migrările pe DB nou/gol, apoi re-rulare completă a lui `013` pe același DB deja migrat (exit 0, doar `NOTICE: already exists, skipping`), plus `pg_dump --schema-only` identic cu DB-ul local original după re-rulare (fără duplicate).
- Numerotarea migrărilor are duplicate: există câte două fișiere `004_*` și `005_*` (`004_reports_prerequisites.sql`/`004_user_profile_fields.sql`, `005_generated_reports.sql`/`005_user_trial_started_at.sql`) — aplicate cu succes local, dar convenția de numerotare nu mai e strict secvențială.
- Nu există trial — doar planurile `free`/`pro` (`users.plan`). Migrarea 005 adăugase `trial_started_at`, dar nicio logică de acces temporar Pro n-a fost vreodată implementată pe ea; coloana e eliminată prin migrarea 011 (DROP COLUMN).

## Configurare / secrete

- `backend/.env` (gitignored): `PORT`, `FRONTEND_URL`, `DB_HOST/PORT/NAME/USER/PASSWORD`, `JWT_SECRET`, `SMTP_HOST/PORT/SECURE/USER/PASS/FROM`.
- `frontend/js/config.js`: `API_BASE_URL` (hardcodat la `http://localhost:3000/api` — de actualizat manual la deploy).
- CORS este momentan **deschis** (`app.use(cors())` fără restricție de origin în `server.js`) — de restricționat explicit la domeniul de producție înainte de go-live.

## Target de hosting (planificat, nu încă implementat)

Frontend → GitHub Pages · Backend → Render · DB → Neon (PostgreSQL) · DNS → Porkbun (`electricalvpf.com`, vezi `CNAME`) · Email → SMTP2GO. Cost țintă $0/lună la pornire. Lucrul curent se face **local** — nu presupune că vreun pas de deploy a fost deja făcut fără confirmare explicită.

## Convenții de cod

- `snake_case` în DB și payload-uri API; `camelCase` în variabile/funcții JS.
- Texte user-facing predominant în română; identificatori de cod și multe comentarii în engleză.
- Fără framework frontend, fără bundler — nu introduce dependențe noi (npm packages, CDN-uri noi) fără să fie necesar explicit pentru task.
- Reutilizează stilurile CSS existente (variabile precum `--primary`, `--text`, `--muted`, `--border` din `login.css` etc.) în loc să hardcodezi culori noi.

### Principiu de design UI (ElectricalVPF) — regulă permanentă

Contrastul vine din spațiere și claritate, nu din culori tari sau border-uri groase. Elementele importante nu trebuie să "urle" vizual — premium înseamnă calm, discret, cu respirație. Evită border-uri peste 1px, umbre puternice, sau culori saturate pe elemente secundare.

Se aplică la orice element nou de UI creat de acum înainte, fără să fie nevoie să fie repetat explicit în fiecare task.

## Reguli importante / componente FROZEN

**Modulele Clients, Projects, Estimating, Quotes, Invoices, Materials și Reports sunt FROZEN** — implementări de referință, confirmate funcționale. **NU le modifica, NU le atinge, NU ghici structuri de schemă sau endpoint-uri din ele** fără verificare explicită și acord prealabil. Orice task care le menționează tangențial trebuie limitat strict la scope-ul cerut, fără a atinge cod din aceste module.

Module NEFROZEN, unde lucrul activ e permis: Login/Auth, Register, Settings (inclusiv tab-urile sale), Dashboard — dar verifică mereu cu utilizatorul înainte de schimbări structurale mari.

## Alte observații

- `estimates` are atât `user_id` (NOT NULL) cât și `created_by` (nullable) — ambele referențiază `users.id`; posibilă redundanță istorică, de păstrat ca atare.
- Controller-ul `paymentController`/`paymentService` gestionează **plăți pe facturi** (client → firmă), un concept diferit de tab-ul "Abonament & Plăți" din Settings (care e billing SaaS, acum conectat real la Stripe — vezi secțiunea de progres de mai jos).

## Progres — funcționalități implementate (istoric, cronologic pe module)

### Stripe & Planuri (Free/Pro)
- Integrare Stripe completă: `stripe.checkout.sessions.create` (mode subscription) + webhook cu verificare semnătură (`express.raw` montat doar pe `/api/stripe/webhook`, înaintea `express.json()` global). La `checkout.session.completed`, userul trece pe `plan='pro'`.
- Coloană `users.plan` (migrarea `008_user_plan.sql`) + `backend/middleware/planLimitMiddleware.js` pentru enforcement limite Free vs Pro (clients, quotes — montat direct pe rutele respective în `server.js`).
- Coloană `users.stripe_subscription_id` (migrarea `010_user_stripe_subscription_id.sql`) + `GET /api/stripe/subscription-status` (returnează `currentPeriodEnd` + `downgradeScheduled`).
- **Fix Stripe API "Basil"** (versiune `2025-03-31.basil`+, folosită implicit de `stripe` v22.5.0): `subscription.current_period_end` a fost mutat pe `subscription.items.data[0].current_period_end`. Rezolvat prin helper-ul `extractSubscriptionPeriodEnd()` în `stripeController.js`, cu fallback pe locația veche.
- **Flux complet "Downgrade to Free"** (TDD — 7 teste Jest în `backend/controllers/stripeController.test.js`, plus verificare live end-to-end cu Stripe test-mode real + DB, nu doar teste automate):
  - `POST /api/stripe/schedule-downgrade` → `stripe.subscriptions.update(id, { cancel_at_period_end: true })` + `users.downgrade_scheduled = true` (userul rămâne `plan='pro'`, păstrează accesul).
  - `POST /api/stripe/cancel-scheduled-downgrade` → revine la `cancel_at_period_end: false` + `downgrade_scheduled = false`.
  - Webhook `customer.subscription.deleted` (declanșat de Stripe la expirarea reală a perioadei) → `plan='free'`, `stripe_subscription_id=NULL`, `downgrade_scheduled=false`.
  - Migrarea `012_user_downgrade_scheduled.sql` (coloană `users.downgrade_scheduled boolean DEFAULT false`).
  - Ambele apeluri Stripe sunt "fail-safe": dacă apelul către Stripe eșuează, DB nu se modifică deloc (niciun UPDATE silențios/incorect).
- UI `frontend/erp-plans.html`: carduri Free/Pro cu feature-listă, buton "Upgrade la Pro" → `erp-upgrade.html` → Stripe Checkout, buton "Downgrade la Free" → modal de confirmare cu dată reală de expirare (din `/stripe/subscription-status`), stare dinamică "Downgrade programat pentru [dată]" + buton "Anulează downgrade-ul programat", mesaje de eroare inline (fără schimbare silențioasă de plan la eroare Stripe). Stiluri: `.erp-plan-cta` + modificatori `-solid`/`-outline` în `frontend/css/erp-plans.css`.
- **Data de reînnoire/expirare lângă "Plan curent"** (`frontend/erp-plans.html` + `frontend/css/erp-plans.css`, 20 august 2026): element `#proPlanDateInfo`, populat din același răspuns `/stripe/subscription-status` deja preluat pentru textul din modalul de downgrade — fără request nou. `downgradeScheduled=true` → "Expiră la data de [X]"; `downgradeScheduled=false` și `paymentFailedAt` gol → "Reînnoire la data de [X]"; dacă `paymentFailedAt` e setat, NU se afișează "Reînnoire" (ar fi derutant să sugereze reînnoire automată garantată cât timp o plată chiar a eșuat — avertismentul dedicat există deja separat, în `billingTab.js`).
  Poziționat deasupra butonului "Plan curent" (nu dedesubt), centrat orizontal (`text-align: center`), iconiță `far fa-clock` (contur, nu solid — variantă aleasă explicit după comparație vizuală cu `fas fa-arrows-rotate`), culoare `#ff6b00` (același portocaliu ca `.erp-plan-cta-solid`/`.erp-plan-badge` — hardcodat, nicio variabilă CSS nu-l expune pe această pagină: `--primary` există doar în `login.css`, neîncărcat aici, iar `erp-plans.css` însuși nu folosește o variabilă pentru acest portocaliu nicăieri), font-size `.75rem` (~13% mai mic decât restul cardului, icoana se scalează proporțional din moștenire, fără CSS suplimentar). Clasă nouă reutilizabilă `.erp-plan-date-info` în `erp-plans.css`.
  Aliniere cu butonul "Downgrade la Free" de pe cardul Free: cardul Free primește un placeholder invizibil identic structural (`.erp-plan-date-info` + aceeași iconiță, `visibility: hidden`), altfel cele două butoane se dezaliniau vertical de fiecare dată când cardul Pro afișa text deasupra. Rămâne un decalaj sub-pixel (~2px) pre-existent, cauzat de `transform: scale(1.03)` + `padding-top` diferit (44px vs 36px) pe `.erp-plan-card-pro` — design dinainte de acest task, neatins.
  Spațiul de deasupra ambelor butoane redus cu 38px (~1cm) prin reducerea marginilor `.erp-plan-name`/`.erp-plan-price`/`.erp-plan-desc` (partajate de ambele carduri) — `min-height: 38px` de pe `.erp-plan-desc` neatins (garantează alinierea chiar dacă descrierile Free/Pro au lungimi diferite).
  Verificat live, cu screenshot-uri Playwright, pentru toate stările: reînnoire activă, downgrade programat, plată eșuată (element ascuns), aliniere Free/Pro.
- **Switch Lunar → Anual, prin Stripe Checkout Session nou** (`erp-plans.html`, `payment-success.html`, `stripeController.js`, `stripeRoutes.js`, migrarea `015_billing_errors.sql`, 21 august 2026):
  - `STRIPE_PRICE_ID_PRO_YEARLY` în `backend/.env` (`price_1U6lUuLzxL1rZrebS4E2uRG9`, €143.04/an, 20% discount față de lunar — lookup key Stripe `electricalvpf_pro_yearly`, nefolosit în cod, doar identificare în Dashboard), alături de `STRIPE_PRICE_ID_PRO` (lunar) existent.
  - UI: toggle Lunar/Anual pe cardul Pro (`.erp-billing-toggle`, deasupra prețului). Când userul Pro (lunar) comută pe Anual, butonul "Plan curent" devine **"Trece la plata anuală"** (`#proPlanCtaSlot`, swap prin `outerHTML`).
  - **Decizie arhitecturală deliberată**: NU `stripe.subscriptions.update()` direct pe abonamentul existent (variantă implementată inițial, apoi înlocuită complet) — ci un **Checkout Session nou** (`mode: 'subscription'`), la fel ca la upgrade-ul inițial Free→Pro. Motiv: transparență identică cu o plată normală (userul vede suma, cardul, confirmă explicit pe pagina Stripe) și gestionare SCA/3D Secure 100% nativă de Stripe, fără cod manual de confirmare PaymentIntent.
  - `POST /api/stripe/switch-to-yearly` (`switchToYearly` în `stripeController.js`, autentificat): `stripe.subscriptions.retrieve()` pe abonamentul curent → citește `customer` (ca noul Checkout Session să folosească același Stripe Customer, nu unul nou) → **safeguard anti-dublă-taxare**: dacă item-ul curent e deja pe `STRIPE_PRICE_ID_PRO_YEARLY`, respinge cu 400 fără să creeze vreo sesiune → `stripe.checkout.sessions.create({ mode: 'subscription', customer, line_items: [{ price: STRIPE_PRICE_ID_PRO_YEARLY }], client_reference_id: userId, metadata: { userId, flow: 'yearly-switch', oldSubscriptionId }, success_url: '.../payment-success.html?type=yearly-switch&session_id={CHECKOUT_SESSION_ID}', cancel_url: '.../erp-plans.html?canceled=true' })` → răspunde `{ success: true, url: session.url }` (identic ca `createCheckoutSession`). Frontend-ul doar redirecționează (`window.location.href = response.url`) — nicio stare de succes de gestionat local, pagina navighează către Stripe.
  - **Efect secundar important**: un Checkout Session nou creează un **abonament Stripe separat**, nu modifică cel existent. Vechiul abonament lunar e anulat abia în webhook, după confirmarea plății (nu în endpoint-ul de creare a sesiunii) — altfel, dacă userul închide tab-ul de checkout înainte de a plăti, ar rămâne fără niciun abonament activ.
  - Webhook `checkout.session.completed` (`handleWebhook`), ramură nouă condiționată de `session.metadata.flow === 'yearly-switch'`: `UPDATE users SET stripe_subscription_id = <nou>, downgrade_scheduled = false, payment_failed_at = NULL` (NU atinge `plan`, deja `'pro'`) → apoi, în try/catch propriu, `stripe.subscriptions.cancel(oldSubscriptionId)`. Ramura originală Free→Pro (fără `metadata.flow`) rămâne neschimbată.
  - **Log persistent pentru eșecul anulării vechiului abonament** — tabelă nouă `billing_errors` (migrarea `015`, coloane `user_id`, `context`, `stripe_subscription_id`, `error_message`, `created_at`). Dacă `subscriptions.cancel()` pe vechiul abonament eșuează, nu doar `console.error` (ușor de ratat) — se scrie și un rând în `billing_errors` (context `yearly_switch_old_subscription_cancel_failed`), verificabil manual periodic cu un `SELECT * FROM billing_errors`. DB-ul tot indică noul abonament (corect, e cel activ plătit), dar fără acest log, un eșec de anulare ar trece neobservat și vechiul abonament ar putea rămâne activ, reînnoindu-se neintenționat.
  - **Fără proration, fără credit, fără refund** — factura veche lunară rămâne neatinsă; se generează o factură nouă, integrală (€143.04), plătită imediat, pe abonamentul nou. Politică deliberată: "what you see is what you get".
  - `payment-success.html`: mesaj diferit pentru acest flux, diferențiat prin parametrul `?type=yearly-switch` din `success_url` (ales în locul verificării metadatelor sesiunii — fără request suplimentar doar ca să afle tipul). Dacă `type === "yearly-switch"`: badge "Plan Anual activat", titlu "Ai trecut cu succes la planul Anual! 🎉", descriere cu data reală de reînnoire (fetch nou la `/stripe/subscription-status`, cu degradare grațioasă — omite propoziția cu data dacă webhook-ul n-a apucat încă să ruleze, aceeași race condition deja acceptată de fluxul existent Free→Pro).
  - **Rezolvat ulterior** (task separat, 21 august 2026): la momentul implementării inițiale, toggle-ul revenea mereu pe Lunar la reload (nicio coloană DB/citire Stripe nu expunea intervalul real). Fixat prin `billingInterval` în `getSubscriptionStatus` — vezi bullet-ul „Switch Anual → Lunar" de mai jos pentru sincronizarea completă (toggle + CTA simetric, la load și la fiecare click).
  - **Verificat live, end-to-end, cu Stripe test-mode real, prin browser (Playwright) — checkout complet, cu card de test real** (nu doar teste automate — niciun test Jest scris încă pentru acest endpoint): sesiune Stripe Checkout reală creată și completată (card `4242 4242 4242 4242`), redirect confirmat către `payment-success.html?type=yearly-switch&session_id=...` cu mesajul corect și data reală; abonament nou confirmat activ pe `price_1U6lUuLzxL1rZrebS4E2uRG9` cu factură `"status": "paid"`, `"amount_paid": 14304` (€143.04); abonamentul vechi confirmat `"status": "canceled"`; `billing_errors` confirmat gol (0 rânduri, anulare reușită). Toate verificate direct din Stripe CLI (`stripe subscriptions retrieve`/`stripe invoices list`), nu doar din răspunsul API-ului propriu.
- **Switch Anual → Lunar, direct pe abonament (fără checkout, fără taxare imediată)** (`erp-plans.html`, `stripeController.js`, `stripeRoutes.js`, 21 august 2026): deliberat **opus arhitectural** față de `switchToYearly` de mai sus — nu creează Checkout Session/abonament nou, ci `stripe.subscriptions.update()` direct pe abonamentul existent (`items: [{ id, price: STRIPE_PRICE_ID_PRO }]`, `proration_behavior: 'none'`, FĂRĂ `billing_cycle_anchor`). Efect: userul păstrează accesul Pro până la finalul perioadei anuale deja plătite (fără refund/proration), iar abia la reînnoirea următoare Stripe facturează automat la prețul lunar — nicio factură nouă generată acum. Aceeași subscripție, neschimbată (`stripe_subscription_id` nu se atinge), deci fără nevoie de `billing_errors`/anulare de abonament vechi (spre deosebire de switchToYearly).
  - `POST /api/stripe/switch-to-monthly` (`switchToMonthly`, autentificat) — safeguard simetric (dacă deja pe lunar, 400 fără apel Stripe).
  - `GET /stripe/subscription-status` extins cu `billingInterval` (`'month'`/`'year'`/`null`), citit direct din `subscription.items.data[0].price.recurring.interval` — fără apel Stripe suplimentar (subscription era deja preluat pentru `currentPeriodEnd`), fără coloană DB nouă.
  - **CTA complet simetric pe cardul Pro**, la load și la fiecare click pe toggle: dacă intervalul afișat de toggle == intervalul real (`billingInterval`) → "Plan curent" (inert, outline); dacă diferă → buton de acțiune (solid) în direcția corectă, "Trece la plata anuală" sau "Trece la plata lunară". Fallback sigur pe `month` dacă `billingInterval` e încă necunoscut. Elimină bug-ul inițial în care butonul "Trece la plata lunară" apărea greșit chiar și când toggle-ul deja reflecta starea reală anuală.
  - **Modal de confirmare** (`#switchToMonthlyConfirmModal`, pattern Bootstrap identic cu `downgradeConfirmModal`) înainte de request — text populat dinamic la `show.bs.modal` cu data reală (`realCurrentPeriodEnd`): "Nu vei fi taxat acum. Rămâi cu acces Pro complet până la [dată]..." + "Începând cu [aceeași dată], abonamentul tău se va reînnoi lunar, la €14.90/lună...". Butoane `.erp-plan-cta-solid`/`-outline` (regulă CSS nouă `.modal-footer .erp-plan-cta` — auto-width/inline, nu block ca pe carduri). Escape și click-în-afară verificate funcțional (Bootstrap default, fără JS suplimentar).
  - **Fără niciun mesaj de avertisment** la comutarea preview pe Lunar (decizie explicită, simplificată ulterior — inițial exista un text "Vei pierde 20%...", eliminat complet: la preview Lunar cu stare reală Anual, se afișează doar prețul normal €14.90/lună, exact ca la orice alt user).
  - Verificat live, end-to-end, cu date reale: `switchToMonthly` confirmat funcțional (`interval` schimbat pe `subscription.items.data[0].price`, `status: "active"` neschimbat, nicio factură nouă), modalul confirmat cu Playwright pe toate interacțiunile (deschidere cu textul corect, Escape, click-în-afară, confirmare reală).
  - **Fără teste Jest** pentru niciuna din cele două direcții (`switchToYearly`/`switchToMonthly`) — doar verificare live.
  - **⚠️ Lecție din depanare**: în timpul verificării, au apărut temporar taxări reale suplimentare neexplicate — s-a dovedit a fi testare manuală concurentă a userului în propriul browser (port 5501), în paralel cu sesiunea Playwright (port 5500), ambele lovind același cont Stripe de test. Nu era bug de cod. **Nu presupune că ești singurul care testează contul Stripe de test local** — verifică `stripe subscriptions list --customer <id> --status all` înainte să tragi concluzii dintr-o stare neașteptată.
  - **⚠️ Avertisment pentru testare viitoare**: abonamentul de test curent al userului `id=1` (`iondoruno@gmail.com`) e `sub_1U6s9KLzxL1rZrebUXbzFqaF`, în prezent pe **lunar** (`price_1U5inqLzxL1rZrebTZE6YF7X`) — schimbat efectiv, nu simulare. Abonamentele anterioare (`sub_1U67lmLzxL1rZrebgtFHUEwy`, `sub_1U6qoyLzxL1rZreb2wrktZ6N`, `sub_1U6s4xLzxL1rZrebpqAL0NGb`) sunt toate `canceled`, nu mai pot fi refolosite. Pentru resetare rapidă între teste (fără cost, fără checkout): `stripe subscriptions update <subscription_id> -d "items[0][id]=<item_id>" -d "items[0][price]=<price_id>" -d "proration_behavior=none"`.
- `payment-success.html` + `GET /api/stripe/invoice/:sessionId` (returnează `hosted_invoice_url`, cu verificare ownership pe `client_reference_id`/`metadata.userId`).

### Failed Payment / Grace Period (20 august 2026)
- Principiu: payment failed ≠ downgrade imediat. Userul rămâne `plan='pro'` cât timp Stripe face retry-uri automate; accesul se pierde doar la eșecul final, prin webhook-ul existent `customer.subscription.deleted` (logica de plan/downgrade nemodificată — vezi mai jos pentru singura completare adusă acestui handler).
- Migrarea `014_user_payment_failed.sql` (aplicată local): coloană `users.payment_failed_at` (timestamp with time zone, nullable).
- Webhook `invoice.payment_failed` (`stripeController.js`, `handleWebhook`): `UPDATE users SET payment_failed_at = NOW() WHERE stripe_subscription_id = $1` — NU schimbă `plan`, NU schimbă `downgrade_scheduled` — apoi trimite email prin `sendPaymentFailedEmail()` (nou, în `services/emailService.js`, Nodemailer/SMTP2GO). Fail-safe: DB și email sunt în try/catch-uri proprii, izolate de catch-ul general al webhook-ului — orice eroare doar se loghează, răspunsul rămâne `res.json({ received: true })` (200) în toate cazurile, ca să nu declanșeze retry-uri Stripe pe webhook-ul însuși.
- Webhook `invoice.payment_succeeded` (nou): resetează `payment_failed_at = NULL` la același `stripe_subscription_id`, cu același fail-safe.
- Ambele handler-e folosesc helper-ul nou `extractInvoiceSubscriptionId()` (analog cu `extractSubscriptionPeriodEnd()`) — Stripe API "Basil" a mutat legătura invoice→subscription pe `invoice.parent.subscription_details.subscription`; helper-ul citește ambele locații.
- `GET /api/stripe/subscription-status` (`getSubscriptionStatus`) extins să expună și `paymentFailedAt` (ISO string sau `null`), citit direct din DB, fără apel Stripe suplimentar — inclus în toate ramurile răspunsului (succes, fără abonament, eroare Stripe).
- UI `frontend/js/settings/billingTab.js`, `templatePro()`: container `#billingPaymentFailedBanner`, populat din același răspuns `/stripe/subscription-status` deja folosit pentru data reînnoirii. Dacă `paymentFailedAt` nu e null, afișează un banner discret (Bootstrap `alert alert-warning`): "Ultima plată a eșuat. Stripe va reîncerca automat plata în zilele următoare — nu trebuie să faci nimic acum." Verificat manual live (setare/resetare `payment_failed_at` pe user de test local, prin browser) — banner-ul apare/dispare corect, fără să blocheze restul interfeței.
- TDD — 8 teste Jest noi în `backend/controllers/stripeController.test.js` (`invoice.payment_failed`: happy path + fallback Basil + user negăsit + eșec DB + eșec email; `invoice.payment_succeeded`: happy path + subscription_id neidentificabil + eșec DB) — toate cele 15 teste (7 existente + 8 noi) trec fără regresii.
- Buton "Extinde abonamentul" (fost "Reînnoiește abonamentul acum") în `templatePro()` — redenumit pentru claritate față de mesajul "Abonamentul se reînnoiește automat lunar" de deasupra; rămâne UI static, fără acțiune reală în spate (`Toast.show("Extinderea abonamentului va fi disponibilă în curând.")`) — logica reală de extindere e task separat, neînceput.
- **Fix `payment_failed_at` stale** (găsit la code review, aplicat 20 august 2026): `customer.subscription.deleted` și `checkout.session.completed` (`stripeController.js`, `handleWebhook`) resetează acum și ele `payment_failed_at = NULL`, alături de câmpurile pe care le atingeau deja (`plan`, `stripe_subscription_id`, `downgrade_scheduled` la primul; `plan`, `stripe_subscription_id` la al doilea). Elimină scenariul în care un user care pierde abonamentul (eșec final) și apoi se reabonează vedea fals bannerul "Ultima plată a eșuat" pe un abonament nou, sănătos, până la următoarea reînnoire. Teste noi în `stripeController.test.js`: testul existent pentru `customer.subscription.deleted` extins să verifice `payment_failed_at = NULL` în SQL; `describe` nou pentru `checkout.session.completed` (nu avea niciun test înainte) — happy path (toate 3 coloanele + parametrii corecți) + cazul fără `userId` identificabil. 17 teste trec în total (15 anterioare + 2 noi), fără regresii.

### Eliminare trial
- `trial_started_at` eliminat complet — cod (backend + frontend) și coloană DB (migrarea `011_drop_trial_started_at.sql`, `DROP COLUMN`). Doar planurile `free`/`pro` există; nicio logică de acces temporar Pro.

### Auth & sesiune
- Auth guard consistency (`js/shell.js`, `js/settings/accountTab.js`, `js/settings/billingTab.js`): logout forțat (`performLogout()`) doar pe `401`/`403` explicit de la `/auth/me` — NU pe erori de rețea/timeout/5xx, ca sesiunea să rămână activă la un restart scurt de backend.

### Alte module finalizate anterior (FROZEN, neatinse recent — vezi secțiunea de mai jos)
- Clients, Projects, Estimating, Quotes, Invoices, Materials, Reports.
- Send Invoice (PDF via `pdfkit`, fonturi DejaVu Sans, trimitere prin `nodemailer`/SMTP2GO).
- Forgot Password / Reset Password (migrarea `007_password_reset_token.sql`, email prin SMTP2GO).
- Register page cu validare live.
- Dynamic header/sidebar shell (`js/shell.js`, apel `GET /api/auth/me`, evenimentul `erp:user-loaded`).

## Ce rămâne de implementat

- **Discount 10% la angajament 6 luni** — planificat, neînceput. Discount-ul de 20% la 12 luni e acum implementat (`STRIPE_PRICE_ID_PRO_YEARLY`, switch Lunar→Anual, vezi „Stripe & Planuri" mai sus); rămâne doar varianta de 6 luni.
- **Teste Jest pentru switch-ul Lunar↔Anual (ambele direcții)** — niciuna din `switchToYearly` (Checkout Session + ramura `yearly-switch` din webhook, inclusiv anularea vechiului abonament + logging în `billing_errors`) sau `switchToMonthly` (`subscriptions.update` direct) nu are teste automate — doar verificare live, end-to-end, cu Stripe test-mode real (spre deosebire de restul fluxurilor Stripe din `stripeController.test.js`, toate acoperite de TDD).
- **Migrare la producție** — target Frontend → GitHub Pages · Backend → Render · DB → Neon · DNS → Porkbun, planificat dar neimplementat (vezi „Target de hosting" mai sus). Schema pentru `invoices`/`invoice_items`/`payments`/`materials` e acum recuperată și idempotentă (migrarea `013`, vezi „Probleme cunoscute la nivel de schemă").
- **SMTP2GO domain verification** — blocată de migrarea DNS către Porkbun (nu poate fi verificat domeniul de trimitere înainte ca DNS-ul să fie efectiv migrat).
