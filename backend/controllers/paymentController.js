const PaymentService = require("../services/paymentService");
const { Errors } = require("../constants");

class PaymentController {
  static async recordPayment(req, res) {
    try {
      const invoiceId = parseInt(req.params.id, 10);
      if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
        return res.status(400).json({
          success: false,
          error: Errors.MISSING_REQUIRED_FIELDS,
          message: "Invoice ID must be a valid positive integer.",
        });
      }

      const amount = parseFloat(req.body.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({
          success: false,
          error: Errors.INVALID_PAYMENT_AMOUNT,
          message: "Suma plății trebuie să fie un număr pozitiv.",
        });
      }

      const { payment_date, payment_method, reference_number, notes } =
        req.body;

      const updatedInvoice = await PaymentService.recordPayment(
        invoiceId,
        req.user.id,
        { amount, payment_date, payment_method, reference_number, notes },
      );

      if (!updatedInvoice) {
        return res
          .status(404)
          .json({ success: false, error: Errors.INVOICE_NOT_FOUND });
      }

      return res.status(201).json({
        success: true,
        message: "Plata a fost înregistrată cu succes.",
        data: updatedInvoice,
      });
    } catch (error) {
      if (error.message === "INVOICE_CANCELED_CANNOT_PAY") {
        return res.status(400).json({
          success: false,
          error: Errors.INVOICE_CANCELED_CANNOT_PAY,
          message: "O factură anulată nu poate primi plăți.",
        });
      }
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: error.message,
      });
    }
  }

  static async listPayments(req, res) {
    try {
      const invoiceId = parseInt(req.params.id, 10);
      if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
        return res.status(400).json({
          success: false,
          error: Errors.MISSING_REQUIRED_FIELDS,
          message: "Invoice ID must be a valid positive integer.",
        });
      }

      const payments = await PaymentService.listPayments(
        invoiceId,
        req.user.id,
      );

      if (payments === null) {
        return res
          .status(404)
          .json({ success: false, error: Errors.INVOICE_NOT_FOUND });
      }

      return res.status(200).json({ success: true, data: payments });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: error.message,
      });
    }
  }
}

module.exports = PaymentController;
