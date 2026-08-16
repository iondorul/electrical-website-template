const PDFDocument = require("pdfkit");
const path = require("path");

const FONT_REGULAR = path.join(__dirname, "../assets/fonts/DejaVuSans.ttf");
const FONT_BOLD = path.join(__dirname, "../assets/fonts/DejaVuSans-Bold.ttf");

const TYPE_LABELS = {
  financial: "Financial",
  projects: "Projects",
  materials: "Materials",
  clients: "Clients",
};

function fmtMoney(value, currency = "EUR") {
  const num = parseFloat(value) || 0;
  return `${num.toFixed(2)} ${currency}`;
}

function fmtDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("ro-RO");
}

function drawHeader(doc, { reportType, reportName, filters, company }) {
  doc
    .fontSize(14)
    .font("Body-Bold")
    .fillColor("#000000")
    .text(company?.company_name || "ElectricalVPF ERP", 50, 50);

  doc
    .fontSize(9)
    .font("Body")
    .fillColor("#444444")
    .text(company?.email || "", 50, 68);

  doc
    .fontSize(20)
    .font("Body-Bold")
    .fillColor("#000000")
    .text(TYPE_LABELS[reportType] || reportType, 300, 50, {
      width: 245,
      align: "right",
    });
  doc
    .fontSize(10)
    .font("Body")
    .text("Report", 300, 74, { width: 245, align: "right" });

  let y = 105;
  doc.fontSize(9).font("Body-Bold").fillColor("#000000").text(reportName, 50, y);
  y += 16;

  doc.font("Body").fontSize(8).fillColor("#666666");
  const periodLabel =
    filters.from || filters.to
      ? `Perioadă: ${filters.from ? fmtDate(filters.from) : "-"} – ${filters.to ? fmtDate(filters.to) : "-"}`
      : "Perioadă: Tot istoricul";
  doc.text(periodLabel, 50, y);
  y += 12;
  doc.text(`Client: ${filters.clientLabel || "Toți clienții"}`, 50, y);
  y += 12;
  doc.text(`Proiect: ${filters.projectLabel || "Toate proiectele"}`, 50, y);
  y += 12;
  doc.text(`Generat la: ${new Date().toLocaleString("ro-RO")}`, 50, y);
  y += 20;

  doc.moveTo(50, y).lineTo(545, y).strokeColor("#cccccc").stroke();
  return y + 15;
}

function drawTable(doc, startY, { columns, rows }) {
  let y = startY;

  function drawHeaderRow(rowY) {
    doc.font("Body-Bold").fontSize(9).fillColor("#000000");
    columns.forEach((col) => {
      doc.text(col.label, col.x, rowY, {
        width: col.width,
        align: col.align || "left",
      });
    });
    doc
      .moveTo(50, rowY + 14)
      .lineTo(545, rowY + 14)
      .strokeColor("#cccccc")
      .stroke();
  }

  drawHeaderRow(y);
  y += 20;
  doc.font("Body").fontSize(9).fillColor("#000000");

  rows.forEach((row) => {
    if (y > 720) {
      doc.addPage();
      y = 50;
      drawHeaderRow(y);
      y += 20;
      doc.font("Body").fontSize(9).fillColor("#000000");
    }

    let maxHeight = 14;
    columns.forEach((col) => {
      const text = row[col.key] != null ? String(row[col.key]) : "-";
      const h = doc.heightOfString(text, { width: col.width });
      if (h > maxHeight) maxHeight = h;
    });

    columns.forEach((col) => {
      const text = row[col.key] != null ? String(row[col.key]) : "-";
      doc.text(text, col.x, y, {
        width: col.width,
        align: col.align || "left",
      });
    });

    y += maxHeight + 6;
  });

  return y;
}

function drawFinancialBody(doc, startY, data) {
  const { summary, timeseries } = data;
  let y = startY;

  const cards = [
    ["Invoiced", summary.invoiced],
    ["Paid", summary.paid],
    ["Outstanding", summary.outstanding],
    ["Overdue", summary.overdue],
  ];

  cards.forEach(([label, value], i) => {
    const x = 50 + i * 125;
    doc.font("Body").fontSize(8).fillColor("#666666").text(label, x, y);
    doc
      .font("Body-Bold")
      .fontSize(13)
      .fillColor("#000000")
      .text(fmtMoney(value), x, y + 12, { width: 115 });
  });

  y += 45;
  doc.moveTo(50, y).lineTo(545, y).strokeColor("#cccccc").stroke();
  y += 15;

  doc.font("Body-Bold").fontSize(10).text("Facturat vs. Încasat (pe lună)", 50, y);
  y += 18;

  if (!timeseries || timeseries.length === 0) {
    doc.font("Body").fontSize(9).fillColor("#666666").text("Nu există date pentru perioada selectată.", 50, y);
    return y + 20;
  }

  return drawTable(doc, y, {
    columns: [
      { key: "period", label: "Lună", x: 50, width: 150 },
      { key: "invoiced", label: "Facturat", x: 220, width: 150, align: "right" },
      { key: "paid", label: "Încasat", x: 390, width: 150, align: "right" },
    ],
    rows: timeseries.map((t) => ({
      period: t.period,
      invoiced: fmtMoney(t.invoiced),
      paid: fmtMoney(t.paid),
    })),
  });
}

function drawProjectsBody(doc, startY, rows) {
  return drawTable(doc, startY, {
    columns: [
      { key: "project_name", label: "Proiect", x: 50, width: 110 },
      { key: "client_name", label: "Client", x: 165, width: 100 },
      { key: "status", label: "Status", x: 270, width: 60 },
      { key: "project_value", label: "Valoare", x: 335, width: 65, align: "right" },
      { key: "materials_cost", label: "Materiale", x: 405, width: 65, align: "right" },
      { key: "profit", label: "Profit", x: 475, width: 70, align: "right" },
    ],
    rows: rows.map((p) => ({
      project_name: p.project_name,
      client_name: p.client_name || "-",
      status: p.status,
      project_value: p.project_value != null ? fmtMoney(p.project_value, p.currency || "EUR") : "-",
      materials_cost: p.materials_cost != null ? fmtMoney(p.materials_cost, p.currency || "EUR") : "N/A",
      profit: p.profit != null ? fmtMoney(p.profit, p.currency || "EUR") : "N/A",
    })),
  });
}

function drawMaterialsBody(doc, startY, rows) {
  return drawTable(doc, startY, {
    columns: [
      { key: "name", label: "Material", x: 50, width: 160 },
      { key: "planned_usage_quantity", label: "Consum Planificat", x: 220, width: 90, align: "right" },
      { key: "planned_usage_cost", label: "Cost Planificat", x: 320, width: 90, align: "right" },
      { key: "stock_quantity", label: "Stoc Curent", x: 420, width: 60, align: "right" },
      { key: "low_stock", label: "Status", x: 490, width: 55 },
    ],
    rows: rows.map((m) => ({
      name: m.name,
      planned_usage_quantity: `${parseFloat(m.planned_usage_quantity).toFixed(2)} ${m.unit_of_measure || ""}`,
      planned_usage_cost: fmtMoney(m.planned_usage_cost),
      stock_quantity: `${parseFloat(m.stock_quantity).toFixed(2)} ${m.unit_of_measure || ""}`,
      low_stock: m.low_stock ? "Stoc Redus" : "OK",
    })),
  });
}

function drawClientsBody(doc, startY, rows) {
  return drawTable(doc, startY, {
    columns: [
      { key: "company_name", label: "Client", x: 50, width: 140 },
      { key: "project_count", label: "Proiecte", x: 195, width: 55, align: "right" },
      { key: "projects_value", label: "Val. Proiecte", x: 255, width: 80, align: "right" },
      { key: "invoiced", label: "Facturat", x: 340, width: 70, align: "right" },
      { key: "paid", label: "Încasat", x: 415, width: 65, align: "right" },
      { key: "outstanding", label: "Outstanding", x: 485, width: 60, align: "right" },
    ],
    rows: rows.map((c) => ({
      company_name: c.company_name,
      project_count: c.project_count,
      projects_value: fmtMoney(c.projects_value),
      invoiced: fmtMoney(c.invoiced),
      paid: fmtMoney(c.paid),
      outstanding: fmtMoney(c.outstanding),
    })),
  });
}

function generateReportPdf({ reportType, reportName, filters, data, company }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("Body", FONT_REGULAR);
    doc.registerFont("Body-Bold", FONT_BOLD);

    const bodyStartY = drawHeader(doc, { reportType, reportName, filters, company });

    if (reportType === "financial") {
      drawFinancialBody(doc, bodyStartY, data);
    } else if (reportType === "projects") {
      drawProjectsBody(doc, bodyStartY, data);
    } else if (reportType === "materials") {
      drawMaterialsBody(doc, bodyStartY, data);
    } else if (reportType === "clients") {
      drawClientsBody(doc, bodyStartY, data);
    }

    doc.end();
  });
}

module.exports = { generateReportPdf };
