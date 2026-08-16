const db = require("../config/db");
const { Statuses } = require("../constants");

class PaymentService {
  static async recordPayment(
    invoiceId,
    userId,
    { amount, payment_date, payment_method, reference_number, notes },
  ) {
    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const invoiceRes = await client.query(
        `SELECT * FROM invoices
         WHERE id = $1 AND created_by = $2 AND is_active = true
         FOR UPDATE`,
        [invoiceId, userId],
      );

      if (invoiceRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return null;
      }

      const invoice = invoiceRes.rows[0];

      if (invoice.status === Statuses.INVOICE.CANCELED) {
        await client.query("ROLLBACK");
        throw new Error("INVOICE_CANCELED_CANNOT_PAY");
      }

      await client.query(
        `INSERT INTO payments (
           invoice_id, amount, payment_date, payment_method, reference_number, notes, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          invoiceId,
          amount,
          payment_date || new Date(),
          payment_method || null,
          reference_number || null,
          notes || null,
          userId,
        ],
      );

      const sumRes = await client.query(
        `SELECT COALESCE(SUM(amount), 0) AS total_paid FROM payments WHERE invoice_id = $1`,
        [invoiceId],
      );
      const totalPaid = parseFloat(sumRes.rows[0].total_paid);
      const totalGross = parseFloat(invoice.total_gross);

      let newStatus = invoice.status;
      if (totalPaid >= totalGross) {
        newStatus = Statuses.INVOICE.PAID;
      } else if (totalPaid > 0) {
        newStatus = Statuses.INVOICE.PARTIALLY_PAID;
      }

      const updateRes = await client.query(
        `UPDATE invoices SET paid_amount = $1, status = $2, updated_by = $3
         WHERE id = $4
         RETURNING *`,
        [totalPaid, newStatus, userId, invoiceId],
      );

      await client.query("COMMIT");
      return updateRes.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  static async listPayments(invoiceId, userId) {
    const invoiceRes = await db.query(
      `SELECT id FROM invoices WHERE id = $1 AND created_by = $2 AND is_active = true`,
      [invoiceId, userId],
    );
    if (invoiceRes.rows.length === 0) return null;

    const paymentsRes = await db.query(
      `SELECT * FROM payments WHERE invoice_id = $1 ORDER BY payment_date DESC, id DESC`,
      [invoiceId],
    );
    return paymentsRes.rows;
  }
}

module.exports = PaymentService;
