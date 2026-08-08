const db = require("../config/db");
const { Errors, Statuses } = require("../constants");

class InvoiceService {
  // Helper pentru conectare client SQL (tranzacții)
  static async _getDbClient() {
    if (typeof db.getClient === "function") return await db.getClient();
    if (typeof db.connect === "function") return await db.connect();
    if (db.pool && typeof db.pool.connect === "function")
      return await db.pool.connect();
    throw new Error(
      "Nu s-a putut obține un client de conectare din modulul db.",
    );
  }

  // Generare număr factură secvențial cu Advisory Lock atomic per utilizator/an
  static async generateInvoiceNumber(client, userId) {
    const year = new Date().getFullYear();
    const lockKey = `${userId}-${year}-invoice`;

    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [lockKey]);

    const prefix = `FACT-${year}-`;

    const res = await client.query(
      `SELECT invoice_number 
       FROM invoices 
       WHERE created_by = $1 AND invoice_number LIKE $2 
       ORDER BY id DESC LIMIT 1`,
      [userId, `${prefix}%`],
    );

    if (res.rows.length === 0) {
      return `${prefix}0001`;
    }

    const lastNumStr = res.rows[0].invoice_number.replace(prefix, "");
    const nextNum = parseInt(lastNumStr, 10) + 1;
    return `${prefix}${String(nextNum).padStart(4, "0")}`;
  }

  // Creare factură din ofertă aprobată
  static async createFromQuote(quoteId, userId, payload = {}) {
    const client = await this._getDbClient();
    try {
      await client.query("BEGIN");

      // 1. Preluare și validare ofertă
      const quoteRes = await client.query(
        `SELECT * FROM quotes WHERE id = $1 AND created_by = $2 AND is_active = true`,
        [quoteId, userId],
      );

      if (quoteRes.rows.length === 0) {
        throw new Error(Errors.QUOTE_NOT_FOUND);
      }

      const quote = quoteRes.rows[0];

      // 2. Validare status (doar ofertele aprobate pot fi facturate)
      if (quote.status !== Statuses.QUOTE.APPROVED) {
        throw new Error(Errors.QUOTE_NOT_APPROVED);
      }

      // 3. Verificare duplicat la nivel de aplicație
      const existingInvoiceRes = await client.query(
        `SELECT id FROM invoices WHERE quote_id = $1 AND is_active = true`,
        [quoteId],
      );

      if (existingInvoiceRes.rows.length > 0) {
        throw new Error(Errors.INVOICE_ALREADY_EXISTS);
      }

      const invoiceNumber = await this.generateInvoiceNumber(client, userId);

      // Calculare dată scadență (implicit 14 zile)
      const issueDate = payload.issue_date || new Date();
      let dueDate = payload.due_date;
      if (!dueDate) {
        const defaultDue = new Date(issueDate);
        defaultDue.setDate(defaultDue.getDate() + 14);
        dueDate = defaultDue;
      }

      const invoiceQuery = `
        INSERT INTO invoices (
          invoice_number, quote_id, client_id, project_id, status,
          issue_date, due_date, subtotal_materials, subtotal_labor,
          subtotal_equipment, subtotal, discount_amount, total_net,
          vat_rate, vat_amount, total_gross, paid_amount, currency_code,
          terms_and_conditions, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        RETURNING *;
      `;

      const invoiceValues = [
        invoiceNumber,
        quote.id,
        quote.client_id,
        quote.project_id,
        Statuses.INVOICE.DRAFT,
        issueDate,
        dueDate,
        quote.subtotal_materials,
        quote.subtotal_labor,
        quote.subtotal_equipment || 0.0,
        quote.subtotal,
        quote.discount_amount,
        quote.total_net,
        quote.vat_rate,
        quote.vat_amount,
        quote.total_gross,
        0.0,
        quote.currency_code || "EUR",
        payload.terms_and_conditions || quote.terms_and_conditions,
        payload.notes || quote.notes,
        userId,
      ];

      const newInvoiceRes = await client.query(invoiceQuery, invoiceValues);
      const newInvoice = newInvoiceRes.rows[0];

      // 4. Copiere articole din quote_items (mapare 1:1 pe schema reală DB)
      const itemsRes = await client.query(
        `SELECT category, item_code, description, quantity, unit_of_measure, 
                unit_price, margin_percent, total_price, notes, sort_order 
         FROM quote_items 
         WHERE quote_id = $1 
         ORDER BY sort_order ASC`,
        [quoteId],
      );

      if (itemsRes.rows.length > 0) {
        const values = [];
        const valueClauses = [];

        itemsRes.rows.forEach((item, index) => {
          const offset = index * 11;
          valueClauses.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`,
          );
          values.push(
            newInvoice.id,
            item.category,
            item.item_code || null,
            item.description,
            item.quantity,
            item.unit_of_measure,
            item.unit_price,
            item.margin_percent,
            item.total_price,
            item.notes || null,
            item.sort_order || 0,
          );
        });

        const bulkInsertQuery = `
          INSERT INTO invoice_items (
            invoice_id, category, item_code, description, quantity, 
            unit_of_measure, unit_price, margin_percent, total_price, 
            notes, sort_order
          ) VALUES ${valueClauses.join(", ")}
        `;

        await client.query(bulkInsertQuery, values);
      }

      await client.query("COMMIT");
      return newInvoice;
    } catch (error) {
      await client.query("ROLLBACK");
      // Prindere eroare de unicitate din indexul unic uq_invoices_quote_id
      if (
        error.code === "23505" &&
        error.constraint === "uq_invoices_quote_id"
      ) {
        throw new Error(Errors.INVOICE_ALREADY_EXISTS);
      }
      throw error;
    } finally {
      if (typeof client.release === "function") {
        client.release();
      }
    }
  }

  // Preluare facturi cu paginare și căutare
  static async getAll(
    userId,
    { page = 1, limit = 10, search = "", status = null },
  ) {
    const offset = (page - 1) * limit;
    let whereClause = `WHERE i.created_by = $1 AND i.is_active = true`;
    const params = [userId];

    if (status) {
      params.push(status);
      whereClause += ` AND i.status = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (i.invoice_number ILIKE $${params.length} OR c.company_name ILIKE $${params.length} OR p.project_name ILIKE $${params.length})`;
    }

    const countQuery = `
      SELECT COUNT(i.id) as total 
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      LEFT JOIN projects p ON i.project_id = p.id
      ${whereClause}
    `;
    const countRes = await db.query(countQuery, params);
    const totalItems = parseInt(countRes.rows[0].total, 10);

    let dataQuery = `
      SELECT i.*, c.company_name as client_name, p.project_name as project_name
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      LEFT JOIN projects p ON i.project_id = p.id
      ${whereClause}
      ORDER BY i.created_at DESC 
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(limit, offset);

    const dataRes = await db.query(dataQuery, params);

    return {
      items: dataRes.rows,
      pagination: {
        totalItems,
        currentPage: page,
        limit,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  // Preluare factură completă după ID
  static async getById(id, userId) {
    const invoiceRes = await db.query(
      `SELECT i.*, c.company_name as client_name, p.project_name as project_name 
       FROM invoices i
       LEFT JOIN clients c ON i.client_id = c.id
       LEFT JOIN projects p ON i.project_id = p.id
       WHERE i.id = $1 AND i.created_by = $2 AND i.is_active = true`,
      [id, userId],
    );

    if (invoiceRes.rows.length === 0) return null;

    const itemsRes = await db.query(
      `SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY sort_order ASC`,
      [id],
    );

    const paymentsRes = await db.query(
      `SELECT * FROM payments WHERE invoice_id = $1 ORDER BY payment_date DESC`,
      [id],
    );

    return {
      ...invoiceRes.rows[0],
      items: itemsRes.rows,
      payments: paymentsRes.rows,
    };
  }
}

module.exports = InvoiceService;
