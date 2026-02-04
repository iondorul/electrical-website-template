const t = {
  ro: {
    langLabel: "Română",

    nav_home: "Acasă",
    nav_about: "Despre Noi",
    nav_services: "Servicii",
    nav_blog: "Blog",
    nav_pages: "Pagini",
    nav_projects: "Lucrările Noastre",
    nav_team: "Echipa Noastră",
    nav_testimonials: "Păreri",
    nav_404: "404 Page",
    nav_contact: "Contact",

    hero1_h4: "Servicii Electrice de Încredere",
    hero1_h1: "Acolo unde profesionalismul prinde viață",
    hero1_p:
      "Fiecare lucrare este tratată cu seriozitate, pentru rezultate rapide și fără compromis.",
    btn_watch2: "Vezi Video",
    btn_learn2: "Află Mai Mult",

    hero2_h4: "Servicii Electrice de Încredere",
    hero2_h1: "Acolo unde profesionalismul prinde viață",
    hero2_p:
      "Fiecare lucrare este tratată cu seriozitate, pentru rezultate rapide și fără compromis.",
    btn_watch: "Vezi Video",
    btn_learn: "Află Mai Mult",

    btn_about_contact: "Contactează-ne",

    about_h4: "Despre Noi",
    about_h1: "Performanță și calitate în fiecare detaliu",
    about_feat1: "SOLUȚII DE URGENȚĂ PENTRU ALIMENTARE CU ENERGIE",
    about_feat2: "Servicii Complete de Proiectare Electrică",
    about_p:
      "Executăm lucrări electrice conforme și durabile, atât pentru locuințe, cât și pentru spații comerciale sau industriale",
    about_b1:
      "Instalăm, întreținem și reparam sisteme de iluminat pentru clienți.",
    about_b2: "Tehnologie avansată pentru generarea curentului electric.",
    about_b3: "Metode inteligente de a produce energie cu costuri reduse.",

    langLabel: "Română",
    footer_desc:
      "Oferim servicii electrice profesionale în Sibiu și împrejurimi pentru locuințe, spații comerciale și industriale. Lucrăm conform normelor ANRE, rapid și sigur, cu soluții durabile și prețuri corecte.",

    contact_h4: "Contact",
    contact_h1: "Contactează-ne acum",
    contact_p:
      "Suntem gata să-ți răspundem. Fie că ai nevoie de o ofertă, consultanță sau intervenție rapidă – contactează-ne acum.",

    footer_services_title: "Expertiză Tehnică & Mentenanță",

    footer_service_residential: "Sisteme Electrice Rezidențiale & Smart Home",
    footer_service_panels: "Tablouri Electrice & Modernizări Infrastructură",
    footer_service_lighting: "Soluții Iluminat Arhitectural, DALI & Urgență",
    footer_service_security: "Sisteme Integrate de Securitate & Alarmare",
    footer_service_industrial: "Echipamente Industriale & Automatizări (Y-Δ)",
  },

  en: {
    langLabel: "English",

    nav_home: "Home",
    nav_about: "About Us",
    nav_services: "Services",
    nav_blog: "Blog",
    nav_pages: "Pages",
    nav_projects: "Our Projects",
    nav_team: "Our Team",
    nav_testimonials: "Testimonials",
    nav_404: "404 Page",
    nav_contact: "Contact",

    hero1_h4: "Trusted Electrical Services",
    hero1_h1: "Where professionalism comes to life",
    hero1_p:
      "Every job is handled seriously, for fast results and no compromises.",
    btn_watch2: "Watch Video",
    btn_learn2: "Learn More",

    hero2_h4: "Trusted Electrical Services",
    hero2_h1: "Where professionalism comes to life",
    hero2_p:
      "Every job is handled seriously, for fast results and no compromises.",
    btn_watch: "Watch Video",
    btn_learn: "Learn More",

    btn_about_contact: "Contact us",

    about_h4: "About Us",
    about_h1: "Performance and quality in every detail",
    about_feat1: "EMERGENCY POWER SUPPLY SOLUTIONS",
    about_feat2: "Complete Electrical Design Services",
    about_p:
      "We deliver compliant, durable electrical work for homes, commercial and industrial spaces",
    about_b1: "We install, maintain and repair lighting systems.",
    about_b2: "Advanced technology for reliable power solutions.",
    about_b3: "Smart methods to reduce energy costs.",

    footer_desc:
      "We provide professional electrical services in Sibiu and surrounding areas for residential, commercial, and industrial projects. We work according to safety standards, fast and reliable, with durable solutions and fair pricing.",
    langLabel: "English",
    contact_h4: "Contact",
    contact_h1: "Get in Touch Now",
    contact_p:
      "We are ready to assist you. Whether you need a quote, consultation, or urgent service – contact us now.",

    footer_services_title: "Technical Expertise & Maintenance",

    footer_service_residential: "Residential Electrical Systems & Smart Home",
    footer_service_panels: "Electrical Panels & Infrastructure Upgrades",
    footer_service_lighting: "Architectural Lighting, DALI & Emergency",
    footer_service_security: "Integrated Security & Alarm Systems",
    footer_service_industrial: "Industrial Equipment & Motor Automation (Y-Δ)",
  },
};

function setText(id, val) {
  document
    .querySelectorAll(`[id="${id}"]`)
    .forEach((e) => (e.textContent = val));
}

function setLang(lang) {
  localStorage.setItem("lang", lang);
  const d = t[lang] || t.ro;
  setText("langLabel", d.langLabel);
  Object.keys(d).forEach((k) => {
    if (k !== "langLabel") setText(k, d[k]);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setLang(localStorage.getItem("lang") || "ro");
});
