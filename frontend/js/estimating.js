document.addEventListener("DOMContentLoaded", async () => {
  let currentPage = 1;
  let currentSearch = "";

  let materialsCache = [];
  let materialsMap = new Map();

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

  // Încărcare inițială date și opțiuni select
  await loadEstimates();
  await loadSelectOptions();
  await loadMaterialsCache();

  // La schimbarea de limbă: re-randează tabelul + opțiunile select cu datele
  // curente, reutilizând fluxurile existente — fără logică nouă.
  document.addEventListener("erp:locale-changed", () => {
    loadEstimates();
    loadSelectOptions();
  });

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
      document.getElementById("modalTitle").textContent = t("estimating.newEstimate", "Deviz Nou");
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
      tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">${t("estimating.loadingList", "Se încarcă devizele...")}</td></tr>`;

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
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">${t("estimating.loadDataFailed", "Nu s-au putut încărca datele.")}</td></tr>`;
      }
    } catch (err) {
      console.error("Eroare la încărcare:", err);
      Toast.show(t("estimating.networkLoadError", "Eroare de rețea la încărcarea devizelor."), "danger");
      tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">${t("common.networkError", "Eroare de rețea.")}</td></tr>`;
    }
  }

  // Etichetă de status — necesară deoarece azi statusul se afișa BRUT
  // (Utils.escapeHtml(est.status), fără nicio traducere existentă), spre
  // deosebire de projects.js care are deja o mapare completă. getStatusBadgeColor
  // de mai jos rămâne neatinsă (culoare, nu text) — doar eticheta e nouă.
  function getStatusLabel(status) {
    const labels = {
      draft: t("estimating.status.draft", "Ciornă (Draft)"),
      planned: t("projects.status.planned", "Planificat"),
      in_progress: t("projects.status.in_progress", "În Lucru"),
      on_hold: t("projects.status.on_hold", "În Așteptare"),
      completed: t("projects.status.completed", "Finalizat"),
      cancelled: t("projects.status.cancelled", "Anulat"),
    };
    return labels[status] || status;
  }

  function renderTable(estimates) {
    if (!estimates || estimates.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">${t("estimating.noEstimates", "Nu există devize înregistrate.")}</td></tr>`;
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
                    <small class="text-muted">${Utils.escapeHtml(est.project_name || t("estimating.noProject", "Fără proiect"))}</small>
                </td>
                <td><span class="badge bg-${getStatusBadgeColor(est.status)}">${Utils.escapeHtml(getStatusLabel(est.status))}</span></td>
                <td>${parseFloat(est.total_labor_hours || 0).toFixed(1)} h</td>
                <td class="fw-bold">${Utils.formatCurrency(est.grand_total)}</td>
                <td class="text-end pe-4">
                    <button type="button" class="btn btn-sm btn-outline-primary me-1 btn-edit" data-id="${est.id}" title="${t("common.edit", "Editare")}">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-danger btn-delete" data-id="${est.id}" title="${t("estimating.archiveTitle", "Arhivare")}">
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
                    <option value="material" ${item.item_type === "material" ? "selected" : ""}>${t("estimating.itemType.material", "Material")}</option>
                    <option value="labor" ${item.item_type === "labor" ? "selected" : ""}>${t("estimating.itemType.labor", "Manoperă")}</option>
                    <option value="equipment" ${item.item_type === "equipment" ? "selected" : ""}>${t("estimating.itemType.equipment", "Echipament")}</option>
                    <option value="service" ${item.item_type === "service" ? "selected" : ""}>${t("estimating.itemType.service", "Serviciu")}</option>
                    <option value="consumable" ${item.item_type === "consumable" ? "selected" : ""}>${t("estimating.itemType.consumable", "Consumabil")}</option>
                </select>
            </td>
            <td>
                <input type="text" class="form-control form-control-sm item-desc" list="materialsDatalist" value="${Utils.escapeHtml(item.description || "")}" placeholder="${t("estimating.lineDescPlaceholder", "Descriere linie...")}">
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

    tr.querySelectorAll("input, select").forEach((el) => {
      el.addEventListener("input", (e) => {
        e.target.classList.remove("is-invalid");
        calculateTotals();
      });
    });

    // Autocomplete: la selectarea unui material din listă, completează Cost și UM
    const descInput = tr.querySelector(".item-desc");
    const typeSelect = tr.querySelector(".item-type");
    descInput.addEventListener("input", (e) => {
      const match = materialsMap.get(e.target.value);
      if (match && typeSelect.value === "material") {
        tr.querySelector(".item-cost").value = match.unit_price;
        const umSelect = tr.querySelector(".item-um");
        const umOption = Array.from(umSelect.options).find(
          (o) => o.value === match.unit_of_measure,
        );
        if (umOption) {
          umSelect.value = match.unit_of_measure;
        }
        calculateTotals();
      }
    });

    // Activează sugestiile doar când tipul liniei este Material
    typeSelect.addEventListener("change", () => {
      if (typeSelect.value === "material") {
        descInput.setAttribute("list", "materialsDatalist");
      } else {
        descInput.removeAttribute("list");
      }
    });

    if (typeSelect.value !== "material") {
      descInput.removeAttribute("list");
    }

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
      Toast.show(t("estimating.needAtLeastOneLine", "Devizul trebuie să conțină cel puțin o linie."), "warning");
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
        t("estimating.fillRequiredFields", "Te rugăm să completezi câmpurile marcate cu roșu."),
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
            ? t("estimating.updated", "Estimare actualizată cu succes!")
            : t("estimating.created", "Estimare salvată cu succes!"),
          "success",
        );
        modalInstance.hide();
        await loadEstimates();
      } else {
        Toast.show(
          response.message || t("estimating.saveFailed", "Eroare la salvarea devizului."),
          "danger",
        );
      }
    } catch (err) {
      console.error("Eroare salvare:", err);
      Toast.show(t("estimating.saveNetworkError", "Eroare de rețea la salvarea devizului."), "danger");
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

        document.getElementById("modalTitle").textContent = t("estimating.editEstimate", "Editare Deviz");
        modalInstance.show();
      } else {
        Toast.show(t("estimating.fetchFailed", "Eroare la preluarea datelor devizului."), "danger");
      }
    } catch (err) {
      Toast.show(t("estimating.loadNetworkError", "Eroare de rețea la încărcarea devizului."), "danger");
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
        Toast.show(t("estimating.archived", "Estimare arhivată cu succes!"), "warning");
        deleteModalInstance.hide();
        await loadEstimates();
      } else {
        Toast.show(
          response.message || t("estimating.archiveFailed", "Eroare la arhivarea devizului."),
          "danger",
        );
      }
    } catch (err) {
      Toast.show(t("estimating.archiveNetworkError", "Eroare de rețea la arhivarea devizului."), "danger");
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
            `<option value="">${t("estimating.selectClient", "Selectează client...")}</option>` +
            clientsList
              .map(
                (c) =>
                  `<option value="${c.id}">${Utils.escapeHtml(
                    c.company_name ||
                      c.client_name ||
                      c.contact_person ||
                      t("estimating.clientHashLabel", "Client #{{id}}", { id: c.id }),
                  )}</option>`,
              )
              .join("");
        } else {
          clientSelect.innerHTML = `<option value="">${t("estimating.noClientFound", "Niciun client găsit")}</option>`;
        }
      }

      const projectSelect = document.getElementById("estProject");
      if (projectSelect && projectsRes) {
        const projectsList = Array.isArray(projectsRes)
          ? projectsRes
          : projectsRes.data || projectsRes.projects || [];

        projectSelect.innerHTML =
          `<option value="">${t("estimating.noAssociatedProject", "Fără proiect asociat")}</option>` +
          projectsList
            .map(
              (p) =>
                `<option value="${p.id}">${Utils.escapeHtml(
                  p.project_name || p.name || t("estimating.projectHashLabel", "Proiect #{{id}}", { id: p.id }),
                )}</option>`,
            )
            .join("");
      }
    } catch (err) {
      console.error("Eroare opțiuni select:", err);
    }
  }

  async function loadMaterialsCache() {
    try {
      const response = await API.get("/materials?limit=1000");
      if (response && response.success) {
        materialsCache = response.data || [];
        materialsMap.clear();

        const datalist = document.getElementById("materialsDatalist");
        if (datalist) {
          datalist.innerHTML = materialsCache
            .map((mat) => {
              const label = mat.item_code
                ? `${mat.name} (${mat.item_code})`
                : mat.name;
              materialsMap.set(label, mat);
              return `<option value="${Utils.escapeHtml(label)}"></option>`;
            })
            .join("");
        }
      }
    } catch (err) {
      console.error("Eroare la încărcarea catalogului de materiale:", err);
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
