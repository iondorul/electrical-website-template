const PDFDocument = require("pdfkit");
const path = require("path");

const FONT_REGULAR = path.join(__dirname, "../assets/fonts/DejaVuSans.ttf");
const FONT_BOLD = path.join(__dirname, "../assets/fonts/DejaVuSans-Bold.ttf");

function fmtMoney(value, currency = "RON") {
  const num = parseFloat(value) || 0;
  return `${num.toFixed(2)} ${currency}`;
}

function fmtDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("ro-RO");
}

function generateInvoicePdf({ invoice, client, company }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Fonturile standard PDFKit (Helvetica) nu au glife pentru diacritice
    // românești (ă, â, î, ș, ț) — folosim un font TTF Unicode înregistrat explicit.
    doc.registerFont("Body", FONT_REGULAR);
    doc.registerFont("Body-Bold", FONT_BOLD);

    const currency = invoice.currency_code
      ? invoice.currency_code.trim()
      : "RON";

    // --- Antet: firma emitentă (stânga) + titlu factură (dreapta) ---
    doc
      .fontSize(16)
      .font("Body-Bold")
      .text(company?.company_name || "Firma emitentă", 50, 50);

    doc.fontSize(9).font("Body").fillColor("#444444");
    let companyY = 72;
    const companyLines = [
      company?.address,
      [company?.postal_code, company?.city, company?.country]
        .filter(Boolean)
        .join(", "),
      company?.vat_number ? `CUI/CIF: ${company.vat_number}` : null,
      company?.registration_number
        ? `Reg. Com.: ${company.registration_number}`
        : null,
      company?.iban ? `IBAN: ${company.iban}` : null,
      company?.bank_name ? `Bancă: ${company.bank_name}` : null,
      company?.phone ? `Tel: ${company.phone}` : null,
      company?.email ? `Email: ${company.email}` : null,
    ].filter(Boolean);
    companyLines.forEach((line) => {
      doc.text(line, 50, companyY, { width: 260 });
      companyY += 14;
    });

    doc
      .fillColor("#000000")
      .fontSize(22)
      .font("Body-Bold")
      .text("FACTURĂ", 300, 50, { width: 245, align: "right" });

    doc
      .fontSize(10)
      .font("Body")
      .text(`Nr: ${invoice.invoice_number}`, 300, 80, {
        width: 245,
        align: "right",
      })
      .text(`Data emiterii: ${fmtDate(invoice.issue_date)}`, 300, 96, {
        width: 245,
        align: "right",
      })
      .text(`Scadență: ${fmtDate(invoice.due_date)}`, 300, 112, {
        width: 245,
        align: "right",
      });

    // --- Bloc client ---
    let clientY = Math.max(companyY, 140) + 20;
    doc
      .fillColor("#000000")
      .fontSize(10)
      .font("Body-Bold")
      .text("Facturat către:", 50, clientY);
    clientY += 16;

    doc.font("Body").fontSize(9);
    const clientLines = [
      client?.company_name || client?.client_name,
      client?.contact_person,
      client?.address,
      [client?.postal_code, client?.city, client?.country]
        .filter(Boolean)
        .join(", "),
      client?.vat_number ? `CUI/CIF: ${client.vat_number}` : null,
      client?.email ? `Email: ${client.email}` : null,
      client?.phone ? `Tel: ${client.phone}` : null,
    ].filter(Boolean);
    clientLines.forEach((line) => {
      doc.text(line, 50, clientY, { width: 300 });
      clientY += 13;
    });

    // --- Tabel linii factură ---
    let tableTop = clientY + 20;
    const colX = { desc: 50, qty: 300, um: 340, price: 385, total: 460 };
    const colW = { desc: 240, qty: 40, um: 45, price: 75, total: 85 };

    function drawTableHeader(y) {
      doc.font("Body-Bold").fontSize(9);
      doc.text("Descriere", colX.desc, y, { width: colW.desc });
      doc.text("Cant.", colX.qty, y, { width: colW.qty, align: "right" });
      doc.text("UM", colX.um, y, { width: colW.um });
      doc.text("Preț unitar", colX.price, y, {
        width: colW.price,
        align: "right",
      });
      doc.text("Total", colX.total, y, {
        width: colW.total,
        align: "right",
      });
      doc
        .moveTo(50, y + 14)
        .lineTo(545, y + 14)
        .strokeColor("#cccccc")
        .stroke();
    }

    drawTableHeader(tableTop);
    let rowY = tableTop + 20;
    doc.font("Body").fontSize(9);

    const items = invoice.items || [];
    items.forEach((item) => {
      if (rowY > 720) {
        doc.addPage();
        rowY = 50;
        drawTableHeader(rowY);
        rowY += 20;
      }

      const rowHeight = doc.heightOfString(item.description || "", {
        width: colW.desc,
      });

      doc.text(item.description || "-", colX.desc, rowY, {
        width: colW.desc,
      });
      doc.text(String(parseFloat(item.quantity) || 0), colX.qty, rowY, {
        width: colW.qty,
        align: "right",
      });
      doc.text(item.unit_of_measure || "-", colX.um, rowY, {
        width: colW.um,
      });
      doc.text(fmtMoney(item.unit_price, currency), colX.price, rowY, {
        width: colW.price,
        align: "right",
      });
      doc.text(fmtMoney(item.total_price, currency), colX.total, rowY, {
        width: colW.total,
        align: "right",
      });

      rowY += Math.max(rowHeight, 14) + 6;
    });

    doc
      .moveTo(50, rowY)
      .lineTo(545, rowY)
      .strokeColor("#cccccc")
      .stroke();
    rowY += 15;

    // --- Totaluri ---
    function totalLine(label, value, opts = {}) {
      doc
        .font(opts.bold ? "Body-Bold" : "Body")
        .fontSize(opts.bold ? 11 : 9)
        .text(label, 300, rowY, { width: 130 });
      doc.text(fmtMoney(value, currency), 430, rowY, {
        width: 115,
        align: "right",
      });
      rowY += opts.bold ? 18 : 14;
    }

    totalLine("Subtotal:", invoice.subtotal);
    if (parseFloat(invoice.discount_amount) > 0) {
      totalLine("Discount:", invoice.discount_amount);
    }
    totalLine("Total net:", invoice.total_net);
    totalLine(`TVA (${parseFloat(invoice.vat_rate) || 0}%):`, invoice.vat_amount);
    rowY += 4;
    totalLine("TOTAL DE PLATĂ:", invoice.total_gross, { bold: true });

    // --- Note ---
    if (invoice.notes) {
      rowY += 20;
      doc
        .font("Body-Bold")
        .fontSize(9)
        .text("Note:", 50, rowY);
      rowY += 14;
      doc.font("Body").fontSize(9).text(invoice.notes, 50, rowY, {
        width: 495,
      });
    }

    doc.end();
  });
}

module.exports = { generateInvoicePdf };
