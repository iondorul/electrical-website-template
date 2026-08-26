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
        <div class="settings-placeholder-box" id="billingInvoiceHistory">
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
          <!-- 210px = lățimea reală a butonului Logout din sidebar (sidebar
               fix 250px - padding 20px×2, vezi #logoutBtn/.btn-logout în
               dashboard.css) — badge-ul PLAN PRO o folosește explicit, ca să
               fie identică cu Logout. Butonul "Administrează abonamentul" de
               mai jos rămâne intenționat la lățimea lui naturală (cât textul
               pe un rând), fără să copieze acest 210px. -->
          <div>
            <a href="erp-plans.html" class="plan-badge plan-badge-pro mb-2" style="display: flex; margin: 0; width: 210px; box-sizing: border-box; border-radius: 8px;"><i
                class="fas fa-crown plan-badge-icon"></i><span>Plan Pro</span></a>
            <div class="fw-semibold" id="billingRenewalDate">Data reînnoirii: se încarcă...</div>
            <div class="text-muted small">Abonamentul se reînnoiește automat lunar.</div>
            <a href="erp-plans.html" class="billing-manage-link mt-2"><i class="fas fa-credit-card me-2"></i>Administrează abonamentul</a>
          </div>
        </div>
      </div>

      <div id="billingPaymentFailedBanner"></div>

      <div class="settings-subblock">
        <div class="settings-subblock-title">Istoric Facturi Abonament</div>
        <div class="settings-placeholder-box" id="billingInvoiceHistory">
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

      // Istoric de facturi (subscription recurente + plăți one-time
      // "Reînnoiește acum"/reactivare grace-period) — necondiționat de plan
      // (un user redevenit Free poate avea istoric de dinainte de downgrade).
      try {
        const invResponse = await API.get("/stripe/invoices");
        const invoices = invResponse && invResponse.data;
        const historyEl = container.querySelector("#billingInvoiceHistory");
        if (historyEl && invoices && invoices.length > 0) {
          historyEl.outerHTML = invoices
            .map((inv) => {
              const dateLabel = inv.date
                ? new Date(inv.date).toLocaleDateString("ro-RO", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "Dată indisponibilă";
              const amountLabel = `${(inv.amount / 100).toFixed(2)} ${String(
                inv.currency || "",
              ).toUpperCase()}`;
              const isPaid = inv.status === "paid";
              const statusLabel = isPaid ? "Plătită" : inv.status;
              // hostedInvoiceUrl deschide pagina Stripe a facturii (vizualizare
              // directă în browser) — invoicePdf trimite Content-Disposition:
              // attachment de la Stripe, deci FORȚEAZĂ mereu descărcarea,
              // indiferent de target="_blank" (headerul e al Stripe, nu-l putem
              // suprascrie dintr-un simplu link). invoicePdf rămâne doar fallback,
              // pentru cazul rar în care hostedInvoiceUrl lipsește.
              const pdfUrl = inv.hostedInvoiceUrl || inv.invoicePdf;
              const pdfLink = pdfUrl
                ? `<a href="${pdfUrl}" target="_blank" rel="noopener" class="billing-invoice-pdf-link ms-3" title="Deschide factura"><i class="fas fa-file-pdf"></i></a>`
                : "";
              return `
                <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
                  <div>
                    <div class="fw-semibold">${dateLabel}</div>
                    <div class="text-muted small">${inv.description}</div>
                  </div>
                  <div class="d-flex align-items-center">
                    <div class="text-end">
                      <div class="fw-semibold">${amountLabel}</div>
                      <div class="small ${isPaid ? "text-success" : "text-danger"}">${statusLabel}</div>
                    </div>
                    ${pdfLink}
                  </div>
                </div>
              `;
            })
            .join("");
        }
        // Listă goală sau eroare — placeholder-ul static rămâne neschimbat.
      } catch (err) {
        console.error("Eroare la preluarea istoricului de facturi:", err);
      }

      if (plan === "pro") {
        const renewalDateEl = container.querySelector("#billingRenewalDate");
        if (renewalDateEl) {
          try {
            const subResponse = await API.get("/stripe/subscription-status");

            if (subResponse && subResponse.status === "error") {
              renewalDateEl.textContent =
                "Nu am putut verifica data reînnoirii — contactează suportul.";
              renewalDateEl.classList.add("text-danger");
            } else {
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
            }

            // Banner discret, non-blocant — apare doar dacă ultima încercare
            // de plată a eșuat (grace period Stripe, retry automat în curs).
            const paymentFailedAt =
              subResponse && subResponse.data && subResponse.data.paymentFailedAt;
            const bannerEl = container.querySelector("#billingPaymentFailedBanner");
            if (bannerEl && paymentFailedAt) {
              bannerEl.innerHTML = `
                <div class="alert alert-warning d-flex align-items-center gap-2 py-2 px-3 mb-0 mt-3" role="alert">
                  <i class="fas fa-triangle-exclamation"></i>
                  <span>Ultima plată a eșuat. Stripe va reîncerca automat plata în zilele următoare — nu trebuie să faci nimic acum.</span>
                </div>
              `;
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
