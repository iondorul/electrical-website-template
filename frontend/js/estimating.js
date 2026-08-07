document.addEventListener("DOMContentLoaded", async () => {
  let currentPage = 1;
  let currentSearch = "";

  const tableBody = document.getElementById("estimatesTableBody");
  const searchInput = document.getElementById("searchInput");
  const itemsBody = document.getElementById("estimateItemsBody");
  const paginationContainer = document.getElementById("paginationContainer");

  // Inițializare Modale
  let modalInstance = null;
  const modalEl = document.getElementById("estimateModal");
  if (modalEl) {
    modalInstance = new bootstrap.Modal(modalEl);
  }

  let deleteModalInstance = null;
  const deleteModalEl = document.getElementById("deleteModal");
  if (deleteModalEl) {
    deleteModalInstance = new bootstrap.Modal(deleteModalEl);
  }

  // Încărcare inițială date și opțiuni select
  await loadEstimates();
  await loadSelectOptions();

  // Event Căutare
  if (searchInput) {
    searchInput.addEventListener(
      "input",
      Utils.debounce((e) => {
        currentSearch = e.target.value.trim();
        currentPage = 1;
        loadEstimates();
      }, 300),
    );
  }

  // Deschide Modal Creare Deviz
  document
    .getElementById("btnOpenCreateModal")
    ?.addEventListener("click", async () => {
      resetForm();
      await loadSelectOptions();
      document.getElementById("modalTitle").textContent = "Deviz Nou";
      addItemRow();
      modalInstance.show();
    });

  // Adăugare linie nouă
  document.getElementById("btnAddItem")?.addEventListener("click", () => {
    addItemRow();
  });

  // Salvare Deviz
  document
    .getElementById("btnSaveEstimate")
    ?.addEventListener("click", async () => {
      await saveEstimate();
    });

  // Confirmare Ștergere
  document
    .getElementById("btnConfirmDelete")
    ?.addEventListener("click", async () => {
      const id = document.getElementById("deleteEstimateId").value;
      if (id) {
        await executeDelete(id);
      }
    });

  // --- FUNCTII CRUD & UI ---

  async function loadEstimates() {
    try {
      tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">Se încarcă devizele...</td></tr>`;

      const queryParams = new URLSearchParams({
        page: currentPage,
        limit: 10,
        search: currentSearch,
      });

      const response = await API.get(`/estimates?${queryParams.toString()}`);

      if (response && response.success) {
        renderTable(response.data || []);
        renderPagination(response.pagination);
      } else {
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">Nu s-au putut încărca datele.</td></tr>`;
      }
    } catch (err) {
      console.error("Eroare la încărcare:", err);
      Toast.show("Eroare de rețea la încărcarea devizelor.", "danger");
      tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">Eroare de rețea.</td></tr>`;
    }
  }

  function renderTable(estimates) {
    if (!estimates || estimates.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">Nu există devize înregistrate.</td></tr>`;
      return;
    }

    tableBody.innerHTML = estimates
      .map(
        (est) => `
            <tr>
                <td class="ps-4">
                    <strong class="d-block text-primary">${Utils.escapeHtml(est.estimate_number)}</strong>
                    <small class="text-muted">${Utils.escapeHtml(est.title)}</small>
                </td>
                <td>
                    <span class="d-block fw-bold">${Utils.escapeHtml(est.client_name || "-")}</span>
                    <small class="text-muted">${Utils.escapeHtml(est.project_name || "Fără proiect")}</small>
                </td>
                <td><span class="badge bg-${getStatusBadgeColor(est.status)}">${Utils.escapeHtml(est.status)}</span></td>
                <td>${parseFloat(est.total_labor_hours || 0).toFixed(1)} h</td>
                <td class="fw-bold">${Utils.formatCurrency(est.grand_total)}</td>
                <td class="text-end pe-4">
                    <button type="button" class="btn btn-sm btn-outline-primary me-1 btn-edit" data-id="${est.id}" title="Editare">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-danger btn-delete" data-id="${est.id}" title="Arhivare">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `,
      )
      .join("");

    document.querySelectorAll(".btn-edit").forEach((btn) => {
      btn.addEventListener("click", () => editEstimate(btn.dataset.id));
    });
    document.querySelectorAll(".btn-delete").forEach((btn) => {
      btn.addEventListener("click", () => promptDelete(btn.dataset.id));
    });
  }

  function addItemRow(item = {}) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td>
                <select class="form-select form-select-sm item-type">
                    <option value="material" ${item.item_type === "material" ? "selected" : ""}>Material</option>
                    <option value="labor" ${item.item_type === "labor" ? "selected" : ""}>Manoperă</option>
                    <option value="equipment" ${item.item_type === "equipment" ? "selected" : ""}>Echipament</option>
                    <option value="service" ${item.item_type === "service" ? "selected" : ""}>Serviciu</option>
                    <option value="consumable" ${item.item_type === "consumable" ? "selected" : ""}>Consumabil</option>
                </select>
            </td>
            <td>
                <input type="text" class="form-control form-control-sm item-desc" value="${Utils.escapeHtml(item.description || "")}" placeholder="Descriere linie...">
            </td>
            <td>
                <input type="number" class="form-control form-control-sm item-qty" value="${item.quantity || 1}" step="0.1" min="0.1">
            </td>
            <td>
                <select class="form-select form-select-sm item-um">
                    <option value="buc" ${item.unit_of_measure === "buc" ? "selected" : ""}>buc</option>
                    <option value="m" ${item.unit_of_measure === "m" ? "selected" : ""}>m</option>
                    <option value="ml" ${item.unit_of_measure === "ml" ? "selected" : ""}>ml</option>
                    <option value="mp" ${item.unit_of_measure === "mp" ? "selected" : ""}>mp</option>
                    <option value="mc" ${item.unit_of_measure === "mc" ? "selected" : ""}>mc</option>
                    <option value="kg" ${item.unit_of_measure === "kg" ? "selected" : ""}>kg</option>
                    <option value="set" ${item.unit_of_measure === "set" ? "selected" : ""}>set</option>
                    <option value="h" ${item.unit_of_measure === "h" ? "selected" : ""}>h</option>
                </select>
            </td>
            <td>
                <input type="number" class="form-control form-control-sm item-cost" value="${item.unit_cost || 0}" step="0.01" min="0">
            </td>
            <td>
                <input type="number" class="form-control form-control-sm item-margin" value="${item.margin_percent || 0}" step="1" min="0">
            </td>
            <td class="fw-bold text-end align-middle item-total">0,00 EUR</td>
            <td class="text-center align-middle">
                <button type="button" class="btn btn-sm text-danger border-0 btn-remove-row"><i class="fas fa-times"></i></button>
            </td>
        `;

    itemsBody.appendChild(tr);

    tr.querySelectorAll("input, select").forEach((el) => {
      el.addEventListener("input", (e) => {
        e.target.classList.remove("is-invalid");
        calculateTotals();
      });
    });

    tr.querySelector(".btn-remove-row").addEventListener("click", () => {
      tr.remove();
      calculateTotals();
    });

    calculateTotals();
  }

  function calculateTotals() {
    let grandTotal = 0;
    document.querySelectorAll("#estimateItemsBody tr").forEach((row) => {
      const qty = parseFloat(row.querySelector(".item-qty").value) || 0;
      const cost = parseFloat(row.querySelector(".item-cost").value) || 0;
      const margin = parseFloat(row.querySelector(".item-margin").value) || 0;

      const unitPrice = cost + cost * (margin / 100);
      const totalPrice = qty * unitPrice;

      row.querySelector(".item-total").textContent =
        Utils.formatCurrency(totalPrice);
      grandTotal += totalPrice;
    });

    document.getElementById("modalGrandTotal").textContent =
      Utils.formatCurrency(grandTotal);
  }

  function validateForm() {
    clearValidations();
    let isValid = true;

    const titleEl = document.getElementById("estTitle");
    const clientEl = document.getElementById("estClient");

    if (!titleEl.value.trim()) {
      titleEl.classList.add("is-invalid");
      isValid = false;
    }

    if (!clientEl.value) {
      clientEl.classList.add("is-invalid");
      isValid = false;
    }

    const rows = document.querySelectorAll("#estimateItemsBody tr");
    if (rows.length === 0) {
      Toast.show("Devizul trebuie să conțină cel puțin o linie.", "warning");
      isValid = false;
    }

    rows.forEach((row) => {
      const descEl = row.querySelector(".item-desc");
      const qtyEl = row.querySelector(".item-qty");
      const costEl = row.querySelector(".item-cost");

      if (!descEl.value.trim()) {
        descEl.classList.add("is-invalid");
        isValid = false;
      }

      if (parseFloat(qtyEl.value) <= 0 || isNaN(parseFloat(qtyEl.value))) {
        qtyEl.classList.add("is-invalid");
        isValid = false;
      }

      if (parseFloat(costEl.value) < 0 || isNaN(parseFloat(costEl.value))) {
        costEl.classList.add("is-invalid");
        isValid = false;
      }
    });

    if (!isValid) {
      Toast.show(
        "Te rugăm să completezi câmpurile marcate cu roșu.",
        "warning",
      );
    }

    return isValid;
  }

  function clearValidations() {
    document.querySelectorAll("#estimateForm .is-invalid").forEach((el) => {
      el.classList.remove("is-invalid");
    });
  }

  async function saveEstimate() {
    if (!validateForm()) return;

    const id = document.getElementById("estimateId").value;
    const title = document.getElementById("estTitle").value.trim();
    const client_id = document.getElementById("estClient").value;

    const items = [];
    document.querySelectorAll("#estimateItemsBody tr").forEach((row) => {
      items.push({
        item_type: row.querySelector(".item-type").value,
        description: row.querySelector(".item-desc").value.trim(),
        quantity: parseFloat(row.querySelector(".item-qty").value) || 0,
        unit_of_measure: row.querySelector(".item-um").value,
        unit_cost: parseFloat(row.querySelector(".item-cost").value) || 0,
        margin_percent:
          parseFloat(row.querySelector(".item-margin").value) || 0,
      });
    });

    const payload = {
      title,
      client_id,
      project_id: document.getElementById("estProject").value || null,
      status: document.getElementById("estStatus").value,
      notes: document.getElementById("estNotes").value.trim(),
      items,
    };

    try {
      const response = id
        ? await API.put(`/estimates/${id}`, payload)
        : await API.post("/estimates", payload);

      if (response && response.success) {
        Toast.show(
          id
            ? "Estimare actualizată cu succes!"
            : "Estimare salvată cu succes!",
          "success",
        );
        modalInstance.hide();
        await loadEstimates();
      } else {
        Toast.show(
          response.message || "Eroare la salvarea devizului.",
          "danger",
        );
      }
    } catch (err) {
      console.error("Eroare salvare:", err);
      Toast.show("Eroare de rețea la salvarea devizului.", "danger");
    }
  }

  async function editEstimate(id) {
    try {
      await loadSelectOptions();
      clearValidations();
      const response = await API.get(`/estimates/${id}`);
      if (response && response.success) {
        const est = response.data;
        document.getElementById("estimateId").value = est.id;
        document.getElementById("estTitle").value = est.title;
        document.getElementById("estClient").value = est.client_id;
        document.getElementById("estProject").value = est.project_id || "";
        document.getElementById("estStatus").value = est.status;
        document.getElementById("estNotes").value = est.notes || "";

        itemsBody.innerHTML = "";
        if (est.items && est.items.length > 0) {
          est.items.forEach((item) => addItemRow(item));
        } else {
          addItemRow();
        }

        document.getElementById("modalTitle").textContent = "Editare Deviz";
        modalInstance.show();
      } else {
        Toast.show("Eroare la preluarea datelor devizului.", "danger");
      }
    } catch (err) {
      Toast.show("Eroare de rețea la încărcarea devizului.", "danger");
    }
  }

  function promptDelete(id) {
    document.getElementById("deleteEstimateId").value = id;
    deleteModalInstance.show();
  }

  async function executeDelete(id) {
    try {
      const response = await API.delete(`/estimates/${id}`);
      if (response && response.success) {
        Toast.show("Estimare arhivată cu succes!", "warning");
        deleteModalInstance.hide();
        await loadEstimates();
      } else {
        Toast.show(
          response.message || "Eroare la arhivarea devizului.",
          "danger",
        );
      }
    } catch (err) {
      Toast.show("Eroare de rețea la arhivarea devizului.", "danger");
    }
  }

  async function loadSelectOptions() {
    try {
      const [clientsRes, projectsRes] = await Promise.all([
        API.get("/clients"),
        API.get("/projects"),
      ]);

      const clientSelect = document.getElementById("estClient");
      if (clientSelect && clientsRes) {
        const clientsList = Array.isArray(clientsRes)
          ? clientsRes
          : clientsRes.data || clientsRes.clients || [];

        if (clientsList.length > 0) {
          clientSelect.innerHTML =
            `<option value="">Selectează client...</option>` +
            clientsList
              .map(
                (c) =>
                  `<option value="${c.id}">${Utils.escapeHtml(
                    c.company_name ||
                      c.client_name ||
                      c.contact_person ||
                      "Client #" + c.id,
                  )}</option>`,
              )
              .join("");
        } else {
          clientSelect.innerHTML = `<option value="">Niciun client găsit</option>`;
        }
      }

      const projectSelect = document.getElementById("estProject");
      if (projectSelect && projectsRes) {
        const projectsList = Array.isArray(projectsRes)
          ? projectsRes
          : projectsRes.data || projectsRes.projects || [];

        projectSelect.innerHTML =
          `<option value="">Fără proiect asociat</option>` +
          projectsList
            .map(
              (p) =>
                `<option value="${p.id}">${Utils.escapeHtml(
                  p.project_name || p.name || "Proiect #" + p.id,
                )}</option>`,
            )
            .join("");
      }
    } catch (err) {
      console.error("Eroare opțiuni select:", err);
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
          loadEstimates();
        }
      });
    });
  }

  function resetForm() {
    clearValidations();
    document.getElementById("estimateId").value = "";
    document.getElementById("estimateForm").reset();
    itemsBody.innerHTML = "";
    document.getElementById("modalGrandTotal").textContent = "0,00 EUR";
  }

  function getStatusBadgeColor(status) {
    switch (status) {
      case "completed":
        return "success";
      case "in_progress":
        return "warning text-dark";
      case "planned":
        return "info text-dark";
      case "on_hold":
        return "dark";
      case "cancelled":
        return "danger";
      default:
        return "secondary";
    }
  }

  ["estTitle", "estClient"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", (e) => {
      e.target.classList.remove("is-invalid");
    });
    document.getElementById(id)?.addEventListener("change", (e) => {
      e.target.classList.remove("is-invalid");
    });
  });
});
