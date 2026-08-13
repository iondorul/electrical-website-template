document.addEventListener("DOMContentLoaded", async () => {
  let currentPage = 1;
  let currentSearch = "";
  let currentStatus = "";

  const tableBody = document.getElementById("quotesTableBody");
  const searchInput = document.getElementById("searchInput");
  const statusFilter = document.getElementById("statusFilter");
  const paginationContainer = document.getElementById("paginationContainer");

  // Inițializare Modale Bootstrap 5
  let convertModalInstance = null;
  const convertModalEl = document.getElementById("convertQuoteModal");
  if (convertModalEl) {
    convertModalInstance = new bootstrap.Modal(convertModalEl);
  }

  let statusModalInstance = null;
  const statusModalEl = document.getElementById("statusModal");
  if (statusModalEl) {
    statusModalInstance = new bootstrap.Modal(statusModalEl);
  }

  let viewModalInstance = null;
  const viewModalEl = document.getElementById("viewQuoteModal");
  if (viewModalEl) {
    viewModalInstance = new bootstrap.Modal(viewModalEl);
  }

  let deleteModalInstance = null;
  const deleteModalEl = document.getElementById("deleteModal");
  if (deleteModalEl) {
    deleteModalInstance = new bootstrap.Modal(deleteModalEl);
  }

  // Încărcare inițială date
  await loadQuotes();

  // Event Căutare Debounced
  if (searchInput) {
    searchInput.addEventListener(
      "input",
      Utils.debounce((e) => {
        currentSearch = e.target.value.trim();
        currentPage = 1;
        loadQuotes();
      }, 300),
    );
  }

  // Event Filtrare Status
  if (statusFilter) {
    statusFilter.addEventListener("change", (e) => {
      currentStatus = e.target.value;
      currentPage = 1;
      loadQuotes();
    });
  }

  // Deschide Modal Generare Ofertă din Deviz
  document
    .getElementById("btnOpenConvertModal")
    ?.addEventListener("click", async () => {
      resetConvertForm();
      await loadApprovedEstimates();
      convertModalInstance.show();
    });

  // Generează Ofertă
  document
    .getElementById("btnSubmitConvert")
    ?.addEventListener("click", async () => {
      await createQuoteFromEstimate();
    });

  // Salvare Schimbare Status Workflow
  document
    .getElementById("btnSaveStatus")
    ?.addEventListener("click", async () => {
      await saveStatusChange();
    });

  // Confirmare Ștergere / Arhivare
  document
    .getElementById("btnConfirmDelete")
    ?.addEventListener("click", async () => {
      const id = document.getElementById("deleteQuoteId").value;
      if (id) {
        await executeDelete(id);
      }
    });

  // --- FUNCȚII CRUD & UI ---

  async function loadQuotes() {
    try {
      tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">Se încarcă ofertele...</td></tr>`;

      const queryParams = new URLSearchParams({
        page: currentPage,
        limit: 10,
        search: currentSearch,
        status: currentStatus,
      });

      const response = await API.get(`/quotes?${queryParams.toString()}`);

      if (response && response.success) {
        renderTable(response.data || response.items || []);
        renderPagination(response.pagination);
      } else {
        tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4">Nu s-au putut încărca datele.</td></tr>`;
      }
    } catch (err) {
      console.error("Eroare la încărcare oferte:", err);
      Toast.show("Eroare de rețea la încărcarea ofertelor.", "danger");
      tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4">Eroare de rețea.</td></tr>`;
    }
  }

  function renderTable(quotes) {
    if (!quotes || quotes.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">Nu există oferte înregistrate.</td></tr>`;
      return;
    }

    tableBody.innerHTML = quotes
      .map(
        (q) => `
            <tr>
                <td class="ps-4">
                    <strong class="d-block text-primary">${Utils.escapeHtml(q.quote_number)}</strong>
                </td>
                <td>
                    <span class="d-block fw-bold">${Utils.escapeHtml(q.client_name || "-")}</span>
                    <small class="text-muted">${Utils.escapeHtml(q.project_name || "Fără proiect")}</small>
                </td>
                <td>${Utils.formatDate ? Utils.formatDate(q.issue_date) : q.issue_date}</td>
                <td>${Utils.formatDate ? Utils.formatDate(q.valid_until) : q.valid_until}</td>
                <td>${Utils.formatCurrency(q.total_net)}</td>
                <td class="fw-bold">${Utils.formatCurrency(q.total_gross)}</td>
                <td><span class="badge bg-${getStatusBadgeColor(q.status)}">${Utils.escapeHtml(q.status.toUpperCase())}</span></td>
                <td class="text-end pe-4">
                    <div class="d-inline-flex align-items-center gap-1">
                        ${
                          q.status === "approved"
                            ? `<button type="button" class="btn btn-sm btn-outline-success me-1 btn-invoice d-inline-flex align-items-center gap-1" data-id="${q.id}" title="Facturează">
                                <i class="fas fa-file-invoice-dollar"></i> Facturează
                              </button>`
                            : ``
                        }
                        <button type="button" class="btn btn-sm btn-outline-info btn-view d-flex align-items-center justify-content-center" style="width: 32px; height: 32px; padding: 0;" data-id="${q.id}" title="Vizualizare">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-primary btn-status d-flex align-items-center justify-content-center" style="width: 32px; height: 32px; padding: 0;" data-id="${q.id}" data-status="${q.status}" title="Schimbă Status">
                            <i class="fas fa-tasks"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-danger btn-delete d-flex align-items-center justify-content-center" style="width: 32px; height: 32px; padding: 0;" data-id="${q.id}" title="Arhivare">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `,
      )
      .join("");

    document.querySelectorAll(".btn-invoice").forEach((btn) => {
      btn.addEventListener("click", () =>
        generateInvoiceFromQuote(btn.dataset.id),
      );
    });
    document.querySelectorAll(".btn-view").forEach((btn) => {
      btn.addEventListener("click", () => viewQuoteDetails(btn.dataset.id));
    });
    document.querySelectorAll(".btn-status").forEach((btn) => {
      btn.addEventListener("click", () =>
        openStatusModal(btn.dataset.id, btn.dataset.status),
      );
    });
    document.querySelectorAll(".btn-delete").forEach((btn) => {
      btn.addEventListener("click", () => promptDelete(btn.dataset.id));
    });
  }

  async function loadApprovedEstimates() {
    const selectEl = document.getElementById("selectEstimateId");
    try {
      selectEl.innerHTML = `<option value="">Se încarcă devizele aprobate...</option>`;
      const response = await API.get("/estimates?status=completed");

      if (response && response.success) {
        const estimatesList = response.data || [];
        if (estimatesList.length > 0) {
          selectEl.innerHTML =
            `<option value="">Selectează devizul aprobat...</option>` +
            estimatesList
              .map(
                (e) =>
                  `<option value="${e.id}">${Utils.escapeHtml(
                    e.estimate_number +
                      " - " +
                      e.title +
                      " (" +
                      Utils.formatCurrency(e.grand_total) +
                      ")",
                  )}</option>`,
              )
              .join("");
        } else {
          selectEl.innerHTML = `<option value="">Nu există devize aprobate disponibile</option>`;
        }
      } else {
        selectEl.innerHTML = `<option value="">Nu s-au putut încărca devizele</option>`;
      }
    } catch (err) {
      console.error("Eroare încărcare devize aprobate:", err);
      selectEl.innerHTML = `<option value="">Eroare de rețea</option>`;
    }
  }

  async function createQuoteFromEstimate() {
    const estimateId = document.getElementById("selectEstimateId").value;
    const validUntil = document.getElementById("inputValidUntil").value;

    let isValid = true;
    if (!estimateId) {
      document.getElementById("selectEstimateId").classList.add("is-invalid");
      isValid = false;
    }
    if (!validUntil) {
      document.getElementById("inputValidUntil").classList.add("is-invalid");
      isValid = false;
    }

    if (!isValid) {
      Toast.show(
        "Completează câmpurile obligatorii marcate cu roșu.",
        "danger",
      );
      return;
    }

    const payload = {
      estimate_id: parseInt(estimateId, 10),
      valid_until: validUntil,
      show_material_breakdown:
        document.getElementById("checkShowMaterials").checked,
      terms_and_conditions:
        document.getElementById("inputTerms").value.trim() || null,
      notes: document.getElementById("inputNotes").value.trim() || null,
    };

    try {
      const response = await API.post("/quotes", payload);

      if (response && response.success) {
        Toast.show("Ofertă generată cu succes!", "success");
        convertModalInstance.hide();
        await loadQuotes();
      } else {
        let errorMessage = response.message || "Eroare la generarea ofertei.";

        if (
          errorMessage.includes("already been created") ||
          errorMessage.includes("QUOTE_ALREADY_EXISTS")
        ) {
          errorMessage =
            "Oferta nu poate fi generată: există deja o ofertă comercială activă pentru acest deviz.";
          Toast.show(errorMessage, "orange");
        } else {
          Toast.show(errorMessage, "danger");
        }
      }
    } catch (err) {
      console.error("Eroare generare ofertă:", err);

      let errorMessage = "Eroare de rețea la generarea ofertei.";
      let toastType = "danger";
      const rawError = err.message || "";

      if (
        rawError.includes("already been created") ||
        rawError.includes("QUOTE_ALREADY_EXISTS")
      ) {
        errorMessage =
          "Oferta nu poate fi generată: există deja o ofertă comercială activă pentru acest deviz.";
        toastType = "orange";
      } else if (rawError.includes("ESTIMATE_NOT_FOUND")) {
        errorMessage = "Devizul selectat nu mai există sau a fost dezactivat.";
        toastType = "orange";
      } else if (
        rawError.includes("Finalizat") ||
        rawError.includes("completed")
      ) {
        errorMessage =
          "Devizul trebuie să fie în starea Finalizat înainte de a putea genera oferta comercială.";
        toastType = "orange";
      }

      Toast.show(errorMessage, toastType);
    }
  }

  async function generateInvoiceFromQuote(quoteId) {
    try {
      const response = await API.post("/invoices/from-quote", {
        quote_id: parseInt(quoteId, 10),
      });

      if (response && response.success) {
        Toast.show("Factură generată cu succes din ofertă!", "success");
      } else {
        let msg = response.message || "Eroare la generarea facturii.";
        let toastType = "danger";
        if (
          msg.includes("already been created") ||
          msg.includes("INVOICE_ALREADY_EXISTS")
        ) {
          msg = "Există deja o factură generată pentru această ofertă.";
          toastType = "orange";
        }
        Toast.show(msg, toastType);
      }
    } catch (err) {
      console.error("Eroare generare factură:", err);
      const rawError = err.message || "";

      let msg = "Eroare de rețea la generarea facturii.";
      let toastType = "danger";
      if (
        rawError.includes("already been created") ||
        rawError.includes("INVOICE_ALREADY_EXISTS")
      ) {
        msg = "Există deja o factură generată pentru această ofertă.";
        toastType = "orange";
      } else if (rawError) {
        msg = `${rawError}`;
      }

      Toast.show(msg, toastType);
    }
  }

  function openStatusModal(id, currentStatus) {
    document.getElementById("statusQuoteId").value = id;
    const selectEl = document.getElementById("selectNextStatus");

    const allowedTransitions = {
      draft: [
        { value: "sent", label: "Trimisă (Sent)" },
        { value: "canceled", label: "Anulată (Canceled)" },
      ],
      sent: [
        { value: "approved", label: "Aprobată (Approved)" },
        { value: "rejected", label: "Respinsă (Rejected)" },
        { value: "expired", label: "Expirată (Expired)" },
        { value: "canceled", label: "Anulată (Canceled)" },
      ],
      approved: [{ value: "canceled", label: "Anulată (Canceled)" }],
      rejected: [{ value: "draft", label: "Ciornă / Modifică (Draft)" }],
      expired: [{ value: "draft", label: "Ciornă / Modifică (Draft)" }],
      canceled: [],
    };

    const options = allowedTransitions[currentStatus] || [];
    selectEl.innerHTML = "";

    if (options.length === 0) {
      Toast.show(
        "Această ofertă este într-un status final și nu mai poate fi modificată.",
        "orange",
      );
      return;
    }

    options.forEach((opt) => {
      const el = document.createElement("option");
      el.value = opt.value;
      el.textContent = opt.label;
      selectEl.appendChild(el);
    });

    statusModalInstance.show();
  }

  async function saveStatusChange() {
    const id = document.getElementById("statusQuoteId").value;
    const status = document.getElementById("selectNextStatus").value;

    if (!status) return;

    try {
      const response = await API.put(`/quotes/${id}/status`, { status });

      if (response && response.success) {
        Toast.show("Status actualizat cu succes!", "success");
        statusModalInstance.hide();
        await loadQuotes();
      } else {
        Toast.show(
          response.message || "Eroare la actualizarea statusului.",
          "danger",
        );
      }
    } catch (err) {
      console.error("Eroare status:", err);
      Toast.show("Eroare de rețea la schimbarea statusului.", "danger");
    }
  }

  async function viewQuoteDetails(id) {
    try {
      const response = await API.get(`/quotes/${id}`);
      if (response && response.success) {
        const q = response.data;
        document.getElementById("viewModalTitle").textContent =
          `Detalii Ofertă: ${q.quote_number}`;

        let itemsHtml = "";
        if (q.items && q.items.length > 0) {
          itemsHtml = `
            <table class="table table-sm table-bordered mt-3 align-middle">
              <thead class="table-light">
                <tr>
                  <th>Categorie</th>
                  <th>Descriere</th>
                  <th>Cant.</th>
                  <th>UM</th>
                  <th>Preț U.</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${q.items
                  .map(
                    (item) => `
                  <tr>
                    <td>${Utils.escapeHtml(item.category || item.item_type || "-")}</td>
                    <td>${Utils.escapeHtml(item.description)}</td>
                    <td>${item.quantity}</td>
                    <td>${Utils.escapeHtml(item.unit_of_measure)}</td>
                    <td>${Utils.formatCurrency(item.unit_price)}</td>
                    <td class="fw-bold">${Utils.formatCurrency(item.total_price)}</td>
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
          `;
        }

        document.getElementById("viewModalBody").innerHTML = `
          <div class="row g-2 mb-3">
            <div class="col-md-6"><strong>Client:</strong> ${Utils.escapeHtml(q.client_name || "-")}</div>
            <div class="col-md-6"><strong>Proiect:</strong> ${Utils.escapeHtml(q.project_name || "-")}</div>
            <div class="col-md-6"><strong>Data Emiterii:</strong> ${Utils.formatDate ? Utils.formatDate(q.issue_date) : q.issue_date}</div>
            <div class="col-md-6"><strong>Valabilitate:</strong> ${Utils.formatDate ? Utils.formatDate(q.valid_until) : q.valid_until}</div>
          </div>
          <div class="card bg-light p-3 border-0 mb-2">
            <div class="d-flex justify-content-between mb-1">
              <span>Subtotal Materials:</span>
              <span>${Utils.formatCurrency(q.subtotal_materials)}</span>
            </div>
            <div class="d-flex justify-content-between mb-1">
              <span>Subtotal Labor:</span>
              <span>${Utils.formatCurrency(q.subtotal_labor)}</span>
            </div>
            <div class="d-flex justify-content-between mb-1">
              <span>Discount:</span>
              <span>${Utils.formatCurrency(q.discount_amount)}</span>
            </div>
            <div class="d-flex justify-content-between mb-1">
              <span>Total Net:</span>
              <span>${Utils.formatCurrency(q.total_net)}</span>
            </div>
            <div class="d-flex justify-content-between mb-1">
              <span>TVA (${q.vat_rate}%):</span>
              <span>${Utils.formatCurrency(q.vat_amount)}</span>
            </div>
            <hr class="my-2">
            <div class="d-flex justify-content-between fs-5 fw-bold text-primary">
              <span>TOTAL BRUT OFERTĂ:</span>
              <span>${Utils.formatCurrency(q.total_gross)}</span>
            </div>
          </div>
          ${itemsHtml}
        `;

        viewModalInstance.show();
      } else {
        Toast.show("Nu s-au putut prelua detaliile ofertei.", "danger");
      }
    } catch (err) {
      Toast.show("Eroare de rețea la încărcarea ofertei.", "danger");
    }
  }

  function promptDelete(id) {
    document.getElementById("deleteQuoteId").value = id;
    deleteModalInstance.show();
  }

  async function executeDelete(id) {
    try {
      const response = await API.delete(`/quotes/${id}`);
      if (response && response.success) {
        Toast.show("Ofertă arhivată cu succes!", "success");
        deleteModalInstance.hide();
        await loadQuotes();
      } else {
        Toast.show(
          response.message || "Eroare la arhivarea ofertei.",
          "danger",
        );
      }
    } catch (err) {
      Toast.show("Eroare de rețea la arhivarea ofertei.", "danger");
    }
  }

  function renderPagination(pagination) {
    if (!pagination || pagination.totalPages <= 1) {
      paginationContainer.innerHTML = "";
      return;
    }

    const { currentPage: page, totalPages } = pagination;
    let html = `<ul class="pagination pagination-sm justify-content-end mb-0">`;

    html += `
      <li class="page-item ${page === 1 ? "disabled" : ""}">
        <button class="page-link" data-page="${page - 1}">Înapoi</button>
      </li>
    `;

    for (let i = 1; i <= totalPages; i++) {
      html += `
        <li class="page-item ${i === page ? "active" : ""}">
          <button class="page-link" data-page="${i}">${i}</button>
        </li>
      `;
    }

    html += `
      <li class="page-item ${page === totalPages ? "disabled" : ""}">
        <button class="page-link" data-page="${page + 1}">Înainte</button>
      </li>
    `;

    html += `</ul>`;
    paginationContainer.innerHTML = html;

    paginationContainer.querySelectorAll(".page-link").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const targetPage = parseInt(e.target.dataset.page, 10);
        if (targetPage >= 1 && targetPage <= totalPages) {
          currentPage = targetPage;
          loadQuotes();
        }
      });
    });
  }

  function resetConvertForm() {
    document.getElementById("convertQuoteForm").reset();
    document.querySelectorAll("#convertQuoteForm .is-invalid").forEach((el) => {
      el.classList.remove("is-invalid");
    });

    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 30);
    document.getElementById("inputValidUntil").value = defaultDate
      .toISOString()
      .split("T")[0];
  }

  function getStatusBadgeColor(status) {
    switch (status) {
      case "approved":
        return "success";
      case "sent":
        return "info text-dark";
      case "draft":
        return "secondary";
      case "rejected":
        return "danger";
      case "expired":
        return "warning text-dark";
      case "canceled":
        return "dark";
      default:
        return "secondary";
    }
  }

  ["selectEstimateId", "inputValidUntil"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", (e) => {
      e.target.classList.remove("is-invalid");
    });
  });
});
