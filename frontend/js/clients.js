document.addEventListener("DOMContentLoaded", () => {
  // --- STATE MANAGEMENT ---
  let currentPage = 1;
  let currentSearch = "";
  let selectedClientId = null;

  // --- DOM ELEMENTS ---
  const tableBody = document.getElementById("clientsTableBody");
  const tableSpinner = document.getElementById("tableSpinner");
  const tableEmptyState = document.getElementById("tableEmptyState");
  const searchInput = document.getElementById("searchInput");
  const paginationControls = document.getElementById("paginationControls");
  const paginationInfo = document.getElementById("paginationInfo");

  // Modal Elements
  const clientForm = document.getElementById("clientForm");
  const clientModalEl = document.getElementById("clientModal");
  const deleteModalEl = document.getElementById("deleteModal");
  const clientModal = new bootstrap.Modal(clientModalEl);
  const deleteModal = new bootstrap.Modal(deleteModalEl);

  // Form Inputs
  const inputId = document.getElementById("clientId");
  const inputName = document.getElementById("clientName");
  const inputCompany = document.getElementById("clientCompany");
  const inputEmail = document.getElementById("clientEmail");
  const inputPhone = document.getElementById("clientPhone");
  const inputCity = document.getElementById("clientCity");

  // Buttons
  const btnConfirmDelete = document.getElementById("btnConfirmDelete");
  const btnOpenAddModal = document.getElementById("btnOpenAddModal");

  // --- INITIAL FETCH ---
  fetchClients();

  // --- SEARCH CU DEBOUNCE REUTILIZABIL DIN UTILS ---
  if (searchInput) {
    searchInput.addEventListener(
      "input",
      Utils.debounce((e) => {
        currentSearch = e.target.value.trim();
        currentPage = 1;
        fetchClients();
      }, 300),
    );
  }

  // --- FETCH CLIENTS (GET) ---
  async function fetchClients() {
    showLoading(true);
    try {
      const query = `/clients?page=${currentPage}&limit=${CONFIG.DEFAULT_PAGE_LIMIT}&search=${encodeURIComponent(currentSearch)}`;
      const result = await API.get(query);

      const clients = result.data || result;
      const total = result.total || clients.length;

      renderTable(clients);
      renderPagination(total);
    } catch (err) {
      Toast.show(
        err.message || "Eroare la încărcarea listei de clienți.",
        "danger",
      );
    } finally {
      showLoading(false);
    }
  }

  // --- RENDER TABLE ---
  function renderTable(clients) {
    tableBody.innerHTML = "";

    if (!clients || clients.length === 0) {
      tableEmptyState.classList.remove("d-none");
      return;
    }

    tableEmptyState.classList.add("d-none");

    clients.forEach((client) => {
      const tr = document.createElement("tr");
      // MENTIUNE: client.company_name din schema PostgreSQL
      const companyDisplayName = client.company_name || client.company || "-";

      tr.innerHTML = `
                <td>
                    <div class="fw-bold text-dark">${Utils.escapeHtml(Utils.capitalize(client.name))}</div>
                    <small class="text-muted">${Utils.escapeHtml(companyDisplayName)}</small>
                </td>
                <td>
                    <div><i class="fas fa-envelope me-1 text-muted small"></i> ${Utils.escapeHtml(client.email)}</div>
                    <small class="text-muted"><i class="fas fa-phone me-1 small"></i> ${Utils.escapeHtml(Utils.formatPhone(client.phone))}</small>
                </td>
                <td>
                    <span class="text-secondary">${Utils.escapeHtml(client.city || "-")}</span>
                </td>
                <td>
                    <span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill">
                        Activ
                    </span>
                </td>
                <td class="text-end pe-4">
                    <button class="btn btn-sm btn-outline-primary me-1 btn-edit" data-id="${client._id || client.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger btn-delete" data-id="${client._id || client.id}">
                        <i class="fas fa-trash-can"></i>
                    </button>
                </td>
            `;

      tr.querySelector(".btn-edit").addEventListener("click", () =>
        openEditModal(client),
      );
      tr.querySelector(".btn-delete").addEventListener("click", () =>
        openDeleteModal(client._id || client.id),
      );

      tableBody.appendChild(tr);
    });
  }

  // --- SAVE CLIENT (POST / PUT) + VALIDARE ---
  if (clientForm) {
    clientForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const payload = {
        name: inputName.value.trim(),
        company_name: inputCompany.value.trim() || inputName.value.trim(), // Rezolvă NOT NULL constraint
        email: inputEmail.value.trim(),
        phone: inputPhone.value.trim(),
        city: inputCity.value.trim() || "-",
      };

      if (!validateClientForm(payload)) return;

      const isEdit = Boolean(inputId.value);
      const endpoint = isEdit ? `/clients/${inputId.value}` : "/clients";

      try {
        if (isEdit) {
          await API.put(endpoint, payload);
        } else {
          await API.post(endpoint, payload);
        }

        clientModal.hide();
        Toast.show(
          isEdit ? "Client actualizat cu succes!" : "Client adăugat cu succes!",
          "success",
        );
        fetchClients();
      } catch (err) {
        Toast.show(err.message, "danger");
      }
    });
  }

  // --- DELETE CLIENT (DELETE) ---
  if (btnConfirmDelete) {
    btnConfirmDelete.addEventListener("click", async () => {
      if (!selectedClientId) return;

      try {
        await API.delete(`/clients/${selectedClientId}`);
        deleteModal.hide();
        Toast.show("Clientul a fost șters.", "warning");
        fetchClients();
      } catch (err) {
        Toast.show(err.message, "danger");
      }
    });
  }

  // --- VALIDARE FORMULAR ---
  function validateClientForm(data) {
    if (!data.name || data.name.length < 3) {
      Toast.show("Numele trebuie să conțină cel puțin 3 caractere!", "danger");
      return false;
    }

    if (!data.email || !Utils.isEmail(data.email)) {
      Toast.show("Introduceți o adresă de email validă!", "danger");
      return false;
    }

    if (!data.phone || data.phone.length < 7) {
      Toast.show("Introduceți un număr de telefon valid!", "danger");
      return false;
    }

    return true;
  }

  // --- MODAL HELPERS ---
  if (btnOpenAddModal) {
    btnOpenAddModal.addEventListener("click", () => {
      clientForm.reset();
      inputId.value = "";
      document.getElementById("clientModalLabel").textContent =
        "Adaugă Client Nou";
    });
  }

  function openEditModal(client) {
    inputId.value = client._id || client.id;
    inputName.value = client.name || "";
    inputCompany.value = client.company_name || client.company || ""; // Fix pentru populare câmp companie
    inputEmail.value = client.email || "";
    inputPhone.value = client.phone || "";
    inputCity.value = client.city || "";

    document.getElementById("clientModalLabel").textContent = "Editează Client";
    clientModal.show();
  }

  function openDeleteModal(id) {
    selectedClientId = id;
    deleteModal.show();
  }

  // --- PAGINATION ---
  function renderPagination(totalItems) {
    const totalPages = Math.ceil(totalItems / CONFIG.DEFAULT_PAGE_LIMIT) || 1;
    paginationControls.innerHTML = "";

    const startItem =
      totalItems === 0 ? 0 : (currentPage - 1) * CONFIG.DEFAULT_PAGE_LIMIT + 1;
    const endItem = Math.min(
      currentPage * CONFIG.DEFAULT_PAGE_LIMIT,
      totalItems,
    );
    paginationInfo.textContent = `Afișare ${startItem} - ${endItem} din ${totalItems} clienți`;

    if (totalPages <= 1) return;

    paginationControls.appendChild(
      createPageItem("«", currentPage > 1, () => {
        currentPage--;
        fetchClients();
      }),
    );

    for (let i = 1; i <= totalPages; i++) {
      paginationControls.appendChild(
        createPageItem(
          i,
          true,
          () => {
            currentPage = i;
            fetchClients();
          },
          i === currentPage,
        ),
      );
    }

    paginationControls.appendChild(
      createPageItem("»", currentPage < totalPages, () => {
        currentPage++;
        fetchClients();
      }),
    );
  }

  function createPageItem(text, enabled, onClick, isActive = false) {
    const li = document.createElement("li");
    li.className = `page-item ${!enabled ? "disabled" : ""} ${isActive ? "active" : ""}`;
    const a = document.createElement("a");
    a.className = "page-link";
    a.href = "#";
    a.textContent = text;
    if (enabled) {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        onClick();
      });
    }
    li.appendChild(a);
    return li;
  }

  // --- UI UTILS ---
  function showLoading(isLoading) {
    if (isLoading) {
      tableSpinner.classList.remove("d-none");
      tableBody.innerHTML = "";
      tableEmptyState.classList.add("d-none");
    } else {
      tableSpinner.classList.add("d-none");
    }
  }
});
