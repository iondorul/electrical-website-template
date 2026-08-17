/**
 * Settings Tab: Abonament & Plăți
 * UI only — fără integrare Stripe reală. Pregătit structural pentru viitor.
 */
(function () {
  const TRIAL_EXPIRES_LABEL = "15 Septembrie 2026";

  function template() {
    return `
      <h5 class="settings-section-title">Abonament & Plăți</h5>
      <p class="settings-section-desc">
        Detalii despre planul curent și facturarea abonamentului.
      </p>

      <div class="card border-0" style="background: #f8f9fb; border-radius: 12px;">
        <div class="card-body p-4 d-flex align-items-center justify-content-between flex-wrap gap-3">
          <div>
            <span class="badge bg-warning text-dark mb-2">Free Trial</span>
            <div class="fw-semibold">Planul tău expiră la ${TRIAL_EXPIRES_LABEL}</div>
            <div class="text-muted small">Fără costuri până la această dată.</div>
          </div>
          <a href="erp-plans.html" class="btn btn-primary fw-semibold px-4" id="btnUpgradePlan">
            <i class="fas fa-arrow-up-right-dots me-2"></i> Upgrade Plan
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

  const tab = {
    id: "billing",
    label: "Abonament & Plăți",
    icon: "fa-credit-card",
    async render(container) {
      container.innerHTML = template();
    },
  };

  window.SettingsTabs = window.SettingsTabs || [];
  window.SettingsTabs.push(tab);
})();
