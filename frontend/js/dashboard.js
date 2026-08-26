// Personalizează banner-ul de bun venit cu numele userului autentificat.
// Ascultă evenimentul emis de shell.js după ce /auth/me răspunde, ca să nu
// mai facă un al doilea apel API redundant. Reținut la nivel de modul ca să
// putem retraduce banner-ul și la schimbarea de limbă (erp:locale-changed),
// fără alt apel API.
let lastDashboardUser = null;

function renderWelcomeBanner(user) {
  const welcomeTitleEl = document.getElementById("welcomeTitle");
  if (!welcomeTitleEl || !user) return;

  const firstName = (user.full_name || "").trim().split(" ")[0] || user.email;
  // Avatarul reflectă alegerea din galeria deschisă în header (shell.js) —
  // needitabil aici, doar afișare. Fără avatar ales, păstrează emoji-ul
  // implicit de dinainte, comportament neschimbat.
  const avatarHtml = user.avatar_id
    ? `<span class="welcome-avatar">${renderAvatarSvg(user.avatar_id)}</span>`
    : "👤";
  const welcomeText = t("dashboard.welcome", "Bine ai revenit, {{name}}!", { name: firstName });
  welcomeTitleEl.innerHTML = `${avatarHtml} ${welcomeText}`;
}

document.addEventListener("erp:user-loaded", (event) => {
  lastDashboardUser = event.detail;
  renderWelcomeBanner(lastDashboardUser);
});

document.addEventListener("erp:locale-changed", () => {
  renderWelcomeBanner(lastDashboardUser);
});
