document.addEventListener("DOMContentLoaded", async () => {
  const periodPreset = document.getElementById("periodPreset");
  const dateFrom = document.getElementById("dateFrom");
  const dateTo = document.getElementById("dateTo");
  const customDateFields = document.querySelectorAll(".custom-date-field");
  const filterClient = document.getElementById("filterClient");
  const filterProject = document.getElementById("filterProject");
  const btnGenerate = document.getElementById("btnGenerate");
  const btnGenerateReport = document.getElementById("btnGenerateReport");
  const tabButtons = document.querySelectorAll("#reportsTabs .nav-link");
  const archiveTableBody = document.getElementById("archiveTableBody");
  const archiveSearch = document.getElementById("archiveSearch");
  const archiveTypeFilter = document.getElementById("archiveTypeFilter");

  let activeTab = "financial";
  let financialChart = null;
  let currentUserRole = null;
  let lastArchiveRows = [];
  let reportIdPendingDelete = null;

  const TYPE_BADGE = {
    financial: "primary",
    projects: "info text-dark",
    materials: "warning text-dark",
    clients: "success",
  };

  function setGenerateReportDisabled(isDisabled) {
    btnGenerateReport.disabled = isDisabled;
    btnGenerateReport.classList.toggle("reports-btn-disabled", isDisabled);
  }

  document.addEventListener("erp:user-loaded", (e) => {
    currentUserRole = e.detail?.role || null;
    if (activeTab === "archive") renderArchiveRows();
  });

  let deleteReportModalInstance = null;
  const deleteReportModalEl = document.getElementById("deleteReportModal");
  if (deleteReportModalEl) {
    deleteReportModalInstance = new bootstrap.Modal(deleteReportModalEl);
  }
  const btnConfirmDeleteReport = document.getElementById(
    "btnConfirmDeleteReport",
  );
  if (btnConfirmDeleteReport) {
    btnConfirmDeleteReport.addEventListener("click", confirmDeleteReport);
  }

  await Promise.all([loadClientOptions(), loadProjectOptions()]);

  periodPreset.addEventListener("change", () => {
    const isCustom = periodPreset.value === "custom";
    customDateFields.forEach((el) => el.classList.toggle("d-none", !isCustom));
  });

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeTab = btn.dataset.tab;
      document.querySelectorAll(".report-tab-pane").forEach((pane) => {
        pane.classList.add("d-none");
      });
      document.getElementById(`tab-${activeTab}`).classList.remove("d-none");

      // Nu are sens să generezi un PDF de tip "archive" — dezactivăm butonul
      // vizual (rămâne vizibil, cum s-a cerut), fără să blocăm celelalte tab-uri.
      setGenerateReportDisabled(activeTab === "archive");

      loadActiveTab();
    });
  });

  btnGenerate.addEventListener("click", loadActiveTab);
  btnGenerateReport.addEventListener("click", generateReport);

  archiveSearch.addEventListener(
    "input",
    Utils.debounce(() => loadArchive(), 300),
  );
  archiveTypeFilter.addEventListener("change", () => loadArchive());

  // Încărcare inițială pentru tabul implicit (Financial) — Archive se
  // încarcă doar la accesare, la fel ca celelalte tab-uri.
  await loadActiveTab();

  // La schimbarea de limbă: re-randează tab-ul activ + opțiunile de client/
  // proiect cu datele curente — reutilizează fluxurile existente.
  document.addEventListener("erp:locale-changed", () => {
    loadClientOptions();
    loadProjectOptions();
    loadActiveTab();
  });

  async function loadClientOptions() {
    try {
      const clients = await API.get("/clients");
      const list = Array.isArray(clients) ? clients : clients.data || [];
      filterClient.innerHTML =
        `<option value="">${t("reports.allClients", "Toți clienții")}</option>` +
        list
          .map(
            (c) =>
              `<option value="${c.id}">${Utils.escapeHtml(c.company_name)}</option>`,
          )
          .join("");
    } catch (err) {
      console.error("Eroare la încărcarea clienților:", err);
    }
  }

  async function loadProjectOptions() {
    try {
      const projects = await API.get("/projects");
      const list = Array.isArray(projects) ? projects : projects.data || [];
      filterProject.innerHTML =
        `<option value="">${t("reports.allProjects", "Toate proiectele")}</option>` +
        list
          .map(
            (p) =>
              `<option value="${p.id}">${Utils.escapeHtml(p.project_name)}</option>`,
          )
          .join("");
    } catch (err) {
      console.error("Eroare la încărcarea proiectelor:", err);
    }
  }

  function getDateRange() {
    const preset = periodPreset.value;
    const today = new Date();
    const iso = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    if (preset === "custom") {
      return { from: dateFrom.value || undefined, to: dateTo.value || undefined };
    }
    if (preset === "all") {
      return {};
    }
    if (preset === "month") {
      return {
        from: iso(new Date(today.getFullYear(), today.getMonth(), 1)),
        to: iso(today),
      };
    }
    if (preset === "quarter") {
      const q = Math.floor(today.getMonth() / 3);
      return {
        from: iso(new Date(today.getFullYear(), q * 3, 1)),
        to: iso(today),
      };
    }
    if (preset === "year") {
      return { from: iso(new Date(today.getFullYear(), 0, 1)), to: iso(today) };
    }
    return {};
  }

  function buildQuery(extra = {}) {
    const { from, to } = getDateRange();
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (filterClient.value) params.set("client_id", filterClient.value);
    if (filterProject.value) params.set("project_id", filterProject.value);
    Object.entries(extra).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    return params.toString();
  }

  async function loadActiveTab() {
    btnGenerate.disabled = true;
    const originalHtml = btnGenerate.innerHTML;
    btnGenerate.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;
    try {
      if (activeTab === "financial") await loadFinancial();
      else if (activeTab === "projects") await loadProjects();
      else if (activeTab === "materials") await loadMaterials();
      else if (activeTab === "clients") await loadClientsReport();
      else if (activeTab === "archive") await loadArchive();
    } finally {
      btnGenerate.disabled = false;
      btnGenerate.innerHTML = originalHtml;
    }
  }

  async function loadFinancial() {
    try {
      const response = await API.get(`/reports/financial?${buildQuery()}`);
      if (!response || !response.success) {
        Toast.show(t("reports.financialLoadFailed", "Nu s-au putut încărca datele financiare."), "danger");
        return;
      }
      const { summary, timeseries } = response.data;
      document.getElementById("statInvoiced").textContent =
        Utils.formatCurrency(summary.invoiced);
      document.getElementById("statPaid").textContent = Utils.formatCurrency(
        summary.paid,
      );
      document.getElementById("statOutstanding").textContent =
        Utils.formatCurrency(summary.outstanding);
      document.getElementById("statOverdue").textContent = Utils.formatCurrency(
        summary.overdue,
      );
      renderFinancialChart(timeseries);
    } catch (err) {
      console.error("Eroare la încărcarea raportului financiar:", err);
      Toast.show(t("reports.reportNetworkError", "Eroare de rețea la încărcarea raportului."), "danger");
    }
  }

  function renderFinancialChart(timeseries) {
    const canvas = document.getElementById("financialChart");
    const emptyState = document.getElementById("financialChartEmpty");

    if (!timeseries || timeseries.length === 0) {
      canvas.classList.add("d-none");
      emptyState.classList.remove("d-none");
      if (financialChart) {
        financialChart.destroy();
        financialChart = null;
      }
      return;
    }

    canvas.classList.remove("d-none");
    emptyState.classList.add("d-none");

    const labels = timeseries.map((t) => t.period);
    const invoicedData = timeseries.map((t) => t.invoiced);
    const paidData = timeseries.map((t) => t.paid);

    if (financialChart) {
      financialChart.destroy();
    }

    financialChart = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: t("reports.invoiced", "Facturat"),
            data: invoicedData,
            backgroundColor: "#0d6efd",
          },
          {
            label: t("reports.collected", "Încasat"),
            data: paidData,
            backgroundColor: "#198754",
          },
        ],
      },
      options: {
        responsive: true,
        scales: { y: { beginAtZero: true } },
      },
    });
  }

  async function loadProjects() {
    const tbody = document.getElementById("projectsTableBody");
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">${t("common.loading", "Se încarcă...")}</td></tr>`;
    try {
      const response = await API.get(`/reports/projects?${buildQuery()}`);
      if (!response || !response.success) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">${t("reports.loadError", "Eroare la încărcare.")}</td></tr>`;
        return;
      }
      const rows = response.data;
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">${t("reports.noProjectFound", "Niciun proiect găsit.")}</td></tr>`;
        return;
      }
      tbody.innerHTML = rows
        .map(
          (p) => `
        <tr>
          <td class="ps-4">
            <strong class="d-block">${Utils.escapeHtml(p.project_name)}</strong>
            <small class="text-muted">${Utils.escapeHtml(p.project_number || "")}</small>
          </td>
          <td>${Utils.escapeHtml(p.client_name || "-")}</td>
          <td>${projectStatusBadge(p.status)}</td>
          <td>${p.project_value != null ? Utils.formatCurrency(p.project_value, p.currency || "EUR") : "-"}</td>
          <td>${p.materials_cost != null ? Utils.formatCurrency(p.materials_cost, p.currency || "EUR") : '<span class="text-muted">N/A</span>'}</td>
          <td>${p.labor_cost != null ? Utils.formatCurrency(p.labor_cost, p.currency || "EUR") : '<span class="text-muted">N/A</span>'}</td>
          <td class="pe-4 fw-bold ${p.profit != null && p.profit < 0 ? "text-danger" : "text-success"}">
            ${p.profit != null ? Utils.formatCurrency(p.profit, p.currency || "EUR") : '<span class="text-muted fw-normal">N/A</span>'}
          </td>
        </tr>
      `,
        )
        .join("");
    } catch (err) {
      console.error("Eroare la încărcarea raportului de proiecte:", err);
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">${t("common.networkError", "Eroare de rețea.")}</td></tr>`;
    }
  }

  function projectStatusBadge(status) {
    const map = {
      draft: ["secondary", t("estimating.status.draft", "Draft")],
      planned: ["info text-dark", t("projects.status.planned", "Planificat")],
      in_progress: ["warning text-dark", t("projects.status.in_progress", "În Lucru")],
      on_hold: ["dark", t("projects.status.on_hold", "În Așteptare")],
      completed: ["success", t("projects.status.completed", "Finalizat")],
      cancelled: ["danger", t("projects.status.cancelled", "Anulat")],
    };
    const [cls, label] = map[status] || ["secondary", status];
    return `<span class="badge bg-${cls}">${label}</span>`;
  }

  async function loadMaterials() {
    const tbody = document.getElementById("materialsTableBody");
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">${t("common.loading", "Se încarcă...")}</td></tr>`;
    try {
      const { from, to } = getDateRange();
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const response = await API.get(`/reports/materials?${params.toString()}`);
      if (!response || !response.success) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">${t("reports.loadError", "Eroare la încărcare.")}</td></tr>`;
        return;
      }
      const rows = response.data;
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">${t("reports.noMaterialFound", "Niciun material găsit.")}</td></tr>`;
        return;
      }
      tbody.innerHTML = rows
        .map(
          (m) => `
        <tr class="${m.low_stock ? "table-danger" : ""}">
          <td class="ps-4">
            <strong class="d-block">${Utils.escapeHtml(m.name)}</strong>
            <small class="text-muted">${Utils.escapeHtml(m.item_code || "")}</small>
          </td>
          <td>${parseFloat(m.planned_usage_quantity).toFixed(2)} ${Utils.escapeHtml(m.unit_of_measure || "")}</td>
          <td>${Utils.formatCurrency(m.planned_usage_cost)}</td>
          <td>${parseFloat(m.stock_quantity).toFixed(2)} ${Utils.escapeHtml(m.unit_of_measure || "")}</td>
          <td class="pe-4">
            ${m.low_stock ? `<span class="badge bg-danger">${t("reports.lowStock", "Stoc Redus")}</span>` : '<span class="badge bg-success">OK</span>'}
          </td>
        </tr>
      `,
        )
        .join("");
    } catch (err) {
      console.error("Eroare la încărcarea raportului de materiale:", err);
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">${t("common.networkError", "Eroare de rețea.")}</td></tr>`;
    }
  }

  async function loadClientsReport() {
    const tbody = document.getElementById("clientsReportTableBody");
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">${t("common.loading", "Se încarcă...")}</td></tr>`;
    try {
      const { from, to } = getDateRange();
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const response = await API.get(`/reports/clients?${params.toString()}`);
      if (!response || !response.success) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">${t("reports.loadError", "Eroare la încărcare.")}</td></tr>`;
        return;
      }
      const rows = response.data;
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">${t("reports.noClientFound", "Niciun client găsit.")}</td></tr>`;
        return;
      }
      tbody.innerHTML = rows
        .map(
          (c) => `
        <tr>
          <td class="ps-4 fw-bold">${Utils.escapeHtml(c.company_name)}</td>
          <td>${c.project_count}</td>
          <td>${Utils.formatCurrency(c.projects_value)}</td>
          <td>${Utils.formatCurrency(c.invoiced)}</td>
          <td class="text-success">${Utils.formatCurrency(c.paid)}</td>
          <td class="pe-4 text-danger fw-bold">${Utils.formatCurrency(c.outstanding)}</td>
        </tr>
      `,
        )
        .join("");
    } catch (err) {
      console.error("Eroare la încărcarea raportului de clienți:", err);
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">${t("common.networkError", "Eroare de rețea.")}</td></tr>`;
    }
  }

  // --- REPORT ARCHIVE (generare, persistare, deschidere, listare) ---

  async function generateReport() {
    const originalHtml = btnGenerateReport.innerHTML;
    btnGenerateReport.disabled = true;
    btnGenerateReport.innerHTML = `<span class="spinner-border spinner-border-sm"></span> ${t("reports.generating", "Se generează...")}`;

    try {
      const { from, to } = getDateRange();
      const payload = {
        report_type: activeTab,
        from,
        to,
        client_id: filterClient.value || undefined,
        project_id: filterProject.value || undefined,
      };

      const response = await API.post("/reports/generate-pdf", payload);
      if (!response || !response.success) {
        Toast.show(
          (response && response.message) || t("reports.generateFailed", "Nu s-a putut genera raportul."),
          "danger",
        );
        return;
      }

      Toast.show(
        t(
          "reports.generatedAndArchived",
          `Raport ${response.data.report_number} generat și arhivat cu succes.`,
          { number: response.data.report_number },
        ),
        "success",
      );
      await openReport(response.data.id);
      await loadArchive();
    } catch (err) {
      console.error("Eroare la generarea raportului:", err);
      Toast.show(err.message || t("reports.generateNetworkError", "Eroare de rețea la generare."), "danger");
    } finally {
      setGenerateReportDisabled(activeTab === "archive");
      btnGenerateReport.innerHTML = originalHtml;
    }
  }

  async function fetchReportBlob(id) {
    const token = localStorage.getItem("token");
    const response = await fetch(
      `${CONFIG.API_BASE_URL}/reports/history/${id}/download`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    );
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || t("reports.fetchFailed", "Nu s-a putut prelua raportul."));
    }
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="(.+)"/);
    const fileName = match ? match[1] : `report-${id}.pdf`;
    const blob = await response.blob();
    return { blob, fileName };
  }

  async function openReport(id) {
    try {
      const { blob } = await fetchReportBlob(id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (err) {
      console.error("Eroare la deschiderea raportului:", err);
      Toast.show(err.message || t("reports.openFailed", "Eroare la deschiderea raportului."), "danger");
    }
  }

  async function printReport(id) {
    try {
      const { blob } = await fetchReportBlob(id);
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch (e) {
          window.open(url, "_blank");
        }
      };
    } catch (err) {
      console.error("Eroare la printarea raportului:", err);
      Toast.show(err.message || t("reports.printFailed", "Eroare la printarea raportului."), "danger");
    }
  }

  async function downloadReport(id) {
    try {
      const { blob, fileName } = await fetchReportBlob(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error("Eroare la descărcarea raportului:", err);
      Toast.show(err.message || t("reports.downloadFailed", "Eroare la descărcarea raportului."), "danger");
    }
  }

  function formatArchivePeriod(filters) {
    if (!filters) return t("reports.periodOptions.all", "Tot istoricul");
    if (filters.from && filters.to) {
      return `${Utils.formatDate(filters.from)} - ${Utils.formatDate(filters.to)}`;
    }
    return t("reports.periodOptions.all", "Tot istoricul");
  }

  // Etichetă de tip raport — tipul se afișa BRUT (r.report_type, fără nicio
  // traducere existentă). Culoarea (TYPE_BADGE) rămâne neatinsă.
  function reportTypeLabel(type) {
    const labels = {
      financial: t("reports.tabs.financial", "Financial"),
      projects: t("nav.projects", "Projects"),
      materials: t("nav.materials", "Materials"),
      clients: t("nav.clients", "Clients"),
    };
    return labels[type] || type;
  }

  async function loadArchive() {
    archiveTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">${t("common.loading", "Se încarcă...")}</td></tr>`;
    try {
      const params = new URLSearchParams();
      if (archiveSearch.value.trim()) params.set("search", archiveSearch.value.trim());
      if (archiveTypeFilter.value) params.set("report_type", archiveTypeFilter.value);

      const response = await API.get(`/reports/history?${params.toString()}`);
      if (!response || !response.success) {
        archiveTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">${t("reports.loadError", "Eroare la încărcare.")}</td></tr>`;
        return;
      }

      lastArchiveRows = response.data;
      renderArchiveRows();
    } catch (err) {
      console.error("Eroare la încărcarea arhivei:", err);
      archiveTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">${t("common.networkError", "Eroare de rețea.")}</td></tr>`;
    }
  }

  function renderArchiveRows() {
    const rows = lastArchiveRows;
    if (!rows.length) {
      archiveTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">${t("reports.noReportsYet", "Niciun raport generat încă.")}</td></tr>`;
      return;
    }

    const canDelete = currentUserRole === "Administrator";

    archiveTableBody.innerHTML = rows
      .map(
        (r) => `
      <tr>
        <td class="ps-4">
          <strong class="d-block">${Utils.escapeHtml(r.report_name)}</strong>
          <small class="text-muted">${Utils.escapeHtml(r.report_number)}</small>
        </td>
        <td><span class="badge bg-${TYPE_BADGE[r.report_type] || "secondary"}">${Utils.escapeHtml(reportTypeLabel(r.report_type))}</span></td>
        <td>${formatArchivePeriod(r.filters_json)}</td>
        <td>${new Date(r.generated_at).toLocaleString(getCurrentLocaleCode())}</td>
        <td class="text-end pe-4">
          <button type="button" class="btn btn-sm btn-outline-info me-1 btn-archive-view" data-id="${r.id}" title="${t("quotes.viewAction", "Vizualizare")}">
            <i class="fas fa-eye"></i>
          </button>
          <button type="button" class="btn btn-sm btn-outline-secondary me-1 btn-archive-print" data-id="${r.id}" title="${t("reports.printAction", "Printare")}">
            <i class="fas fa-print"></i>
          </button>
          <button type="button" class="btn btn-sm btn-outline-primary ${canDelete ? "me-1" : ""} btn-archive-download" data-id="${r.id}" title="${t("reports.downloadAction", "Descărcare")}">
            <i class="fas fa-download"></i>
          </button>
          ${
            canDelete
              ? `<button type="button" class="btn btn-sm btn-outline-danger btn-archive-delete" data-id="${r.id}" title="${t("common.delete", "Șterge")}">
                  <i class="fas fa-trash-alt"></i>
                </button>`
              : ""
          }
        </td>
      </tr>
    `,
      )
      .join("");

    archiveTableBody.querySelectorAll(".btn-archive-view").forEach((btn) => {
      btn.addEventListener("click", () => openReport(btn.dataset.id));
    });
    archiveTableBody.querySelectorAll(".btn-archive-print").forEach((btn) => {
      btn.addEventListener("click", () => printReport(btn.dataset.id));
    });
    archiveTableBody.querySelectorAll(".btn-archive-download").forEach((btn) => {
      btn.addEventListener("click", () => downloadReport(btn.dataset.id));
    });
    archiveTableBody.querySelectorAll(".btn-archive-delete").forEach((btn) => {
      btn.addEventListener("click", () => {
        reportIdPendingDelete = btn.dataset.id;
        if (deleteReportModalInstance) deleteReportModalInstance.show();
      });
    });
  }

  async function confirmDeleteReport() {
    if (!reportIdPendingDelete) return;

    const originalHtml = btnConfirmDeleteReport.innerHTML;
    btnConfirmDeleteReport.disabled = true;
    btnConfirmDeleteReport.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;

    try {
      const response = await API.delete(`/reports/history/${reportIdPendingDelete}`);
      if (response && response.success) {
        Toast.show(response.message || t("reports.reportDeleted", "Raportul a fost șters."), "success");
        if (deleteReportModalInstance) deleteReportModalInstance.hide();
        lastArchiveRows = lastArchiveRows.filter(
          (r) => String(r.id) !== String(reportIdPendingDelete),
        );
        renderArchiveRows();
      } else {
        Toast.show(
          (response && response.message) || t("reports.deleteFailed", "Nu s-a putut șterge raportul."),
          "danger",
        );
      }
    } catch (err) {
      console.error("Eroare la ștergerea raportului:", err);
      Toast.show(err.message || t("reports.deleteNetworkError", "Eroare de rețea la ștergere."), "danger");
    } finally {
      reportIdPendingDelete = null;
      btnConfirmDeleteReport.disabled = false;
      btnConfirmDeleteReport.innerHTML = originalHtml;
    }
  }
});
