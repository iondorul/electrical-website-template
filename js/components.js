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
