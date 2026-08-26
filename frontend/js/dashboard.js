// Personalizează banner-ul de bun venit cu numele userului autentificat.
// Ascultă evenimentul emis de shell.js după ce /auth/me răspunde, ca să nu
// mai facă un al doilea apel API redundant.
document.addEventListener("erp:user-loaded", (event) => {
  const user = event.detail;
  const welcomeTitleEl = document.getElementById("welcomeTitle");
  if (!welcomeTitleEl || !user) return;

  const firstName = (user.full_name || "").trim().split(" ")[0] || user.email;
  // Avatarul reflectă alegerea din galeria deschisă în header (shell.js) —
  // needitabil aici, doar afișare. Fără avatar ales, păstrează emoji-ul
  // implicit de dinainte, comportament neschimbat.
  const avatarHtml = user.avatar_id
    ? `<span class="welcome-avatar">${renderAvatarSvg(user.avatar_id)}</span>`
    : "👤";
  welcomeTitleEl.innerHTML = `${avatarHtml} Welcome back, ${firstName}!`;
});
