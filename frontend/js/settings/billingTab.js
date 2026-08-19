/**
 * Settings Tab: Abonament & Plăți
 * Există doar 2 planuri reale: Free și Pro (users.plan) — fără trial.
 * Determină ce se afișează citind user.plan din /api/auth/me la fiecare render.
 */
(function () {
  function templateLoading() {
    return `
      <h5 class="settings-section-title">Abonament & Plăți</h5>
      <p class="settings-section-desc">
        Detalii despre planul curent și facturarea abonamentului.
      </p>
      <div class="text-center text-muted py-4">
        <span class="spinner-border spinner-border-sm"></span>
      </div>
    `;
  }

  function templateFree() {
    return `
      <h5 class="settings-section-title">Abonament & Plăți</h5>
      <p class="settings-section-desc">
        Detalii despre planul curent și facturarea abonamentului.
      </p>

      <div class="card border-0" style="background: #f8f9fb; border-radius: 12px;">
        <div class="card-body p-4 d-flex align-items-center justify-content-between flex-wrap gap-3">
          <div>
            <span class="badge bg-secondary mb-2">Plan Free</span>
            <div class="fw-semibold">Ai acces la funcțiile de bază ElectricalVPF ERP.</div>
            <div class="text-muted small">Fără costuri, fără dată de expirare.</div>
          </div>
          <a href="erp-plans.html" class="btn btn-primary fw-semibold px-4" id="btnUpgradePlan">
            <i class="fas fa-arrow-up-right-dots me-2"></i> Upgrade la Pro
          </a>
        </div>
      </div>

      <div class="settings-subblock">
        <div class="settings-subblock-title">Istoric Facturi Abonament</div>
        <div class="settings-placeholder-box">
          <i class="fas fa-file-invoice fs-4 mb-2 d-block"></i>
          Nu există facturi de abonament emise încă.<br>
          Istoricul plăților va apărea aici.
        </div>
      </div>
    `;
  }

  function templatePro() {
    return `
      <h5 class="settings-section-title">Abonament & Plăți</h5>
      <p class="settings-section-desc">
        Detalii despre planul curent și facturarea abonamentului.
      </p>

      <div class="card border-0" style="background: #f8f9fb; border-radius: 12px;">
        <div class="card-body p-4 d-flex align-items-center justify-content-between flex-wrap gap-3">
          <div>
            <span class="plan-badge plan-badge-pro mb-2" style="display: inline-flex; margin: 0;"><i
                class="fas fa-crown plan-badge-icon"></i><span>Plan Pro</span></span>
            <div class="fw-semibold" id="billingRenewalDate">Data reînnoirii: se încarcă...</div>
            <div class="text-muted small">Abonamentul se reînnoiește automat lunar.</div>
          </div>
          <button type="button" class="btn btn-outline-primary fw-semibold px-4" id="btnRenewEarly">
            <i class="fas fa-rotate me-2"></i> Reînnoiește abonamentul acum
          </button>
        </div>
      </div>

      <div class="settings-subblock">
        <div class="settings-subblock-title">Istoric Facturi Abonament</div>
        <div class="settings-placeholder-box">
          <i class="fas fa-file-invoice fs-4 mb-2 d-block"></i>
          Nu există facturi de abonament emise încă.<br>
          Istoricul plăților va apărea aici.
        </div>
      </div>
    `;
  }

  const tab = {
    id: "billing",
    label: "Abonament & Plăți",
    icon: "fa-credit-card",
    async render(container) {
      container.innerHTML = templateLoading();

      let plan = "free";
      try {
        const response = await API.get("/auth/me");
        // Răspuns invalid/gol (nu 401/403, alea sunt tratate deja în api.js)
        // -> sesiunea nu mai corespunde unui user valid, delogăm.
        if (!response || !response.success || !response.data) {
          performLogout();
          return;
        }
        plan = response.data.plan === "pro" ? "pro" : "free";
      } catch (err) {
        // Eroare de rețea/timeout/5xx — sesiunea rămâne valabilă, NU delogăm;
        // afișăm planul implicit (free) fără să forțăm ieșirea userului.
        console.error("Eroare la determinarea planului curent:", err);
      }

      container.innerHTML = plan === "pro" ? templatePro() : templateFree();

      if (plan === "pro") {
        const renewBtn = container.querySelector("#btnRenewEarly");
        if (renewBtn) {
          renewBtn.addEventListener("click", () => {
            Toast.show(
              "Reînnoirea anticipată va fi disponibilă în curând.",
              "info",
            );
          });
        }

        const renewalDateEl = container.querySelector("#billingRenewalDate");
        if (renewalDateEl) {
          try {
            const subResponse = await API.get("/stripe/subscription-status");
            const currentPeriodEnd =
              subResponse &&
              subResponse.data &&
              subResponse.data.currentPeriodEnd;

            if (currentPeriodEnd) {
              const formatted = new Date(currentPeriodEnd).toLocaleDateString(
                "ro-RO",
                { day: "numeric", month: "long", year: "numeric" },
              );
              renewalDateEl.textContent = `Abonamentul se reînnoiește pe ${formatted}`;
            } else {
              renewalDateEl.textContent = "Data reînnoirii: indisponibilă momentan";
            }
          } catch (err) {
            console.error("Eroare la preluarea datei de reînnoire:", err);
            renewalDateEl.textContent = "Data reînnoirii: indisponibilă momentan";
          }
        }
      }
    },
  };

  window.SettingsTabs = window.SettingsTabs || [];
  window.SettingsTabs.push(tab);
})();
