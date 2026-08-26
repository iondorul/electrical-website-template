document.addEventListener("DOMContentLoaded", async () => {
  let currentPage = 1;
  let currentSearch = "";
  let currentCategory = "";

  const tableBody = document.getElementById("materialsTableBody");
  const searchInput = document.getElementById("searchInput");
  const categoryFilter = document.getElementById("categoryFilter");
  const paginationContainer = document.getElementById("paginationContainer");

  let materialModalInstance = null;
  const materialModalEl = document.getElementById("materialModal");
  if (materialModalEl) {
    materialModalInstance = new bootstrap.Modal(materialModalEl);
  }

  // Buton "Adaugă Material"
  const btnAddMaterial = document.getElementById("btnAddMaterial");
  if (btnAddMaterial) {
    btnAddMaterial.addEventListener("click", () => openMaterialModal(null));
  }

  // Buton "Salvează" din modal
  const btnSaveMaterial = document.getElementById("btnSaveMaterial");
  if (btnSaveMaterial) {
    btnSaveMaterial.addEventListener("click", saveMaterial);
  }

  // Toggle câmp UM personalizat
  const materialUnitSelect = document.getElementById("materialUnit");
  const materialUnitCustom = document.getElementById("materialUnitCustom");
  if (materialUnitSelect && materialUnitCustom) {
    materialUnitSelect.addEventListener("change", () => {
      if (materialUnitSelect.value === "__custom__") {
        materialUnitCustom.classList.remove("d-none");
        materialUnitCustom.focus();
      } else {
        materialUnitCustom.classList.add("d-none");
        materialUnitCustom.value = "";
      }
    });
  }

  // Buton "Șterge Tot"
  const btnDeleteAll = document.getElementById("btnDeleteAllMaterials");
  if (btnDeleteAll) {
    btnDeleteAll.addEventListener("click", async () => {
      const confirmed = confirm(
        t("materials.deleteAllConfirm", "Sigur dorești să ștergi TOATE materialele? Această acțiune este ireversibilă!"),
      );
      if (!confirmed) return;

      try {
        const response = await API.delete("/materials/all");
        if (response && response.success) {
          Toast.show(t("materials.allDeleted", "Toate materialele au fost șterse cu succes."), "success");
          currentPage = 1;
          loadMaterials();
        } else {
          const msg =
            response && response.message
              ? response.message
              : t("materials.deleteAllFailed", "Nu s-au putut șterge materialele.");
          Toast.show(msg, "danger");
        }
      } catch (err) {
        console.error("Eroare la ștergerea totală a materialelor:", err);
        Toast.show(t("materials.deleteAllNetworkError", "Eroare de rețea la ștergerea materialelor."), "danger");
      }
    });
  }

  // Încărcare inițială
  await loadMaterials();

  // La schimbarea de limbă: re-randează cu datele curente — reutilizează
  // fluxul existent, fără logică nouă.
  document.addEventListener("erp:locale-changed", loadMaterials);

  // Căutare debounced
  if (searchInput) {
    searchInput.addEventListener(
      "input",
      Utils.debounce((e) => {
        currentSearch = e.target.value.trim();
        currentPage = 1;
        loadMaterials();
      }, 300),
    );
  }

  // Filtrare după categorie
  if (categoryFilter) {
    categoryFilter.addEventListener("change", (e) => {
      currentCategory = e.target.value;
      currentPage = 1;
      loadMaterials();
    });
  }

  async function loadMaterials() {
    try {
      if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">${t("materials.loadingList", "Se încarcă materialele...")}</td></tr>`;
      }

      const queryParams = new URLSearchParams({
        page: currentPage,
        limit: 10,
        search: currentSearch,
        category: currentCategory,
      });

      const response = await API.get(`/materials?${queryParams.toString()}`);

      if (response && response.success) {
        renderTable(response.data || []);
        renderPagination(response.pagination);
      } else {
        if (tableBody) {
          tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">${t("materials.loadFailed", "Nu s-au putut încărca materialele.")}</td></tr>`;
        }
      }
    } catch (err) {
      console.error("Eroare la încărcare materiale:", err);
      Toast.show(t("materials.networkLoadError", "Eroare de rețea la încărcarea materialelor."), "danger");
      if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4">${t("common.networkError", "Eroare de rețea.")}</td></tr>`;
      }
    }
  }

  function renderTable(materials) {
    if (!tableBody) return;

    if (!materials || materials.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">${t("materials.noMaterials", "Nu există materiale înregistrate.")}</td></tr>`;
      return;
    }

    tableBody.innerHTML = materials
      .map(
        (mat) => `
            <tr>
                <td class="ps-4">
                    <span class="text-muted">${Utils.escapeHtml(mat.item_code || "-")}</span>
                </td>
                <td>
                    <strong class="d-block">${Utils.escapeHtml(mat.name)}</strong>
                </td>
                <td><span class="badge bg-secondary">${Utils.escapeHtml(mat.category)}</span></td>
                <td>${Utils.escapeHtml(mat.unit_of_measure)}</td>
                <td>${Utils.formatCurrency(mat.unit_price)}</td>
                <td class="fw-bold ${parseFloat(mat.stock_quantity) <= 0 ? "text-danger" : ""}">${mat.stock_quantity}</td>
                <td class="text-end pe-4">
                    <button type="button" class="btn btn-sm btn-outline-primary me-1 btn-edit" data-id="${mat.id}" title="${t("common.edit", "Editare")}">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-danger btn-delete" data-id="${mat.id}" title="${t("common.delete", "Șterge")}">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `,
      )
      .join("");

    document.querySelectorAll(".btn-edit").forEach((btn) => {
      btn.addEventListener("click", () => openMaterialModal(btn.dataset.id));
    });

    document.querySelectorAll(".btn-delete").forEach((btn) => {
      btn.addEventListener("click", () => deleteMaterial(btn.dataset.id));
    });
  }

  async function openMaterialModal(id) {
    document.getElementById("materialId").value = "";
    document.getElementById("materialItemCode").value = "";
    document.getElementById("materialName").value = "";
    document.getElementById("materialCategory").value = "Cabluri";

    document.getElementById("materialUnit").value = "buc";
    document.getElementById("materialUnitCustom").value = "";
    document.getElementById("materialUnitCustom").classList.add("d-none");

    document.getElementById("materialPrice").value = "";
    document.getElementById("materialStock").value = "";
    document.getElementById("materialMinStock").value = "";

    if (id) {
      // Mod editare — încarcă datele existente
      document.getElementById("materialModalTitle").textContent =
        t("materials.editMaterial", "Editare Material");
      try {
        const response = await API.get(`/materials/${id}`);
        if (response && response.success) {
          const mat = response.data;
          document.getElementById("materialId").value = mat.id;
          document.getElementById("materialItemCode").value =
            mat.item_code || "";
          document.getElementById("materialName").value = mat.name;
          document.getElementById("materialCategory").value = mat.category;

          const standardUnits = [
            "buc",
            "m",
            "ml",
            "rolă",
            "set",
            "pereche",
            "cutie",
            "pachet",
            "kg",
            "l",
            "mp",
            "h",
          ];
          if (standardUnits.includes(mat.unit_of_measure)) {
            document.getElementById("materialUnit").value = mat.unit_of_measure;
            document
              .getElementById("materialUnitCustom")
              .classList.add("d-none");
          } else {
            document.getElementById("materialUnit").value = "__custom__";
            document.getElementById("materialUnitCustom").value =
              mat.unit_of_measure;
            document
              .getElementById("materialUnitCustom")
              .classList.remove("d-none");
          }

          document.getElementById("materialPrice").value = mat.unit_price;
          document.getElementById("materialStock").value = mat.stock_quantity;
          document.getElementById("materialMinStock").value =
            mat.min_stock || "";
        } else {
          Toast.show(t("materials.fetchFailed", "Nu s-au putut prelua datele materialului."), "danger");
          return;
        }
      } catch (err) {
        console.error("Eroare la deschiderea editării:", err);
        Toast.show(t("materials.loadNetworkError", "Eroare de rețea la încărcarea materialului."), "danger");
        return;
      }
    } else {
      // Mod adăugare
      document.getElementById("materialModalTitle").textContent =
        t("materials.addMaterial", "Adaugă Material");
    }

    if (materialModalInstance) materialModalInstance.show();
  }

  async function saveMaterial() {
    const id = document.getElementById("materialId").value;
    const name = document.getElementById("materialName").value.trim();
    const category = document.getElementById("materialCategory").value;
    let unit_of_measure = document.getElementById("materialUnit").value.trim();
    if (unit_of_measure === "__custom__") {
      unit_of_measure = document
        .getElementById("materialUnitCustom")
        .value.trim();
    }

    if (!name || !category || !unit_of_measure) {
      Toast.show(
        t("materials.requiredFieldsMissing", "Denumire, categorie și unitate de măsură sunt obligatorii."),
        "danger",
      );
      return;
    }

    const payload = {
      item_code:
        document.getElementById("materialItemCode").value.trim() || null,
      name,
      category,
      unit_of_measure,
      unit_price:
        parseFloat(document.getElementById("materialPrice").value) || 0,
      stock_quantity:
        parseFloat(document.getElementById("materialStock").value) || 0,
      min_stock:
        parseFloat(document.getElementById("materialMinStock").value) || 0,
    };

    try {
      let response;
      if (id) {
        response = await API.put(`/materials/${id}`, payload);
      } else {
        response = await API.post("/materials", payload);
      }

      if (response && response.success) {
        Toast.show(
          id
            ? t("materials.updated", "Material actualizat cu succes.")
            : t("materials.created", "Material adăugat cu succes."),
          "success",
        );
        if (materialModalInstance) materialModalInstance.hide();
        loadMaterials();
      } else {
        const msg =
          response && response.message
            ? response.message
            : t("materials.saveFailed", "Nu s-a putut salva materialul.");
        Toast.show(msg, "danger");
      }
    } catch (err) {
      console.error("Eroare la salvarea materialului:", err);
      Toast.show(t("materials.saveNetworkError", "Eroare de rețea la salvarea materialului."), "danger");
    }
  }

  async function deleteMaterial(id) {
    const confirmed = confirm(t("materials.deleteConfirm", "Sigur dorești să ștergi acest material?"));
    if (!confirmed) return;

    try {
      const response = await API.delete(`/materials/${id}`);
      if (response && response.success) {
        Toast.show(t("materials.deleted", "Material șters cu succes."), "success");
        loadMaterials();
      } else {
        const msg =
          response && response.message
            ? response.message
            : t("materials.deleteFailed", "Nu s-a putut șterge materialul.");
        Toast.show(msg, "danger");
      }
    } catch (err) {
      console.error("Eroare la ștergerea materialului:", err);
      Toast.show(t("materials.deleteNetworkError", "Eroare de rețea la ștergerea materialului."), "danger");
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
          loadMaterials();
        }
      });
    });
  }
});
