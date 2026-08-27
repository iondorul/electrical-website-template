document.addEventListener("DOMContentLoaded", () => {
  // --- STATE MANAGEMENT ---
  let currentPage = 1;
  let currentSearch = "";
  let selectedProjectId = null;

  // A. La începutul fișierului, adaugă referințele inputs:
  const inputStartDate = document.getElementById("projectStartDate");
  const inputEndDate = document.getElementById("projectEndDate");
  const inputCompletionDate = document.getElementById("projectCompletionDate");

  // --- DOM ELEMENTS ---
  const tableBody = document.getElementById("projectsTableBody");
  const tableSpinner = document.getElementById("tableSpinner");
  const tableEmptyState = document.getElementById("tableEmptyState");
  const searchInput = document.getElementById("searchInput");
  const paginationControls = document.getElementById("paginationControls");
  const paginationInfo = document.getElementById("paginationInfo");

  // Modal Elements
  const projectForm = document.getElementById("projectForm");
  const projectModalEl = document.getElementById("projectModal");
  const deleteModalEl = document.getElementById("deleteModal");
  const projectModal = new bootstrap.Modal(projectModalEl);
  const deleteModal = new bootstrap.Modal(deleteModalEl);

  // Form Inputs
  const inputId = document.getElementById("projectId");
  const inputName = document.getElementById("projectName");
  const inputClient = document.getElementById("projectClient");
  const inputStatus = document.getElementById("projectStatus");
  const inputPriority = document.getElementById("projectPriority");
  const inputEstimatedValue = document.getElementById("projectEstimatedValue");
  const inputDescription = document.getElementById("projectDescription");

  // Buttons
  const btnConfirmDelete = document.getElementById("btnConfirmDelete");
  const btnOpenAddModal = document.getElementById("btnOpenAddModal");

  // --- INITIAL FETCH ---
  loadClientsDropdown();
  fetchProjects();

  // La schimbarea de limbă: re-randează cu datele curente (pagină/căutare),
  // reutilizând exact fluxul existent — fără logică nouă.
  document.addEventListener("erp:locale-changed", () => {
    loadClientsDropdown();
    fetchProjects();
  });

  // --- LOAD CLIENTS DROPDOWN ---
  async function loadClientsDropdown() {
    try {
      const clients = await API.get("/clients");
      inputClient.innerHTML = `<option value="">${t("projects.selectClient", "Selectează Client...")}</option>`;
      clients.forEach((c) => {
        const name = Utils.escapeHtml(c.contact_person || c.company_name);
        const company = Utils.escapeHtml(c.company_name || t("projects.individualPerson", "Persoană Fizică"));
        inputClient.innerHTML += `<option value="${c.id}">${name} (${company})</option>`;
      });
    } catch (err) {
      Toast.show(err.message || t("projects.loadClientsError", "Eroare la încărcarea clienților."), "danger");
    }
  }

  // --- SEARCH CU DEBOUNCE REUTILIZABIL DIN UTILS ---
  if (searchInput) {
    searchInput.addEventListener(
      "input",
      Utils.debounce((e) => {
        currentSearch = e.target.value.trim();
        currentPage = 1;
        fetchProjects();
      }, 300),
    );
  }

  // --- FETCH PROJECTS (GET) ---
  async function fetchProjects() {
    showLoading(true);
    try {
      const query = `/projects?page=${currentPage}&limit=${CONFIG.DEFAULT_PAGE_LIMIT}&search=${encodeURIComponent(currentSearch)}`;
      const result = await API.get(query);

      const projects = result.data || result;
      const total = result.total || projects.length;

      renderTable(projects);
      renderPagination(total);
    } catch (err) {
      Toast.show(
        err.message || t("projects.loadError", "Eroare la încărcarea listei de proiecte."),
        "danger",
      );
    } finally {
      showLoading(false);
    }
  }

  // --- RENDER TABLE ---
  function renderTable(projects) {
    tableBody.innerHTML = "";

    const term = currentSearch.toLowerCase();
    const filteredProjects = projects.filter((p) => {
      if (!term) return true;
      const name = (p.project_name || "").toLowerCase();
      const number = (p.project_number || "").toLowerCase();
      const client = (p.contact_person || p.company_name || "").toLowerCase();

      return (
        name.includes(term) || number.includes(term) || client.includes(term)
      );
    });

    if (!filteredProjects || filteredProjects.length === 0) {
      tableEmptyState.classList.remove("d-none");
      return;
    }

    tableEmptyState.classList.add("d-none");

    const statusBadges = {
      draft: `<span class="badge bg-secondary">${t("projects.status.draft", "Draft")}</span>`,
      planned: `<span class="badge bg-info text-dark">${t("projects.status.planned", "Planificat")}</span>`,
      in_progress: `<span class="badge bg-warning text-dark">${t("projects.status.in_progress", "În Lucru")}</span>`,
      on_hold: `<span class="badge bg-dark">${t("projects.status.on_hold", "În Așteptare")}</span>`,
      completed: `<span class="badge bg-success">${t("projects.status.completed", "Finalizat")}</span>`,
      cancelled: `<span class="badge bg-danger">${t("projects.status.cancelled", "Anulat")}</span>`,
    };

    filteredProjects.forEach((p) => {
      const tr = document.createElement("tr");
      const projectId = p.id;
      const formattedValue = parseFloat(p.estimated_value || 0).toLocaleString(
        getCurrentLocaleCode(),
        { minimumFractionDigits: 2 },
      );

      tr.innerHTML = `
        <td>
          <div class="fw-bold text-dark">${Utils.escapeHtml(p.project_name)}</div>
          <small class="text-muted">${Utils.escapeHtml(p.project_number)}</small>
        </td>
        <td>${Utils.escapeHtml(p.contact_person || p.company_name || "-")}</td>
        <td>${statusBadges[p.status] || p.status}</td>
        <td><span class="text-capitalize small fw-semibold">${Utils.escapeHtml(p.priority)}</span></td>
        <td><strong>${formattedValue} ${p.currency || "EUR"}</strong></td>
        <td class="text-end pe-4">
          <button class="btn btn-sm btn-outline-primary me-1 btn-edit">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger btn-delete">
            <i class="fas fa-trash-can"></i>
          </button>
        </td>
      `;

      tr.querySelector(".btn-edit").addEventListener("click", () =>
        openEditModal(p),
      );
      tr.querySelector(".btn-delete").addEventListener("click", () =>
        openDeleteModal(projectId),
      );

      tableBody.appendChild(tr);
    });
  }

  // --- SAVE PROJECT (POST / PUT) + VALIDARE ---
  if (projectForm) {
    projectForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const payload = {
        project_name: inputName.value.trim(),
        client_id: parseInt(inputClient.value),
        status: inputStatus.value,
        priority: inputPriority.value,
        estimated_value: parseFloat(inputEstimatedValue.value) || 0,
        currency: "EUR",
        description: inputDescription.value.trim() || null,
        start_date: inputStartDate.value || null, // <--- Adăugat
        end_date: inputEndDate.value || null, // <--- Adăugat
        completion_date: inputCompletionDate.value || null, // <--- Adăugat
      };

      if (!validateProjectForm(payload)) return;

      const isEdit = Boolean(inputId.value);
      const endpoint = isEdit ? `/projects/${inputId.value}` : "/projects";

      try {
        if (isEdit) {
          await API.put(endpoint, payload);
        } else {
          await API.post(endpoint, payload);
        }

        projectModal.hide();
        Toast.show(
          isEdit
            ? t("projects.updated", "Proiect actualizat cu succes!")
            : t("projects.created", "Proiect creat cu succes!"),
          "success",
        );
        fetchProjects();
      } catch (err) {
        Toast.show(err.message, "danger");
      }
    });
  }

  // --- DELETE PROJECT (DELETE / SOFT DELETE) ---
  if (btnConfirmDelete) {
    btnConfirmDelete.addEventListener("click", async () => {
      if (!selectedProjectId) return;

      try {
        await API.delete(`/projects/${selectedProjectId}`);
        deleteModal.hide();
        Toast.show(t("projects.archived", "Proiectul a fost arhivat cu succes."), "warning");
        fetchProjects();
      } catch (err) {
        Toast.show(err.message, "danger");
      }
    });
  }

  // --- VALIDARE FORMULAR ---
  function validateProjectForm(data) {
    if (!data.project_name || data.project_name.length < 3) {
      Toast.show(
        t("projects.nameTooShort", "Numele proiectului trebuie să conțină cel puțin 3 caractere!"),
        "danger",
      );
      return false;
    }

    if (!data.client_id || isNaN(data.client_id)) {
      Toast.show(t("projects.invalidClient", "Vă rugăm să selectați un client valid!"), "danger");
      return false;
    }

    return true;
  }

  // --- MODAL HELPERS ---
  if (btnOpenAddModal) {
    btnOpenAddModal.addEventListener("click", () => {
      projectForm.reset();
      inputId.value = "";
      document.getElementById("projectModalLabel").textContent =
        t("projects.addNew", "Adaugă Proiect Nou");

      inputStartDate.value = "";
      inputEndDate.value = "";
      inputCompletionDate.value = "";
    });
  }

  function openEditModal(project) {
    inputId.value = project.id;
    inputName.value = project.project_name || "";
    inputClient.value = project.client_id || "";
    inputStatus.value = project.status || "draft";
    inputPriority.value = project.priority || "medium";
    inputEstimatedValue.value = project.estimated_value || "";
    inputDescription.value = project.description || "";

    // Formatează datele pentru input-ul de tip 'date' (care așteaptă YYYY-MM-DD):
    inputStartDate.value = project.start_date
      ? project.start_date.split("T")[0]
      : "";
    inputEndDate.value = project.end_date ? project.end_date.split("T")[0] : "";
    inputCompletionDate.value = project.completion_date
      ? project.completion_date.split("T")[0]
      : "";

    document.getElementById("projectModalLabel").textContent =
      t("projects.editProject", "Editează Proiect");
    projectModal.show();
  }

  function openDeleteModal(id) {
    selectedProjectId = id;
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
    // tPlural (nu t()) — vezi comentariul identic din clients.js#renderPagination
    // ("projects.paginationInfo" e acum un obiect de forme CLDR one/few/other).
    paginationInfo.textContent = tPlural(
      "projects.paginationInfo",
      totalItems,
      {
        one: `Afișare ${startItem} - ${endItem} din ${totalItems} proiect`,
        few: `Afișare ${startItem} - ${endItem} din ${totalItems} proiecte`,
        other: `Afișare ${startItem} - ${endItem} din ${totalItems} de proiecte`,
      },
      { start: startItem, end: endItem, total: totalItems },
    );

    if (totalPages <= 1) return;

    paginationControls.appendChild(
      createPageItem("«", currentPage > 1, () => {
        currentPage--;
        fetchProjects();
      }),
    );

    for (let i = 1; i <= totalPages; i++) {
      paginationControls.appendChild(
        createPageItem(
          i,
          true,
          () => {
            currentPage = i;
            fetchProjects();
          },
          i === currentPage,
        ),
      );
    }

    paginationControls.appendChild(
      createPageItem("»", currentPage < totalPages, () => {
        currentPage++;
        fetchProjects();
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
