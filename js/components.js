customElements.define(
  "whatsapp-quote",
  class extends HTMLElement {
    connectedCallback() {
      this.innerHTML = `
      <a class="btn btn-success py-2 px-4"
         href="https://wa.me/40735946077?text=Buna%2C%20doresc%20o%20oferta%20pentru%20servicii%20electrice.">
        <i class="fab fa-whatsapp me-2"></i> Cere ofertă
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
