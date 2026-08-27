document.addEventListener("DOMContentLoaded", async () => {
  let currentPage = 1;
  let currentSearch = "";
  let currentStatus = "";

  const btnDeleteAll = document.getElementById("btnDeleteAllInvoices");
  if (btnDeleteAll) {
    btnDeleteAll.addEventListener("click", async () => {
      const confirmed = confirm(
        t("invoices.deleteAllConfirm", "Sigur dorești să ștergi TOATE facturile? Această acțiune este ireversibilă!"),
      );
      if (!confirmed) return;

      try {
        const response = await API.delete("/invoices");
        if (response && response.success) {
          const msgOk = t("invoices.allDeleted", "Toate facturile au fost șterse cu succes.");
          if (typeof Toast !== "undefined") {
            Toast.show(msgOk, "success");
          } else {
            alert(msgOk);
          }
          currentPage = 1;
          loadInvoices();
        } else {
          const msg =
            response && response.message
              ? response.message
              : t("invoices.deleteAllFailed", "Nu s-au putut șterge facturile.");
          if (typeof Toast !== "undefined") {
            Toast.show(msg, "danger");
          } else {
            alert(msg);
          }
        }
      } catch (err) {
        console.error("Eroare la ștergerea totală a facturilor:", err);
        if (typeof Toast !== "undefined") {
          Toast.show(t("invoices.deleteAllNetworkError", "Eroare de rețea la ștergerea facturilor."), "danger");
        } else {
          alert(t("common.networkError", "Eroare de rețea."));
        }
      }
    });
  }

  const tableBody = document.getElementById("invoicesTableBody");
  const searchInput = document.getElementById("searchInput");
  const statusFilter = document.getElementById("statusFilter");
  const paginationContainer = document.getElementById("paginationContainer");

  let viewModalInstance = null;
  const viewModalEl = document.getElementById("viewInvoiceModal");
  if (viewModalEl) {
    viewModalInstance = new bootstrap.Modal(viewModalEl);
  }

  let editModalInstance = null;
  const editModalEl = document.getElementById("editInvoiceModal");
  if (editModalEl) {
    editModalInstance = new bootstrap.Modal(editModalEl);
  }

  const btnSaveEdit = document.getElementById("btnSaveEditInvoice");
  if (btnSaveEdit) {
    btnSaveEdit.addEventListener("click", saveInvoiceEdit);
  }

  let sendEmailModalInstance = null;
  const sendEmailModalEl = document.getElementById("sendInvoiceEmailModal");
  if (sendEmailModalEl) {
    sendEmailModalInstance = new bootstrap.Modal(sendEmailModalEl);
  }

  const sendEmailRecipientInput = document.getElementById("sendEmailRecipient");
  let sendEmailTriggerBtn = null;

  const btnConfirmSendEmail = document.getElementById(
    "btnConfirmSendInvoiceEmail",
  );
  if (btnConfirmSendEmail) {
    btnConfirmSendEmail.addEventListener("click", confirmSendInvoiceEmail);
  }

  if (sendEmailRecipientInput) {
    sendEmailRecipientInput.addEventListener("input", () => {
      sendEmailRecipientInput.classList.remove("is-invalid");
    });
  }

  let paymentModalInstance = null;
  const paymentModalEl = document.getElementById("recordPaymentModal");
  if (paymentModalEl) {
    paymentModalInstance = new bootstrap.Modal(paymentModalEl);
  }

  const paymentAmountInput = document.getElementById("paymentAmount");
  if (paymentAmountInput) {
    paymentAmountInput.addEventListener("input", () => {
      paymentAmountInput.classList.remove("is-invalid");
    });
  }

  const btnConfirmRecordPayment = document.getElementById(
    "btnConfirmRecordPayment",
  );
  if (btnConfirmRecordPayment) {
    btnConfirmRecordPayment.addEventListener("click", confirmRecordPayment);
  }

  // Încărcare inițială
  await loadInvoices();

  // La schimbarea de limbă: re-randează cu datele curente — reutilizează
  // fluxul existent, fără logică nouă.
  document.addEventListener("erp:locale-changed", loadInvoices);

  // Căutare debounced
  if (searchInput) {
    searchInput.addEventListener(
      "input",
      Utils.debounce((e) => {
        currentSearch = e.target.value.trim();
        currentPage = 1;
        loadInvoices();
      }, 300),
    );
  }

  // Filtrare după status
  if (statusFilter) {
    statusFilter.addEventListener("change", (e) => {
      currentStatus = e.target.value;
      currentPage = 1;
      loadInvoices();
    });
  }

  // Etichetă de status — statusul se afișa BRUT (inv.status.toUpperCase(),
  // fără nicio traducere existentă), spre deosebire de projects.js.
  // getStatusBadgeColor de mai jos rămâne neatinsă (culoare, nu text).
  function getStatusLabel(status) {
    const labels = {
      draft: t("estimating.status.draft", "Ciornă (Draft)"),
      issued: t("invoices.status.issued", "Emisă (Issued)"),
      partially_paid: t("invoices.status.partially_paid", "Plătită Parțial"),
      paid: t("invoices.status.paid", "Plătită (Paid)"),
      overdue: t("invoices.status.overdue", "Restantă (Overdue)"),
      canceled: t("quotes.status.canceled", "Anulată (Canceled)"),
    };
    // toLocaleUpperCase(locale) în loc de toUpperCase() — "clasica" problemă a
    // literei turcești: toUpperCase() implicit (case folding Unicode default,
    // nu locale-aware) transformă "i" în "I" simplu, nu în "İ" (I cu punct),
    // corect doar pentru turcă via Intl locale-aware casing.
    return (labels[status] || status).toLocaleUpperCase(getCurrentLocaleCode());
  }

  async function loadInvoices() {
    try {
      if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">${t("invoices.loadingList", "Se încarcă facturile...")}</td></tr>`;
      }

      const queryParams = new URLSearchParams({
        page: currentPage,
        limit: 10,
        search: currentSearch,
        status: currentStatus,
      });

      const response = await API.get(`/invoices?${queryParams.toString()}`);

      if (response && response.success) {
        renderTable(response.data || response.items || []);
        renderPagination(response.pagination);
      } else {
        if (tableBody) {
          tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4">${t("invoices.loadFailed", "Nu s-au putut încărca facturile.")}</td></tr>`;
        }
      }
    } catch (err) {
      console.error("Eroare la încărcare facturi:", err);
      if (typeof Toast !== "undefined") {
        Toast.show(t("invoices.networkLoadError", "Eroare de rețea la încărcarea facturilor."), "danger");
      }
      if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4">${t("common.networkError", "Eroare de rețea.")}</td></tr>`;
      }
    }
  }

  function renderTable(invoices) {
    if (!tableBody) return;

    if (!invoices || invoices.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">${t("invoices.noInvoices", "Nu există facturi înregistrate.")}</td></tr>`;
      return;
    }

    tableBody.innerHTML = invoices
      .map(
        (inv) => `
            <tr>
                <td class="ps-4">
                    <strong class="d-block text-primary">${Utils.escapeHtml(inv.invoice_number)}</strong>
                </td>
                <td>
                    <span class="d-block fw-bold">${Utils.escapeHtml(inv.client_name || "-")}</span>
                    <small class="text-muted">${Utils.escapeHtml(inv.project_name || t("estimating.noProject", "Fără proiect"))}</small>
                </td>
                <td>${Utils.formatDate ? Utils.formatDate(inv.issue_date) : inv.issue_date}</td>
                <td>${Utils.formatDate ? Utils.formatDate(inv.due_date) : inv.due_date}</td>
                <td>${Utils.formatCurrency(inv.total_net)}</td>
                <td class="fw-bold">${Utils.formatCurrency(inv.total_gross)}</td>
                <td><span class="badge bg-${getStatusBadgeColor(inv.status)}">${Utils.escapeHtml(getStatusLabel(inv.status))}</span></td>
                <td class="text-end pe-4">
                    <button type="button" class="btn btn-sm btn-outline-info me-1 btn-view" data-id="${inv.id}" title="${t("quotes.viewAction", "Vizualizare")}">
                        <i class="fas fa-eye"></i>
                    </button>
                     <button type="button" class="btn btn-sm btn-outline-primary me-1 btn-edit" data-id="${inv.id}" title="${t("common.edit", "Editare")}">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-secondary me-1 btn-download-pdf" data-id="${inv.id}" title="${t("invoices.downloadPdf", "Descarcă PDF")}">
                        <i class="fas fa-file-pdf"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-success me-1 btn-send-email" data-id="${inv.id}"
                        title="${inv.client_email ? t("invoices.sendByEmailTitle", "Trimite factura pe email") : t("invoices.noClientEmail", "Clientul nu are email completat")}"
                        ${inv.client_email ? "" : "disabled"}>
                        <i class="fas fa-paper-plane"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-warning btn-record-payment" data-id="${inv.id}"
                        title="${inv.status === "canceled" || inv.status === "paid" ? t("invoices.cannotRecordPayments", "Nu se pot înregistra plăți") : t("invoices.recordPaymentTitle", "Înregistrează plată")}"
                        ${inv.status === "canceled" || inv.status === "paid" ? "disabled" : ""}>
                        <i class="fas fa-money-bill-wave"></i>
                    </button>
                </td>
            </tr>
        `,
      )
      .join("");

    document.querySelectorAll(".btn-view").forEach((btn) => {
      btn.addEventListener("click", () => viewInvoiceDetails(btn.dataset.id));
    });

    document.querySelectorAll(".btn-edit").forEach((btn) => {
      btn.addEventListener("click", () => openEditInvoiceModal(btn.dataset.id));
    });

    document.querySelectorAll(".btn-download-pdf").forEach((btn) => {
      btn.addEventListener("click", () => downloadInvoicePdf(btn.dataset.id));
    });

    document.querySelectorAll(".btn-send-email").forEach((btn) => {
      btn.addEventListener("click", () => sendInvoiceByEmail(btn, btn.dataset.id));
    });

    document.querySelectorAll(".btn-record-payment").forEach((btn) => {
      btn.addEventListener("click", () => openRecordPaymentModal(btn.dataset.id));
    });
  }

  async function openRecordPaymentModal(id) {
    try {
      const response = await API.get(`/invoices/${id}`);
      if (!response || !response.success) {
        Toast.show(t("invoices.fetchFailed", "Nu s-au putut prelua datele facturii."), "danger");
        return;
      }

      const inv = response.data;
      const totalGross = parseFloat(inv.total_gross) || 0;
      const paidAmount = parseFloat(inv.paid_amount) || 0;
      const remaining = Math.max(totalGross - paidAmount, 0);

      document.getElementById("paymentInvoiceId").value = inv.id;
      document.getElementById("paymentTotalGross").textContent =
        Utils.formatCurrency(totalGross);
      document.getElementById("paymentRemaining").textContent =
        Utils.formatCurrency(remaining);
      document.getElementById("paymentAmount").value = remaining > 0 ? remaining.toFixed(2) : "";
      document.getElementById("paymentAmount").classList.remove("is-invalid");
      document.getElementById("paymentDate").value = new Date()
        .toISOString()
        .split("T")[0];
      document.getElementById("paymentMethod").value = "bank_transfer";
      document.getElementById("paymentReference").value = "";
      document.getElementById("paymentNotes").value = "";

      if (paymentModalInstance) paymentModalInstance.show();
    } catch (err) {
      console.error("Eroare la deschiderea modalului de plată:", err);
      Toast.show(t("invoices.loadNetworkError", "Eroare de rețea la încărcarea facturii."), "danger");
    }
  }

  async function confirmRecordPayment() {
    const id = document.getElementById("paymentInvoiceId").value;
    const amount = parseFloat(document.getElementById("paymentAmount").value);

    if (!Number.isFinite(amount) || amount <= 0) {
      document.getElementById("paymentAmount").classList.add("is-invalid");
      return;
    }

    const payload = {
      amount,
      payment_date: document.getElementById("paymentDate").value || undefined,
      payment_method: document.getElementById("paymentMethod").value,
      reference_number:
        document.getElementById("paymentReference").value.trim() || undefined,
      notes: document.getElementById("paymentNotes").value.trim() || undefined,
    };

    const btn = document.getElementById("btnConfirmRecordPayment");
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;

    try {
      const response = await API.post(`/invoices/${id}/payments`, payload);
      if (response && response.success) {
        Toast.show(
          response.message || t("invoices.paymentRecorded", "Plata a fost înregistrată cu succes."),
          "success",
        );
        if (paymentModalInstance) paymentModalInstance.hide();
        loadInvoices();
      } else {
        Toast.show(
          (response && response.message) || t("invoices.paymentRecordFailed", "Nu s-a putut înregistra plata."),
          "danger",
        );
      }
    } catch (err) {
      console.error("Eroare la înregistrarea plății:", err);
      Toast.show(err.message || t("invoices.recordNetworkError", "Eroare de rețea la înregistrare."), "danger");
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }

  async function downloadInvoicePdf(id) {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${CONFIG.API_BASE_URL}/invoices/${id}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || t("invoices.pdfGenerateFailed", "Nu s-a putut genera PDF-ul."));
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (err) {
      console.error("Eroare la descărcarea PDF-ului:", err);
      Toast.show(err.message || t("invoices.pdfError", "Eroare la generarea PDF-ului."), "danger");
    }
  }

  async function sendInvoiceByEmail(btn, id) {
    sendEmailTriggerBtn = btn;

    try {
      const response = await API.get(`/invoices/${id}`);
      if (!response || !response.success) {
        Toast.show(t("invoices.fetchFailed", "Nu s-au putut prelua datele facturii."), "danger");
        return;
      }

      const inv = response.data;
      document.getElementById("sendEmailInvoiceId").value = inv.id;
      document.getElementById("sendEmailClientName").value =
        inv.client_contact_person || "-";
      document.getElementById("sendEmailClientCompany").value =
        inv.client_name || "-";
      document.getElementById("sendEmailInvoiceNumber").value =
        inv.invoice_number || "-";

      if (sendEmailRecipientInput) {
        sendEmailRecipientInput.value = inv.client_email || "";
        sendEmailRecipientInput.classList.remove("is-invalid");
      }

      if (sendEmailModalInstance) sendEmailModalInstance.show();
    } catch (err) {
      console.error("Eroare la deschiderea modalului de trimitere:", err);
      Toast.show(t("invoices.loadNetworkError", "Eroare de rețea la încărcarea facturii."), "danger");
    }
  }

  function isValidEmail(value) {
    return Boolean(value) && value.includes("@") && value.trim().length > 3;
  }

  async function confirmSendInvoiceEmail() {
    const id = document.getElementById("sendEmailInvoiceId").value;
    const email = sendEmailRecipientInput
      ? sendEmailRecipientInput.value.trim()
      : "";

    if (!isValidEmail(email)) {
      if (sendEmailRecipientInput) {
        sendEmailRecipientInput.classList.add("is-invalid");
      }
      return;
    }
    if (sendEmailRecipientInput) {
      sendEmailRecipientInput.classList.remove("is-invalid");
    }

    const btnConfirmSendEmail = document.getElementById(
      "btnConfirmSendInvoiceEmail",
    );
    const originalHtml = btnConfirmSendEmail.innerHTML;
    btnConfirmSendEmail.disabled = true;
    btnConfirmSendEmail.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;

    const triggerBtn = sendEmailTriggerBtn;
    let triggerOriginalHtml = null;
    if (triggerBtn) {
      triggerOriginalHtml = triggerBtn.innerHTML;
      triggerBtn.disabled = true;
      triggerBtn.innerHTML = `<span class="spinner-border spinner-border-sm"></span>`;
    }

    try {
      const response = await API.post(`/invoices/${id}/send`, { email });
      if (response && response.success) {
        Toast.show(
          response.message || t("invoices.sentSuccess", "Factura a fost trimisă cu succes."),
          "success",
        );
        if (sendEmailModalInstance) sendEmailModalInstance.hide();
        loadInvoices();
      } else {
        Toast.show(
          (response && response.message) || t("invoices.sendFailed", "Nu s-a putut trimite factura."),
          "danger",
        );
      }
    } catch (err) {
      console.error("Eroare la trimiterea facturii:", err);
      Toast.show(err.message || t("invoices.sendNetworkError", "Eroare de rețea la trimitere."), "danger");
    } finally {
      btnConfirmSendEmail.disabled = false;
      btnConfirmSendEmail.innerHTML = originalHtml;
      if (triggerBtn) {
        triggerBtn.disabled = false;
        triggerBtn.innerHTML = triggerOriginalHtml;
      }
    }
  }

  async function viewInvoiceDetails(id) {
    try {
      const response = await API.get(`/invoices/${id}`);
      if (response && response.success) {
        const inv = response.data;
        document.getElementById("viewModalTitle").textContent = t(
          "invoices.invoiceDetailsWithNumber",
          `Detalii Factură: ${inv.invoice_number}`,
          { number: inv.invoice_number },
        );

        let itemsHtml = "";
        if (inv.items && inv.items.length > 0) {
          itemsHtml = `
            <table class="table table-sm table-bordered mt-3 align-middle">
              <thead class="table-light">
                <tr>
                  <th>${t("quotes.itemTable.category", "Categorie")}</th>
                  <th>${t("estimating.itemTable.description", "Descriere")}</th>
                  <th>${t("quotes.itemTable.qty", "Cant.")}</th>
                  <th>${t("estimating.itemTable.unit", "UM")}</th>
                  <th>${t("quotes.itemTable.unitPrice", "Preț U.")}</th>
                  <th>${t("estimating.itemTable.total", "Total")}</th>
                </tr>
              </thead>
              <tbody>
                ${inv.items
                  .map(
                    (item) => `
                  <tr>
                    <td>${Utils.escapeHtml(item.category || "-")}</td>
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
            <div class="col-md-6"><strong>${t("dashboard.table.client", "Client")}:</strong> ${Utils.escapeHtml(inv.client_name || "-")}</div>
            <div class="col-md-6"><strong>${t("quotes.projectLabel", "Proiect")}:</strong> ${Utils.escapeHtml(inv.project_name || "-")}</div>
            <div class="col-md-6"><strong>${t("quotes.table.issueDate", "Data Emiterii")}:</strong> ${Utils.formatDate ? Utils.formatDate(inv.issue_date) : inv.issue_date}</div>
            <div class="col-md-6"><strong>${t("invoices.table.dueDate", "Scadență")}:</strong> ${Utils.formatDate ? Utils.formatDate(inv.due_date) : inv.due_date}</div>
          </div>
          <div class="card bg-light p-3 border-0 mb-2">
            <div class="d-flex justify-content-between mb-1">
              <span>${t("quotes.subtotalMaterials", "Subtotal Materials")}:</span>
              <span>${Utils.formatCurrency(inv.subtotal_materials)}</span>
            </div>
            <div class="d-flex justify-content-between mb-1">
              <span>${t("quotes.subtotalLabor", "Subtotal Labor")}:</span>
              <span>${Utils.formatCurrency(inv.subtotal_labor)}</span>
            </div>
            <div class="d-flex justify-content-between mb-1">
              <span>${t("quotes.discount", "Discount")}:</span>
              <span>${Utils.formatCurrency(inv.discount_amount)}</span>
            </div>
            <div class="d-flex justify-content-between mb-1">
              <span>${t("quotes.table.totalNet", "Total Net")}:</span>
              <span>${Utils.formatCurrency(inv.total_net)}</span>
            </div>
            <div class="d-flex justify-content-between mb-1">
              <span>${t("quotes.vatWithRate", "TVA ({{rate}}%)", { rate: inv.vat_rate })}:</span>
              <span>${Utils.formatCurrency(inv.vat_amount)}</span>
            </div>
            <hr class="my-2">
            <div class="d-flex justify-content-between fs-5 fw-bold text-primary">
              <span>${t("invoices.totalGrossInvoice", "TOTAL BRUT FACTURĂ:")}</span>
              <span>${Utils.formatCurrency(inv.total_gross)}</span>
            </div>
            <hr class="my-2">
            <div class="d-flex justify-content-between mb-1">
              <span>${t("invoices.paidLabel", "Plătit")}:</span>
              <span class="text-success fw-bold">${Utils.formatCurrency(inv.paid_amount || 0)}</span>
            </div>
            <div class="d-flex justify-content-between">
              <span>${t("invoices.remainingBalance", "Rest de plată")}:</span>
              <span class="text-danger fw-bold">${Utils.formatCurrency(Math.max((parseFloat(inv.total_gross) || 0) - (parseFloat(inv.paid_amount) || 0), 0))}</span>
            </div>
          </div>
          ${itemsHtml}
        `;

        if (viewModalInstance) {
          viewModalInstance.show();
        }
      } else {
        Toast.show(t("invoices.detailsFetchFailed", "Nu s-au putut prelua detaliile facturii."), "danger");
      }
    } catch (err) {
      Toast.show(t("invoices.loadNetworkError", "Eroare de rețea la încărcarea facturii."), "danger");
    }
  }

  async function openEditInvoiceModal(id) {
    try {
      const response = await API.get(`/invoices/${id}`);
      if (response && response.success) {
        const inv = response.data;
        document.getElementById("editInvoiceId").value = inv.id;
        document.getElementById("editStatus").value = inv.status;
        document.getElementById("editVatRate").value = inv.vat_rate;
        document.getElementById("editIssueDate").value = inv.issue_date
          ? inv.issue_date.split("T")[0]
          : "";
        document.getElementById("editDueDate").value = inv.due_date
          ? inv.due_date.split("T")[0]
          : "";
        document.getElementById("editDiscount").value =
          inv.discount_amount || 0;

        if (editModalInstance) editModalInstance.show();
      } else {
        Toast.show(t("invoices.fetchFailed", "Nu s-au putut prelua datele facturii."), "danger");
      }
    } catch (err) {
      console.error("Eroare la deschiderea editării:", err);
      Toast.show(t("invoices.loadNetworkError", "Eroare de rețea la încărcarea facturii."), "danger");
    }
  }

  async function saveInvoiceEdit() {
    const id = document.getElementById("editInvoiceId").value;
    const payload = {
      status: document.getElementById("editStatus").value,
      vat_rate: parseFloat(document.getElementById("editVatRate").value) || 0,
      issue_date: document.getElementById("editIssueDate").value,
      due_date: document.getElementById("editDueDate").value,
      discount_amount:
        parseFloat(document.getElementById("editDiscount").value) || 0,
    };

    try {
      const response = await API.put(`/invoices/${id}`, payload);
      if (response && response.success) {
        Toast.show(t("invoices.updated", "Factura a fost actualizată cu succes."), "success");
        if (editModalInstance) editModalInstance.hide();
        loadInvoices();
      } else {
        const msg =
          response && response.message
            ? response.message
            : t("invoices.updateFailed", "Nu s-a putut actualiza factura.");
        Toast.show(msg, "danger");
      }
    } catch (err) {
      console.error("Eroare la salvarea facturii:", err);
      const msg = err.message || t("invoices.saveNetworkError", "Eroare de rețea la salvarea facturii.");
      Toast.show(msg, "danger");
    }
  }

  function renderPagination(pagination) {
    if (!paginationContainer) return;

    if (!pagination || pagination.totalPages <= 1) {
      paginationContainer.innerHTML = "";
      return;
    }

    const { currentPage: page, totalPages } = pagination;
    let html = `<ul class="pagination pagination-sm justify-content-end mb-0">`;

    html += `
      <li class="page-item ${page === 1 ? "disabled" : ""}">
        <button class="page-link" data-page="${page - 1}">${t("common.back", "Înapoi")}</button>
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
        <button class="page-link" data-page="${page + 1}">${t("common.next", "Înainte")}</button>
      </li>
    `;

    html += `</ul>`;
    paginationContainer.innerHTML = html;

    paginationContainer.querySelectorAll(".page-link").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const targetPage = parseInt(e.target.dataset.page, 10);
        if (targetPage >= 1 && targetPage <= totalPages) {
          currentPage = targetPage;
          loadInvoices();
        }
      });
    });
  }

  function getStatusBadgeColor(status) {
    switch (status) {
      case "paid":
        return "success";
      case "issued":
        return "info text-dark";
      case "draft":
        return "secondary";
      case "partially_paid":
        return "warning text-dark";
      case "overdue":
        return "danger";
      case "canceled":
        return "dark";
      default:
        return "secondary";
    }
  }
});
