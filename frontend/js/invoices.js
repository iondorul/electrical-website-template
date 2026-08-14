document.addEventListener("DOMContentLoaded", async () => {
  let currentPage = 1;
  let currentSearch = "";
  let currentStatus = "";

  const btnDeleteAll = document.getElementById("btnDeleteAllInvoices");
  if (btnDeleteAll) {
    btnDeleteAll.addEventListener("click", async () => {
      const confirmed = confirm(
        "Sigur dorești să ștergi TOATE facturile? Această acțiune este ireversibilă!",
      );
      if (!confirmed) return;

      try {
        const response = await API.delete("/invoices");
        if (response && response.success) {
          if (typeof Toast !== "undefined") {
            Toast.show("Toate facturile au fost șterse cu succes.", "success");
          } else {
            alert("Toate facturile au fost șterse cu succes.");
          }
          currentPage = 1;
          loadInvoices();
        } else {
          const msg =
            response && response.message
              ? response.message
              : "Nu s-au putut șterge facturile.";
          if (typeof Toast !== "undefined") {
            Toast.show(msg, "danger");
          } else {
            alert(msg);
          }
        }
      } catch (err) {
        console.error("Eroare la ștergerea totală a facturilor:", err);
        if (typeof Toast !== "undefined") {
          Toast.show("Eroare de rețea la ștergerea facturilor.", "danger");
        } else {
          alert("Eroare de rețea.");
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

  // Încărcare inițială
  await loadInvoices();

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

  async function loadInvoices() {
    try {
      if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">Se încarcă facturile...</td></tr>`;
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
          tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4">Nu s-au putut încărca facturile.</td></tr>`;
        }
      }
    } catch (err) {
      console.error("Eroare la încărcare facturi:", err);
      if (typeof Toast !== "undefined") {
        Toast.show("Eroare de rețea la încărcarea facturilor.", "danger");
      }
      if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4">Eroare de rețea.</td></tr>`;
      }
    }
  }

  function renderTable(invoices) {
    if (!tableBody) return;

    if (!invoices || invoices.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">Nu există facturi înregistrate.</td></tr>`;
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
                    <small class="text-muted">${Utils.escapeHtml(inv.project_name || "Fără proiect")}</small>
                </td>
                <td>${Utils.formatDate ? Utils.formatDate(inv.issue_date) : inv.issue_date}</td>
                <td>${Utils.formatDate ? Utils.formatDate(inv.due_date) : inv.due_date}</td>
                <td>${Utils.formatCurrency(inv.total_net)}</td>
                <td class="fw-bold">${Utils.formatCurrency(inv.total_gross)}</td>
                <td><span class="badge bg-${getStatusBadgeColor(inv.status)}">${Utils.escapeHtml(inv.status.toUpperCase())}</span></td>
                <td class="text-end pe-4">
                    <button type="button" class="btn btn-sm btn-outline-info me-1 btn-view" data-id="${inv.id}" title="Vizualizare">
                        <i class="fas fa-eye"></i>
                    </button>
                     <button type="button" class="btn btn-sm btn-outline-primary btn-edit" data-id="${inv.id}" title="Editare">
                        <i class="fas fa-pen"></i>
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
  }

  async function viewInvoiceDetails(id) {
    try {
      const response = await API.get(`/invoices/${id}`);
      if (response && response.success) {
        const inv = response.data;
        document.getElementById("viewModalTitle").textContent =
          `Detalii Factură: ${inv.invoice_number}`;

        let itemsHtml = "";
        if (inv.items && inv.items.length > 0) {
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
            <div class="col-md-6"><strong>Client:</strong> ${Utils.escapeHtml(inv.client_name || "-")}</div>
            <div class="col-md-6"><strong>Proiect:</strong> ${Utils.escapeHtml(inv.project_name || "-")}</div>
            <div class="col-md-6"><strong>Data Emiterii:</strong> ${Utils.formatDate ? Utils.formatDate(inv.issue_date) : inv.issue_date}</div>
            <div class="col-md-6"><strong>Scadență:</strong> ${Utils.formatDate ? Utils.formatDate(inv.due_date) : inv.due_date}</div>
          </div>
          <div class="card bg-light p-3 border-0 mb-2">
            <div class="d-flex justify-content-between mb-1">
              <span>Subtotal Materials:</span>
              <span>${Utils.formatCurrency(inv.subtotal_materials)}</span>
            </div>
            <div class="d-flex justify-content-between mb-1">
              <span>Subtotal Labor:</span>
              <span>${Utils.formatCurrency(inv.subtotal_labor)}</span>
            </div>
            <div class="d-flex justify-content-between mb-1">
              <span>Discount:</span>
              <span>${Utils.formatCurrency(inv.discount_amount)}</span>
            </div>
            <div class="d-flex justify-content-between mb-1">
              <span>Total Net:</span>
              <span>${Utils.formatCurrency(inv.total_net)}</span>
            </div>
            <div class="d-flex justify-content-between mb-1">
              <span>TVA (${inv.vat_rate}%):</span>
              <span>${Utils.formatCurrency(inv.vat_amount)}</span>
            </div>
            <hr class="my-2">
            <div class="d-flex justify-content-between fs-5 fw-bold text-primary">
              <span>TOTAL BRUT FACTURĂ:</span>
              <span>${Utils.formatCurrency(inv.total_gross)}</span>
            </div>
          </div>
          ${itemsHtml}
        `;

        if (viewModalInstance) {
          viewModalInstance.show();
        }
      } else {
        Toast.show("Nu s-au putut prelua detaliile facturii.", "danger");
      }
    } catch (err) {
      Toast.show("Eroare de rețea la încărcarea facturii.", "danger");
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
        Toast.show("Nu s-au putut prelua datele facturii.", "danger");
      }
    } catch (err) {
      console.error("Eroare la deschiderea editării:", err);
      Toast.show("Eroare de rețea la încărcarea facturii.", "danger");
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
        Toast.show("Factura a fost actualizată cu succes.", "success");
        if (editModalInstance) editModalInstance.hide();
        loadInvoices();
      } else {
        const msg =
          response && response.message
            ? response.message
            : "Nu s-a putut actualiza factura.";
        Toast.show(msg, "danger");
      }
    } catch (err) {
      console.error("Eroare la salvarea facturii:", err);
      const msg = err.message || "Eroare de rețea la salvarea facturii.";
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
