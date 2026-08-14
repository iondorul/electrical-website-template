const InvoiceService = require("../services/invoiceService");
const { Errors } = require("../constants");

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
