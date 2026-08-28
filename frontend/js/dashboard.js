// Personalizează banner-ul de bun venit cu numele userului autentificat.
// Ascultă evenimentul emis de shell.js după ce /auth/me răspunde, ca să nu
// mai facă un al doilea apel API redundant. Reținut la nivel de modul ca să
// putem retraduce banner-ul și la schimbarea de limbă (erp:locale-changed),
// fără alt apel API.
let lastDashboardUser = null;

function renderWelcomeBanner(user) {
  const welcomeTitleEl = document.getElementById("welcomeTitle");
  if (!welcomeTitleEl || !user) return;

  const firstName = (user.full_name || "").trim().split(" ")[0] || user.email;
  // Avatarul reflectă alegerea din galeria deschisă în header (shell.js) —
  // needitabil aici, doar afișare. Fără avatar ales, păstrează emoji-ul
  // implicit de dinainte, comportament neschimbat.
  const avatarHtml = user.avatar_id
    ? `<span class="welcome-avatar">${renderAvatarSvg(user.avatar_id)}</span>`
    : "👤";
  const welcomeText = t("dashboard.welcome", "Bine ai revenit, {{name}}!", { name: firstName });
  welcomeTitleEl.innerHTML = `${avatarHtml} ${welcomeText}`;
}

document.addEventListener("erp:user-loaded", (event) => {
  lastDashboardUser = event.detail;
  renderWelcomeBanner(lastDashboardUser);
});

document.addEventListener("erp:locale-changed", () => {
  renderWelcomeBanner(lastDashboardUser);
  renderRecentProjects();
  renderActivityList();
});

// ===========================================================
// DASHBOARD — command center funcțional
//
// Toate datele de mai jos vin din API-urile EXISTENTE ale modulelor FROZEN
// (Clients, Projects, Quotes, Invoices, Reports) — niciun endpoint nou,
// niciun fișier FROZEN atins. Vezi raportul final al task-ului pentru
// justificarea completă a fiecărei surse de date.
// ===========================================================

const dashboardState = {
  clients: [],
  projects: [],
  // Liste "late" (limit mare) de quotes/invoices, folosite DOAR pentru feed-ul
  // de activitate și pentru linkurile "View Quote"/"View Invoice" din modalul
  // de proiect — NU pentru KPI-urile numerice (acelea au apel dedicat, cu
  // total exact din `pagination.totalItems`, indiferent de mărimea reală a
  // datasetului).
  quotesFeed: [],
  invoicesFeed: [],
  recentPaymentsByInvoiceId: {},
  activityEvents: [],
  projectsLoaded: false,
  projectsError: false,
  activityError: false,
  // true după prima construire reușită a feed-ului — vezi
  // reconcileActivityFeedIfLoaded() mai jos.
  activityLoadedOnce: false,
};

let currentProjectSort = "recent";
let currentProjectStatusFilter = "all";
let isRefreshingActivity = false;

let dashboardProjectModal = null;
let dashboardActivityModal = null;

const PROJECT_STATUS_ORDER = ["draft", "planned", "in_progress", "on_hold", "completed", "cancelled"];

const PROJECT_STATUS_META = {
  draft: { cls: "bg-secondary", key: "dashboard.status.draft", fallback: "Draft" },
  planned: { cls: "bg-info text-dark", key: "dashboard.status.planned", fallback: "Planned" },
  in_progress: { cls: "bg-warning text-dark", key: "dashboard.status.inProgress", fallback: "In Progress" },
  on_hold: { cls: "bg-dark", key: "dashboard.status.onHold", fallback: "On Hold" },
  completed: { cls: "bg-success", key: "dashboard.status.completed", fallback: "Completed" },
  cancelled: { cls: "bg-danger", key: "dashboard.status.cancelled", fallback: "Cancelled" },
};

const QUOTE_ACTIVITY_TITLE_KEY = {
  draft: ["dashboard.activity.quoteDraft.title", "Quote Created"],
  sent: ["dashboard.activity.quoteSent.title", "Quote Sent"],
  approved: ["dashboard.activity.quoteApproved.title", "Quote Approved"],
  rejected: ["dashboard.activity.quoteRejected.title", "Quote Rejected"],
  expired: ["dashboard.activity.quoteExpired.title", "Quote Expired"],
  canceled: ["dashboard.activity.quoteCanceled.title", "Quote Canceled"],
};

// --- Helpers ---------------------------------------------------------

// currency_code/currency sunt coloane PostgreSQL CHAR(3) — pot veni cu spații
// de padding dacă vreodată conțin un cod mai scurt de 3 caractere (nu e cazul
// azi, toate sunt "EUR", dar Intl.NumberFormat aruncă RangeError pe un cod
// cu spații, deci normalizăm defensiv, la fel ca invoiceController.js.
function normalizeCurrency(code) {
  return (code || "EUR").trim() || "EUR";
}

function projectValue(p) {
  const raw = p.actual_value != null && p.actual_value !== "" ? p.actual_value : p.estimated_value;
  const v = parseFloat(raw);
  return isNaN(v) ? 0 : v;
}

// Text reutilizat de tooltip-urile CSS (attr(data-tooltip), vezi dashboard.css)
// de pe rândurile din Recent Projects și itemii din System Activity — evaluat
// la fiecare randare (nu cache-uit static), ca să reflecte instant limba
// curentă la schimbare (erp:locale-changed re-randează ambele liste oricum).
function doubleClickTooltipText() {
  return t("dashboard.hint.doubleClickToView", "Double-click to view details");
}

function projectStatusBadge(status) {
  const meta = PROJECT_STATUS_META[status];
  if (!meta) return Utils.escapeHtml(status || "-");
  const label = t(meta.key, meta.fallback);
  return `<span class="badge ${meta.cls}">${Utils.escapeHtml(label)}</span>`;
}

function formatRelativeTime(dateInput) {
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "-";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return Utils.formatDate(dateInput);

  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return t("dashboard.time.justNow", "Just now");
  if (diffMin < 60) return t("dashboard.time.minutesAgo", "{{n}} min ago", { n: diffMin });

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return t("dashboard.time.hoursAgo", "{{n}}h ago", { n: diffHr });

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return t("dashboard.time.yesterday", "Yesterday");
  if (diffDay < 7) return t("dashboard.time.daysAgo", "{{n}} days ago", { n: diffDay });

  return Utils.formatDate(dateInput);
}

function setKpiValue(elId, textOrNumber, isPreformatted) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = isPreformatted
    ? textOrNumber
    : new Intl.NumberFormat(getCurrentLocaleCode()).format(textOrNumber);
  el.classList.remove("kpi-value-error");
  el.removeAttribute("title");
}

function setKpiError(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = "—";
  el.title = t("dashboard.kpi.loadError", "Could not load this value");
  el.classList.add("kpi-value-error");
}

// --- KPI cards ---------------------------------------------------------

// Clienții/proiectele recente (dashboardState.clients/.projects) alimentează
// și feed-ul de activitate (buildActivityFeed(), în afara acestui fișier mai
// jos) — dar sunt încărcate prin apeluri API INDEPENDENTE de cel din
// refreshActivity() (quotes/invoices), fără nicio coordonare explicită între
// ele. Găsit la QA vizual: dacă refreshActivity() termina și randa feed-ul
// ÎNAINTE ca loadClientsKpi()/loadProjectsData() să populeze clients/projects
// (ordine de rezolvare a promise-urilor nedeterministă, depinde de rețea),
// evenimentele "New Client Added"/"New Project Created" lipseau din feed —
// nu din cauza absenței datelor reale, ci a unei curse între două fetch-uri
// independente. reconcileActivityFeedIfLoaded() re-construiește feed-ul de
// fiecare dată când oricare dintre aceste două surse termină de încărcat
// DUPĂ ce feed-ul a fost deja randat o dată — indiferent de ordinea reală de
// rezolvare, rezultatul final converge mereu la feed-ul complet, corect.
function reconcileActivityFeedIfLoaded() {
  if (!dashboardState.activityLoadedOnce || isRefreshingActivity) return;
  dashboardState.activityEvents = buildActivityFeed();
  renderActivityList();
}

async function loadClientsKpi() {
  try {
    const data = await API.get("/clients");
    dashboardState.clients = Array.isArray(data) ? data : [];
    setKpiValue("kpiClientsValue", dashboardState.clients.length);
    reconcileActivityFeedIfLoaded();
  } catch (err) {
    console.error("Eroare la încărcarea clienților (KPI):", err);
    setKpiError("kpiClientsValue");
  }
}

async function loadProjectsData() {
  renderProjectsLoading();
  try {
    const data = await API.get("/projects");
    dashboardState.projects = Array.isArray(data) ? data : [];
    dashboardState.projectsLoaded = true;
    dashboardState.projectsError = false;
    setKpiValue("kpiProjectsValue", dashboardState.projects.length);
    renderRecentProjects();
    reconcileActivityFeedIfLoaded();
  } catch (err) {
    console.error("Eroare la încărcarea proiectelor:", err);
    dashboardState.projectsError = true;
    setKpiError("kpiProjectsValue");
    renderProjectsError();
  }
}

async function loadQuotesKpi() {
  try {
    const res = await API.get("/quotes?status=sent&page=1&limit=1");
    if (res && res.success && res.pagination) {
      setKpiValue("kpiQuotesValue", res.pagination.totalItems);
    } else {
      setKpiError("kpiQuotesValue");
    }
  } catch (err) {
    console.error("Eroare la încărcarea ofertelor deschise (KPI):", err);
    setKpiError("kpiQuotesValue");
  }
}

async function loadInvoicesKpi() {
  try {
    const res = await API.get("/invoices?page=1&limit=1");
    if (res && res.success && res.pagination) {
      setKpiValue("kpiInvoicesValue", res.pagination.totalItems);
    } else {
      setKpiError("kpiInvoicesValue");
    }
  } catch (err) {
    console.error("Eroare la încărcarea facturilor (KPI):", err);
    setKpiError("kpiInvoicesValue");
  }
}

async function loadRevenueKpi() {
  try {
    const res = await API.get("/reports/financial");
    if (res && res.success && res.data && res.data.summary) {
      setKpiValue("kpiRevenueValue", Utils.formatCurrency(res.data.summary.paid || 0), true);
    } else {
      setKpiError("kpiRevenueValue");
    }
  } catch (err) {
    console.error("Eroare la încărcarea veniturilor (KPI):", err);
    setKpiError("kpiRevenueValue");
  }
}

function loadAllKpis() {
  // Fiecare KPI e independent (propriul try/catch, propriul apel API) — un
  // eșec izolat (ex. /reports/financial pică) nu afectează celelalte 4
  // carduri, care rămân funcționale.
  loadClientsKpi();
  loadProjectsData();
  loadQuotesKpi();
  loadInvoicesKpi();
  loadRevenueKpi();
}

// --- Recent Projects: sort/filter/render --------------------------------

function sortProjectsList(list) {
  const arr = list.slice();
  switch (currentProjectSort) {
    case "value":
      arr.sort((a, b) => projectValue(b) - projectValue(a));
      break;
    case "name":
      arr.sort((a, b) => (a.project_name || "").localeCompare(b.project_name || ""));
      break;
    case "status":
      arr.sort(
        (a, b) => PROJECT_STATUS_ORDER.indexOf(a.status) - PROJECT_STATUS_ORDER.indexOf(b.status),
      );
      break;
    case "recent":
    default:
      arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
  return arr;
}

// Numărul de rânduri afișate în widget-ul "Recent Projects" — nu e o listă
// completă (aceea există deja pe projects.html, accesibilă prin "View All"),
// ci un rezumat operațional, la fel cum era gândit și designul static
// dinainte (3 exemple) — extins puțin (8) ca sortarea/filtrarea să aibă
// sens vizibil pe un set mai mare de rezultate.
const RECENT_PROJECTS_LIMIT = 8;

function renderRecentProjects() {
  const tbody = document.getElementById("recentProjectsBody");
  if (!tbody) return;

  if (!dashboardState.projectsLoaded) {
    renderProjectsLoading();
    return;
  }
  if (dashboardState.projectsError) {
    renderProjectsError();
    return;
  }

  let list = dashboardState.projects;
  if (currentProjectStatusFilter !== "all") {
    list = list.filter((p) => p.status === currentProjectStatusFilter);
  }
  list = sortProjectsList(list).slice(0, RECENT_PROJECTS_LIMIT);

  if (list.length === 0) {
    renderProjectsEmpty();
    return;
  }

  const tooltipText = Utils.escapeHtml(doubleClickTooltipText());
  tbody.innerHTML = list
    .map(
      (p) => `
        <tr class="dashboard-clickable-row" data-project-id="${p.id}" tabindex="0">
          <td class="fw-semibold dashboard-row-tooltip-anchor" data-tooltip="${tooltipText}">${Utils.escapeHtml(p.project_name || "-")}</td>
          <td>${Utils.escapeHtml(p.company_name || "-")}</td>
          <td>${projectStatusBadge(p.status)}</td>
          <td class="fw-bold">${Utils.formatCurrency(projectValue(p), normalizeCurrency(p.currency))}</td>
        </tr>
      `,
    )
    .join("");
}

function renderProjectsLoading() {
  const tbody = document.getElementById("recentProjectsBody");
  if (!tbody) return;
  tbody.innerHTML = `
    <tr><td colspan="4" class="text-center text-muted py-4"><span class="spinner-border spinner-border-sm"></span></td></tr>
  `;
}

function renderProjectsEmpty() {
  const tbody = document.getElementById("recentProjectsBody");
  if (!tbody) return;
  tbody.innerHTML = `
    <tr><td colspan="4">
      <div class="dashboard-empty-state">
        <i class="fas fa-folder-open"></i>
        <div>${t("dashboard.empty.noProjects", "No recent projects found.")}</div>
      </div>
    </td></tr>
  `;
}

function renderProjectsError() {
  const tbody = document.getElementById("recentProjectsBody");
  if (!tbody) return;
  tbody.innerHTML = `
    <tr><td colspan="4">
      <div class="dashboard-error-state">
        <i class="fas fa-triangle-exclamation"></i>
        <div>${t("dashboard.error.projectsLoadFailed", "Could not load projects.")}</div>
        <button type="button" class="btn btn-sm btn-outline-danger" id="recentProjectsRetryBtn">${t("common.retry", "Retry")}</button>
      </div>
    </td></tr>
  `;
  const retryBtn = document.getElementById("recentProjectsRetryBtn");
  if (retryBtn) retryBtn.addEventListener("click", loadProjectsData);
}

function updateToolsMenuActiveStates() {
  document.querySelectorAll(".sort-option").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.sort === currentProjectSort);
  });
  document.querySelectorAll(".filter-option").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.status === currentProjectStatusFilter);
  });
}

function initRecentProjectsToolbar() {
  document.querySelectorAll(".sort-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentProjectSort = btn.dataset.sort;
      updateToolsMenuActiveStates();
      renderRecentProjects();
    });
  });
  document.querySelectorAll(".filter-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentProjectStatusFilter = btn.dataset.status;
      updateToolsMenuActiveStates();
      renderRecentProjects();
    });
  });
  const resetBtn = document.getElementById("recentProjectsResetBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      currentProjectSort = "recent";
      currentProjectStatusFilter = "all";
      updateToolsMenuActiveStates();
      renderRecentProjects();
    });
  }

  const tbody = document.getElementById("recentProjectsBody");
  if (!tbody) return;
  tbody.addEventListener("dblclick", (e) => {
    const row = e.target.closest("[data-project-id]");
    if (!row) return;
    const project = dashboardState.projects.find((p) => String(p.id) === row.dataset.projectId);
    if (project) openProjectModal(project);
  });
  tbody.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const row = e.target.closest("[data-project-id]");
    if (!row) return;
    const project = dashboardState.projects.find((p) => String(p.id) === row.dataset.projectId);
    if (project) openProjectModal(project);
  });
}

// --- Project detail modal (READ-ONLY) -----------------------------------

function openProjectModal(project) {
  document.getElementById("dashboardProjectModalTitle").textContent =
    project.project_name || project.project_number || "-";

  const value = projectValue(project);
  const addressParts = [project.address, project.city, project.country].filter(Boolean);

  document.getElementById("dashboardProjectModalBody").innerHTML = `
    <div class="row g-3">
      <div class="col-md-6"><strong>${t("dashboard.modal.projectNumber", "Project #")}:</strong> ${Utils.escapeHtml(project.project_number || "-")}</div>
      <div class="col-md-6"><strong>${t("dashboard.table.status", "Status")}:</strong> ${projectStatusBadge(project.status)}</div>
      <div class="col-md-6"><strong>${t("dashboard.table.client", "Client")}:</strong> ${Utils.escapeHtml(project.company_name || "-")}</div>
      <div class="col-md-6"><strong>${t("dashboard.modal.contactPerson", "Contact")}:</strong> ${Utils.escapeHtml(project.contact_person || "-")}</div>
      <div class="col-md-6"><strong>${t("dashboard.table.value", "Value")}:</strong> ${Utils.formatCurrency(value, normalizeCurrency(project.currency))}</div>
      <div class="col-md-6"><strong>${t("dashboard.modal.priority", "Priority")}:</strong> ${Utils.escapeHtml(project.priority || "-")}</div>
      <div class="col-md-6"><strong>${t("dashboard.modal.startDate", "Start Date")}:</strong> ${Utils.formatDate(project.start_date)}</div>
      <div class="col-md-6"><strong>${t("dashboard.modal.endDate", "End Date")}:</strong> ${Utils.formatDate(project.end_date)}</div>
      ${
        project.completion_date
          ? `<div class="col-md-6"><strong>${t("dashboard.modal.completionDate", "Completed On")}:</strong> ${Utils.formatDate(project.completion_date)}</div>`
          : ""
      }
      ${
        addressParts.length
          ? `<div class="col-12"><strong>${t("dashboard.modal.address", "Address")}:</strong> ${Utils.escapeHtml(addressParts.join(", "))}</div>`
          : ""
      }
      ${
        project.description
          ? `<div class="col-12"><strong>${t("dashboard.modal.description", "Description")}:</strong> ${Utils.escapeHtml(project.description)}</div>`
          : ""
      }
      ${
        project.notes
          ? `<div class="col-12"><strong>${t("dashboard.modal.notes", "Notes")}:</strong> ${Utils.escapeHtml(project.notes)}</div>`
          : ""
      }
    </div>
  `;

  // "View Quote"/"View Invoice" apar DOAR dacă există realmente o ofertă/
  // factură legată de acest proiect (project_id real, din listele deja
  // încărcate pentru feed-ul de activitate) — niciodată butoane
  // "decorative" fără obiect real în spate.
  const hasQuote = dashboardState.quotesFeed.some((q) => q.project_id === project.id);
  const hasInvoice = dashboardState.invoicesFeed.some((inv) => inv.project_id === project.id);

  const buttons = [
    `<button type="button" class="btn btn-light" data-bs-dismiss="modal">${t("common.close", "Close")}</button>`,
    `<a href="clients.html" class="btn btn-outline-secondary"><i class="fas fa-user me-1"></i>${t("dashboard.modal.viewClient", "View Client")}</a>`,
  ];
  if (hasQuote) {
    buttons.push(
      `<a href="quotes.html" class="btn btn-outline-secondary"><i class="fas fa-file-signature me-1"></i>${t("dashboard.modal.viewQuote", "View Quote")}</a>`,
    );
  }
  if (hasInvoice) {
    buttons.push(
      `<a href="invoices.html" class="btn btn-outline-secondary"><i class="fas fa-file-invoice me-1"></i>${t("dashboard.modal.viewInvoice", "View Invoice")}</a>`,
    );
  }
  document.getElementById("dashboardProjectModalFooter").innerHTML = buttons.join("");

  dashboardProjectModal.show();
}

// --- System Activity: build feed from real records ----------------------

function quoteActivityTitle(status) {
  const [key, fallback] = QUOTE_ACTIVITY_TITLE_KEY[status] || QUOTE_ACTIVITY_TITLE_KEY.draft;
  return t(key, fallback);
}

// Pentru facturile plătite, folosim data REALĂ a plății (payments.payment_date,
// preluat separat prin /invoices/:id/payments — vezi fetchRecentPayments) —
// nu doar `invoices.updated_at`, care ar putea reflecta orice altă
// modificare ulterioară a facturii, nu neapărat momentul plății.
async function fetchRecentPayments(invoices) {
  const paidCandidates = invoices
    .filter((inv) => inv.status === "paid")
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 5);

  const map = {};
  await Promise.allSettled(
    paidCandidates.map(async (inv) => {
      try {
        const res = await API.get(`/invoices/${inv.id}/payments`);
        if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
          map[inv.id] = res.data[0]; // deja sortate DESC de backend (payment_date, id)
        }
      } catch (err) {
        console.error(`Eroare la preluarea plăților pentru factura ${inv.id}:`, err);
      }
    }),
  );
  return map;
}

const ACTIVITY_FEED_LIMIT = 8;

function buildActivityFeed() {
  const events = [];

  // Clienți noi — cele mai recente 5 (clients e deja sortat DESC de backend).
  dashboardState.clients.slice(0, 5).forEach((c) => {
    if (!c.created_at) return;
    events.push({
      timestamp: c.created_at,
      title: t("dashboard.activity.newClient.title", "New Client Added"),
      description: t("dashboard.activity.newClient.desc", `Client "${c.company_name}" was added to the CRM.`, {
        name: c.company_name || "-",
      }),
      entityType: "client",
    });
  });

  // Proiecte noi — cele mai recente 5 (projects e deja sortat DESC de backend).
  dashboardState.projects.slice(0, 5).forEach((p) => {
    if (!p.created_at) return;
    events.push({
      timestamp: p.created_at,
      title: t("dashboard.activity.newProject.title", "New Project Created"),
      description: t(
        "dashboard.activity.newProject.desc",
        `Project "${p.project_name}" was created for ${p.company_name}.`,
        { name: p.project_name || "-", client: p.company_name || "-" },
      ),
      entityType: "project",
      entityId: p.id,
    });
  });

  // Oferte — folosim updated_at dacă oferta a fost mutată dintr-un draft
  // (sent/approved/rejected/expired/canceled), altfel created_at (ofertă
  // nouă, încă draft).
  dashboardState.quotesFeed.forEach((q) => {
    const wasProgressed = q.status !== "draft" && q.updated_at && q.updated_at !== q.created_at;
    const timestamp = wasProgressed ? q.updated_at : q.created_at;
    if (!timestamp) return;
    events.push({
      timestamp,
      title: quoteActivityTitle(q.status),
      description: t("dashboard.activity.quote.desc", `Quote ${q.quote_number} for ${q.client_name || "-"}.`, {
        number: q.quote_number,
        client: q.client_name || "-",
      }),
      entityType: "quote",
      entityId: q.id,
    });
  });

  // Facturi — trei tipuri de eveniment, fiecare cu propriul timestamp real:
  // plătită (payment_date real dacă disponibil), trimisă (sent_at), sau nou
  // creată (created_at, pt. facturi încă draft/fără nicio altă tranziție).
  dashboardState.invoicesFeed.forEach((inv) => {
    const currency = normalizeCurrency(inv.currency_code);
    if (inv.status === "paid") {
      const payment = dashboardState.recentPaymentsByInvoiceId[inv.id];
      const timestamp = payment ? payment.payment_date : inv.updated_at;
      const amount = payment ? payment.amount : inv.paid_amount;
      if (!timestamp) return;
      events.push({
        timestamp,
        title: t("dashboard.activity.invoicePaid.title", "Invoice Paid"),
        description: t(
          "dashboard.activity.invoicePaid.desc",
          `Invoice ${inv.invoice_number} (${Utils.formatCurrency(amount, currency)}) marked as paid.`,
          { number: inv.invoice_number, amount: Utils.formatCurrency(amount, currency) },
        ),
        entityType: "invoice",
        entityId: inv.id,
        canDownloadPdf: true,
      });
    } else if (inv.sent_at) {
      events.push({
        timestamp: inv.sent_at,
        title: t("dashboard.activity.invoiceSent.title", "Invoice Sent"),
        description: t(
          "dashboard.activity.invoiceSent.desc",
          `Invoice ${inv.invoice_number} (${Utils.formatCurrency(inv.total_gross, currency)}) sent to ${inv.client_name || "-"}.`,
          {
            number: inv.invoice_number,
            amount: Utils.formatCurrency(inv.total_gross, currency),
            client: inv.client_name || "-",
          },
        ),
        entityType: "invoice",
        entityId: inv.id,
        canDownloadPdf: true,
      });
    } else if (inv.created_at) {
      events.push({
        timestamp: inv.created_at,
        title: t("dashboard.activity.invoiceCreated.title", "Invoice Created"),
        description: t(
          "dashboard.activity.invoiceCreated.desc",
          `Invoice ${inv.invoice_number} (${Utils.formatCurrency(inv.total_gross, currency)}) was created for ${inv.client_name || "-"}.`,
          {
            number: inv.invoice_number,
            amount: Utils.formatCurrency(inv.total_gross, currency),
            client: inv.client_name || "-",
          },
        ),
        entityType: "invoice",
        entityId: inv.id,
        canDownloadPdf: true,
      });
    }
  });

  events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return events.slice(0, ACTIVITY_FEED_LIMIT);
}

function renderActivityList() {
  const listEl = document.getElementById("activityTimelineList");
  if (!listEl) return;

  if (dashboardState.activityError) {
    renderActivityError();
    return;
  }

  const events = dashboardState.activityEvents;
  if (!events || events.length === 0) {
    renderActivityEmpty();
    return;
  }

  const activityTooltipText = Utils.escapeHtml(doubleClickTooltipText());
  listEl.innerHTML = events
    .map(
      (ev, i) => `
        <li class="activity-item dashboard-clickable-row dashboard-row-tooltip-anchor pb-3 mb-3 border-bottom" data-activity-index="${i}" data-tooltip="${activityTooltipText}" tabindex="0">
          <div class="d-flex justify-content-between">
            <span class="fw-semibold">${Utils.escapeHtml(ev.title)}</span>
            <small class="text-muted">${formatRelativeTime(ev.timestamp)}</small>
          </div>
          <p class="text-muted small mb-0">${Utils.escapeHtml(ev.description)}</p>
        </li>
      `,
    )
    .join("");
}

function renderActivityLoading() {
  const listEl = document.getElementById("activityTimelineList");
  if (!listEl) return;
  listEl.innerHTML = `<li class="text-center text-muted py-4"><span class="spinner-border spinner-border-sm"></span></li>`;
}

function renderActivityEmpty() {
  const listEl = document.getElementById("activityTimelineList");
  if (!listEl) return;
  listEl.innerHTML = `
    <li class="dashboard-empty-state">
      <i class="fas fa-clock-rotate-left"></i>
      <div>${t("dashboard.empty.noActivity", "No recent activity found.")}</div>
    </li>
  `;
}

function renderActivityError() {
  const listEl = document.getElementById("activityTimelineList");
  if (!listEl) return;
  listEl.innerHTML = `
    <li class="dashboard-error-state">
      <i class="fas fa-triangle-exclamation"></i>
      <div>${t("dashboard.error.activityLoadFailed", "Could not load recent activity.")}</div>
      <button type="button" class="btn btn-sm btn-outline-danger" id="activityRetryBtn">${t("common.retry", "Retry")}</button>
    </li>
  `;
  const retryBtn = document.getElementById("activityRetryBtn");
  if (retryBtn) retryBtn.addEventListener("click", () => refreshActivity(false));
}

function flashRefreshSuccess() {
  const icon = document.getElementById("activityRefreshIcon");
  if (!icon) return;
  icon.classList.remove("fa-arrows-rotate");
  icon.classList.add("fa-check", "text-success");
  setTimeout(() => {
    icon.classList.remove("fa-check", "text-success");
    icon.classList.add("fa-arrows-rotate");
  }, 900);
}

async function refreshActivity(isManual) {
  if (isRefreshingActivity) return;
  isRefreshingActivity = true;

  const btn = document.getElementById("activityRefreshBtn");
  if (btn) {
    btn.classList.add("is-loading");
    btn.disabled = true;
  }
  dashboardState.activityError = false;
  renderActivityLoading();

  try {
    const [quotesRes, invoicesRes] = await Promise.all([
      API.get("/quotes?page=1&limit=200"),
      API.get("/invoices?page=1&limit=200"),
    ]);

    dashboardState.quotesFeed = quotesRes && quotesRes.success && Array.isArray(quotesRes.data) ? quotesRes.data : [];
    dashboardState.invoicesFeed =
      invoicesRes && invoicesRes.success && Array.isArray(invoicesRes.data) ? invoicesRes.data : [];

    dashboardState.recentPaymentsByInvoiceId = await fetchRecentPayments(dashboardState.invoicesFeed);
    dashboardState.activityEvents = buildActivityFeed();
    dashboardState.activityLoadedOnce = true;
    renderActivityList();

    if (isManual) {
      flashRefreshSuccess();
      Toast.show(t("dashboard.activity.refreshed", "Activity updated."), "success");
    }
  } catch (err) {
    console.error("Eroare la reîmprospătarea activității:", err);
    dashboardState.activityError = true;
    renderActivityError();
    if (isManual) {
      Toast.show(
        t("dashboard.activity.refreshFailed", "Could not refresh activity. Check your connection and try again."),
        "danger",
      );
    }
  } finally {
    isRefreshingActivity = false;
    if (btn) {
      btn.classList.remove("is-loading");
      btn.disabled = false;
    }
  }
}

function initActivityToolbar() {
  const refreshBtn = document.getElementById("activityRefreshBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", () => refreshActivity(true));

  const listEl = document.getElementById("activityTimelineList");
  if (!listEl) return;
  listEl.addEventListener("dblclick", (e) => {
    const item = e.target.closest("[data-activity-index]");
    if (!item) return;
    const ev = dashboardState.activityEvents[parseInt(item.dataset.activityIndex, 10)];
    if (ev) openActivityModal(ev);
  });
  listEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const item = e.target.closest("[data-activity-index]");
    if (!item) return;
    const ev = dashboardState.activityEvents[parseInt(item.dataset.activityIndex, 10)];
    if (ev) openActivityModal(ev);
  });
}

// --- Activity detail modal (READ-ONLY) -----------------------------------

async function downloadInvoicePdf(id, triggerBtn) {
  const originalHtml = triggerBtn ? triggerBtn.innerHTML : null;
  if (triggerBtn) {
    triggerBtn.disabled = true;
    triggerBtn.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;
  }
  try {
    const token = localStorage.getItem("token");
    const response = await fetch(`${CONFIG.API_BASE_URL}/invoices/${id}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || t("dashboard.modal.pdfGenerateFailed", "Could not generate the PDF."));
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  } catch (err) {
    console.error("Eroare la descărcarea PDF-ului:", err);
    Toast.show(err.message || t("dashboard.modal.pdfError", "Error generating the PDF."), "danger");
  } finally {
    if (triggerBtn) {
      triggerBtn.disabled = false;
      triggerBtn.innerHTML = originalHtml;
    }
  }
}

function openActivityModal(ev) {
  document.getElementById("dashboardActivityModalTitle").textContent = ev.title;

  document.getElementById("dashboardActivityModalBody").innerHTML = `
    <div class="row g-3">
      <div class="col-md-6"><strong>${t("dashboard.modal.activityType", "Type")}:</strong> ${Utils.escapeHtml(ev.title)}</div>
      <div class="col-md-6"><strong>${t("dashboard.modal.timestamp", "Timestamp")}:</strong> ${Utils.formatDate(ev.timestamp)} (${formatRelativeTime(ev.timestamp)})</div>
      <div class="col-12"><strong>${t("dashboard.modal.description", "Description")}:</strong> ${Utils.escapeHtml(ev.description)}</div>
      ${
        ev.entityId
          ? `<div class="col-md-6"><strong>${t("dashboard.modal.entityId", "Reference")}:</strong> #${Utils.escapeHtml(String(ev.entityId))}</div>`
          : ""
      }
    </div>
  `;

  const buttons = [`<button type="button" class="btn btn-light" data-bs-dismiss="modal">${t("common.close", "Close")}</button>`];
  if (ev.entityType === "invoice") {
    buttons.push(
      `<a href="invoices.html" class="btn btn-outline-secondary"><i class="fas fa-file-invoice me-1"></i>${t("dashboard.modal.viewInvoice", "View Invoice")}</a>`,
    );
    if (ev.canDownloadPdf) {
      buttons.push(
        `<button type="button" class="btn btn-primary" id="dashboardActivityDownloadPdfBtn" data-invoice-id="${ev.entityId}"><i class="fas fa-download me-1"></i>${t("dashboard.modal.downloadPdf", "Download PDF")}</button>`,
      );
    }
  } else if (ev.entityType === "quote") {
    buttons.push(
      `<a href="quotes.html" class="btn btn-outline-secondary"><i class="fas fa-file-signature me-1"></i>${t("dashboard.modal.viewQuote", "View Quote")}</a>`,
    );
  } else if (ev.entityType === "project") {
    buttons.push(
      `<a href="projects.html" class="btn btn-outline-secondary"><i class="fas fa-folder-open me-1"></i>${t("dashboard.modal.viewProject", "View Project")}</a>`,
    );
  } else if (ev.entityType === "client") {
    buttons.push(
      `<a href="clients.html" class="btn btn-outline-secondary"><i class="fas fa-user me-1"></i>${t("dashboard.modal.viewClient", "View Client")}</a>`,
    );
  }
  document.getElementById("dashboardActivityModalFooter").innerHTML = buttons.join("");

  const downloadBtn = document.getElementById("dashboardActivityDownloadPdfBtn");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => downloadInvoicePdf(downloadBtn.dataset.invoiceId, downloadBtn));
  }

  dashboardActivityModal.show();
}

// --- Init ---------------------------------------------------------------

// Iconițele decorative din titlul fiecărui panou (list-icon la Recent
// Projects, history-icon la System Activity) declanșează EXACT aceeași
// acțiune ca butonul funcțional din dreapta — niciun handler nou, doar un
// .click() pe butonul real (recentProjectsToolsBtn deschide dropdown-ul de
// sort/filter, activityRefreshBtn pornește refreshActivity() cu propriul
// duplicate-guard/loading/success/error deja existent). role="button" +
// tabindex="0" în markup, deci Enter/Space funcționează la fel ca un buton
// nativ.
function wireHeaderIconTrigger(iconId, targetButtonId) {
  const icon = document.getElementById(iconId);
  const targetBtn = document.getElementById(targetButtonId);
  if (!icon || !targetBtn) return;

  // .click() e amânat cu setTimeout(0) INTENȚIONAT — apelat sincron, din
  // interiorul handler-ului de click al iconiței, evenimentul original
  // continuă să urce spre document DUPĂ ce dropdown-ul Bootstrap tocmai s-a
  // deschis (prin click-ul sintetic imbricat), iar listener-ul global
  // "click în afara dropdown-ului" al Bootstrap îl vede și îl închide
  // imediat (deschis+închis în același tick, vizual identic cu "nu s-a
  // întâmplat nimic" — reprodus și confirmat cu Playwright). Amânarea lasă
  // evenimentul original să-și termine complet propagarea înainte ca
  // click-ul real pe buton să pornească.
  icon.addEventListener("click", () => setTimeout(() => targetBtn.click(), 0));
  icon.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    setTimeout(() => targetBtn.click(), 0);
  });
}

function initHeaderIconTriggers() {
  wireHeaderIconTrigger("recentProjectsIconTrigger", "recentProjectsToolsBtn");
  wireHeaderIconTrigger("activityIconTrigger", "activityRefreshBtn");
}

document.addEventListener("DOMContentLoaded", async () => {
  if (window.i18nReady) await window.i18nReady;

  const projectModalEl = document.getElementById("dashboardProjectModal");
  if (projectModalEl) dashboardProjectModal = new bootstrap.Modal(projectModalEl);
  const activityModalEl = document.getElementById("dashboardActivityModal");
  if (activityModalEl) dashboardActivityModal = new bootstrap.Modal(activityModalEl);

  initRecentProjectsToolbar();
  initActivityToolbar();
  initHeaderIconTriggers();

  loadAllKpis();
  refreshActivity(false);
});
