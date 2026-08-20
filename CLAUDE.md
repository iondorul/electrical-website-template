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

**13 tabele**, verificate direct din DB (nu din `schema.sql`, care e învechit):
`users`, `clients`, `projects`, `estimates`, `estimate_items`, `quotes`, `quote_items`, `invoices`, `invoice_items`, `payments`, `materials`, `company_settings`, `generated_reports`.

**Enum-uri PostgreSQL reale**: `quote_status` (draft, sent, approved, rejected, expired, canceled), `invoice_status` (draft, issued, partially_paid, paid, overdue, canceled).
**Notă:** `estimates.status` și `projects.status`/`priority` folosesc `CHECK constraint` pe `varchar`, nu enum — inconsistență existentă, de păstrat (nu de "corectat" fără cerere explicită).

**Pattern soft-delete**: `is_active boolean` pe `projects`, `estimates`, `quotes`, `invoices`, `materials`. Tabelele de linii (`*_items`) și `payments` nu au `is_active` — se șterg hard, în cascadă cu părintele (FK `ON DELETE CASCADE`).

**Bani**: `numeric(12,2)` pentru sume, `numeric(10,2)`/`numeric(10,3)` pentru cantități, `numeric(5,2)` pentru procente/TVA. Monedă implicită `EUR`, TVA implicit `19.00`.

### Probleme cunoscute la nivel de schemă — de reținut înainte de orice migrare/deploy

- **`schema.sql` e un dump vechi**, dinainte de modulele Invoices/Payments/Materials — conține doar `clients`, `estimates`, `estimate_items`, `projects`, `quote_items`, `quotes`, `users`. NU folosi acest fișier ca sursă de adevăr pentru schema curentă.
- **`invoices`, `invoice_items`, `payments`, `materials` nu au niciun `CREATE TABLE` în tot repo-ul** (nici în `schema.sql`, nici în `backend/migrations/`) — există doar live, în baza de date locală. Dacă se rulează `schema.sql` + migrările pe o instanță nouă (ex. Neon, la deploy), aceste 4 tabele **vor lipsi**. Necesită o migrare de recuperare înainte de orice deploy real.
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
- `payment-success.html` + `GET /api/stripe/invoice/:sessionId` (returnează `hosted_invoice_url`, cu verificare ownership pe `client_reference_id`/`metadata.userId`).

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

- **Failed payment handling** — niciun flux pentru card refuzat la reînnoirea automată a abonamentului Pro (ex. webhook `invoice.payment_failed`); userul nu e notificat, nu există retry/grace period.
- **Discount-uri la reînnoire** — planificate (10% la angajament 6 luni, 20% la 12 luni), neînceput, scope explicit exclus din task-urile Stripe de până acum.
- **Migrare la producție** — target Frontend → GitHub Pages · Backend → Render · DB → Neon · DNS → Porkbun, planificat dar neimplementat (vezi „Target de hosting" mai sus); necesită și migrarea de recuperare pentru `invoices`/`invoice_items`/`payments`/`materials` (fără `CREATE TABLE` în repo, vezi „Probleme cunoscute la nivel de schemă").
- **SMTP2GO domain verification** — blocată de migrarea DNS către Porkbun (nu poate fi verificat domeniul de trimitere înainte ca DNS-ul să fie efectiv migrat).
