const InvoiceService = require("../services/invoiceService");
const CompanySettingsService = require("../services/companySettingsService");
const { generateInvoicePdf } = require("../services/invoicePdfService");
const { sendInvoiceEmail } = require("../services/emailService");
const { Errors, Statuses } = require("../constants");

async function buildPdfBuffer(invoice, userId, preloadedCompany) {
  const company =
    preloadedCompany !== undefined
      ? preloadedCompany
      : await CompanySettingsService.getByUserId(userId);
  return generateInvoicePdf({
    invoice,
    client: {
      company_name: invoice.client_name,
      contact_person: invoice.client_contact_person,
      email: invoice.client_email,
      phone: invoice.client_phone,
      address: invoice.client_address,
      city: invoice.client_city,
      country: invoice.client_country,
      postal_code: invoice.client_postal_code,
      vat_number: invoice.client_vat_number,
    },
    company,
  });
}

class InvoiceController {
  static async createFromQuote(req, res) {
    try {
      const { quote_id } = req.body;
      const quoteId = parseInt(quote_id, 10);

      if (!Number.isInteger(quoteId) || quoteId <= 0) {
        return res.status(400).json({
          success: false,
          error: Errors.MISSING_REQUIRED_FIELDS,
          message: "quote_id must be a valid positive integer.",
        });
      }

      const invoice = await InvoiceService.createFromQuote(
        quoteId,
        req.user.id,
        req.body,
      );

      return res.status(201).json({ success: true, data: invoice });
    } catch (error) {
      if (error.message === Errors.QUOTE_NOT_FOUND) {
        return res.status(404).json({
          success: false,
          error: Errors.QUOTE_NOT_FOUND,
          message: "Target quote does not exist or is inactive.",
        });
      }
      if (error.message === Errors.QUOTE_NOT_APPROVED) {
        return res.status(400).json({
          success: false,
          error: Errors.QUOTE_NOT_APPROVED,
          message: "Only approved quotes can be converted to invoices.",
        });
      }
      if (error.message === Errors.INVOICE_ALREADY_EXISTS) {
        return res.status(409).json({
          success: false,
          error: Errors.INVOICE_ALREADY_EXISTS,
          message: "An invoice has already been created for this quote.",
        });
      }
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: error.message,
      });
    }
  }

  static async getAll(req, res) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const { search, status } = req.query;

      const result = await InvoiceService.getAll(req.user.id, {
        page,
        limit,
        search,
        status,
      });

      return res.status(200).json({
        success: true,
        data: result.items,
        pagination: result.pagination,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: error.message,
      });
    }
  }

  static async getById(req, res) {
    try {
      const id = parseInt(req.params.id, 10);

      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          error: Errors.MISSING_REQUIRED_FIELDS,
          message: "Invoice ID must be a valid positive integer.",
        });
      }

      const invoice = await InvoiceService.getById(id, req.user.id);

      if (!invoice) {
        return res
          .status(404)
          .json({ success: false, error: Errors.INVOICE_NOT_FOUND });
      }

      return res.status(200).json({ success: true, data: invoice });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: error.message,
      });
    }
  }

  static async update(req, res) {
    try {
      const id = parseInt(req.params.id, 10);

      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          error: Errors.MISSING_REQUIRED_FIELDS,
          message: "Invoice ID must be a valid positive integer.",
        });
      }

      const { status, vat_rate, issue_date, due_date, discount_amount } =
        req.body;

      const updatedInvoice = await InvoiceService.update(id, req.user.id, {
        status,
        vat_rate,
        issue_date,
        due_date,
        discount_amount,
      });

      if (!updatedInvoice) {
        return res
          .status(404)
          .json({ success: false, error: Errors.INVOICE_NOT_FOUND });
      }

      return res.status(200).json({ success: true, data: updatedInvoice });
    } catch (error) {
      if (error.message === "INVALID_STATUS_TRANSITION_CANCELED") {
        return res.status(400).json({
          success: false,
          message:
            "O factură anulată nu mai poate fi modificată. Emite o factură nouă dacă e nevoie.",
        });
      }
      if (error.message === "INVALID_STATUS_TRANSITION_PAID_TO_DRAFT") {
        return res.status(400).json({
          success: false,
          message:
            "O factură plătită nu poate reveni la statusul Ciornă (Draft).",
        });
      }
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: error.message,
      });
    }
  }

  static async downloadPdf(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          error: Errors.MISSING_REQUIRED_FIELDS,
          message: "Invoice ID must be a valid positive integer.",
        });
      }

      const invoice = await InvoiceService.getById(id, req.user.id);
      if (!invoice) {
        return res
          .status(404)
          .json({ success: false, error: Errors.INVOICE_NOT_FOUND });
      }

      const pdfBuffer = await buildPdfBuffer(invoice, req.user.id);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${invoice.invoice_number}.pdf"`,
      );
      return res.send(pdfBuffer);
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: error.message,
      });
    }
  }

  static async sendEmail(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          error: Errors.MISSING_REQUIRED_FIELDS,
          message: "Invoice ID must be a valid positive integer.",
        });
      }

      const invoice = await InvoiceService.getById(id, req.user.id);
      if (!invoice) {
        return res
          .status(404)
          .json({ success: false, error: Errors.INVOICE_NOT_FOUND });
      }

      if (invoice.status === Statuses.INVOICE.CANCELED) {
        return res.status(400).json({
          success: false,
          error: Errors.INVOICE_CANCELED_CANNOT_SEND,
          message: "O factură anulată nu poate fi trimisă către client.",
        });
      }

      if (!invoice.client_email) {
        return res.status(400).json({
          success: false,
          error: Errors.INVOICE_NO_CLIENT_EMAIL,
          message:
            "Clientul asociat acestei facturi nu are o adresă de email completată.",
        });
      }

      const company = await CompanySettingsService.getByUserId(req.user.id);
      const pdfBuffer = await buildPdfBuffer(invoice, req.user.id, company);

      await sendInvoiceEmail({
        to: invoice.client_email,
        invoiceNumber: invoice.invoice_number,
        companyName: company?.company_name,
        totalGross: parseFloat(invoice.total_gross).toFixed(2),
        currency: invoice.currency_code ? invoice.currency_code.trim() : "RON",
        dueDate: invoice.due_date
          ? new Date(invoice.due_date).toLocaleDateString("ro-RO")
          : "-",
        pdfBuffer,
      });

      const updatedInvoice = await InvoiceService.markAsSent(
        id,
        req.user.id,
        invoice.client_email,
      );

      return res.status(200).json({
        success: true,
        message: `Factura a fost trimisă la ${invoice.client_email}.`,
        data: updatedInvoice,
      });
    } catch (error) {
      if (error.message === "SMTP_NOT_CONFIGURED") {
        return res.status(400).json({
          success: false,
          error: Errors.SMTP_NOT_CONFIGURED,
          message:
            "Trimiterea de email nu este configurată. Completează SMTP_HOST, SMTP_USER și SMTP_PASS în .env.",
        });
      }
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: error.message,
      });
    }
  }

  static async deleteAll(req, res) {
    try {
      const deletedCount = await InvoiceService.deleteAll(req.user.id);

      return res.status(200).json({
        success: true,
        message: "Toate facturile au fost șterse cu succes.",
        data: { deletedCount },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: error.message,
      });
    }
  }
}

module.exports = InvoiceController;
