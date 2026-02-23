customElements.define(
  "whatsapp-quote",
  class extends HTMLElement {
    connectedCallback() {
      this.innerHTML = `
        <a class="btn btn-success py-2 px-4"
           href="https://wa.me/40735946077?text=Buna%2C%20doresc%20o%20oferta%20pentru%20servicii%20electrice.">
          <i class="fab fa-whatsapp me-2"></i>
          <span id="btn_quote_simplu"></span>
        </a>
      `;
    }
  },
);

customElements.define(
  "whatsapp-cta-orange",
  class extends HTMLElement {
    connectedCallback() {
      const text = this.getAttribute("text") || "Get a free quote";
      const msg =
        this.getAttribute("msg") ||
        "Buna%2C%20doresc%20o%20oferta%20pentru%20servicii%20electrice.";

      this.innerHTML = `
        <a class="btn py-3 px-4 px-md-5 whatsapp-orange"
          href="https://wa.me/40735946077?text=${msg}">
          <i class="fab fa-whatsapp me-2"></i>
          <span id="btn_quote">${text}</span>
        </a>
      `;
    }
  },
);

(() => {
  const phone = "40735946077";

  const msg = {
    ro: {
      footer_service_residential:
        "Buna, doresc o oferta pentru instalatii electrice rezidentiale si Smart Home.",
      footer_service_panels:
        "Buna, doresc o oferta pentru tablouri electrice si modernizari de infrastructura.",
      footer_service_lighting:
        "Buna, doresc o oferta pentru solutii de iluminat arhitectural, DALI si iluminat de urgenta.",
      footer_service_security:
        "Buna, doresc o oferta pentru sisteme integrate de securitate si alarmare.",
      footer_service_industrial:
        "Buna, doresc o oferta pentru instalatii electrice industriale si automatizari (Y-Δ).",
    },
    en: {
      footer_service_residential:
        "Hello, I would like a quote for residential electrical installations and Smart Home.",
      footer_service_panels:
        "Hello, I would like a quote for electrical panels and infrastructure upgrades.",
      footer_service_lighting:
        "Hello, I would like a quote for architectural lighting, DALI, and emergency lighting.",
      footer_service_security:
        "Hello, I would like a quote for integrated security and alarm systems.",
      footer_service_industrial:
        "Hello, I would like a quote for industrial electrical installations and motor automation (Y-Δ).",
    },
  };

  function getLang() {
    return (localStorage.getItem("lang") || "ro").toLowerCase();
  }

  function openWhatsApp(text) {
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function bind(id) {
    const el = document.getElementById(id);
    if (!el) return;

    el.addEventListener("click", (e) => {
      e.preventDefault();
      const lang = getLang();
      const dict = msg[lang] || msg.ro;
      openWhatsApp(
        dict[id] ||
          (lang === "en"
            ? "Hello, I would like a quote for electrical work."
            : "Buna, doresc o oferta pentru lucrari electrice."),
      );
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    Object.keys(msg.ro).forEach(bind);
  });
})();
