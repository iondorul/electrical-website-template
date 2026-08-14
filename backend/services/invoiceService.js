const db = require("../config/db");
const { Errors, Statuses } = require("../constants");

class InvoiceService {
  static async _getDbClient() {
    if (typeof db.getClient === "function") {
      return await db.getClient();
    }
    if (typeof db.connect === "function") {
      return await db.connect();
    }
    if (db.pool && typeof db.pool.connect === "function") {
      return await db.pool.connect();
    }
    throw new Error(
      "Nu s-a putut obține un client de conectare din modulul db.",
    );
  }

  static async generateInvoiceNumber(client, userId) {
    const year = new Date().getFullYear();
    const lockKey = `invoice-${userId}-${year}`;

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

  static async createFromQuote(quoteId, userId) {
    const client = await this._getDbClient();
    try {
      await client.query("BEGIN");

      // 1. Verificare și preluare o ofertă aprobată aparținând utilizatorului
      const quoteRes = await client.query(
        `SELECT q.*, c.id as client_id, p.id as project_id 
         FROM quotes q
         LEFT JOIN clients c ON q.client_id = c.id
         LEFT JOIN projects p ON q.project_id = p.id
         WHERE q.id = $1 AND q.created_by = $2 AND q.is_active = true`,
        [quoteId, userId],
      );

      if (quoteRes.rows.length === 0) {
        throw new Error(Errors.QUOTE_NOT_FOUND);
      }

      const quote = quoteRes.rows[0];

      if (
        quote.status !== "approved" &&
        quote.status !== Statuses.QUOTE.APPROVED
      ) {
        throw new Error(Errors.QUOTE_NOT_APPROVED || "QUOTE_NOT_APPROVED");
      }

      // 2. Verificare dacă există deja o factură generată pentru această ofertă
      const existingInvoiceRes = await client.query(
        `SELECT id FROM invoices WHERE quote_id = $1 AND is_active = true`,
        [quoteId],
      );

      if (existingInvoiceRes.rows.length > 0) {
        throw new Error(Errors.INVOICE_ALREADY_EXISTS);
      }

      // 3. Generare număr factură protejat prin advisory lock
      const invoiceNumber = await this.generateInvoiceNumber(client, userId);

      // 4. Control date calendaristice din backend
      const issueDate = new Date();
      const dueDate = new Date();
      dueDate.setDate(issueDate.getDate() + 14); // termen implicit 14 zile

      // 5. Inserare factură folosind exclusiv valorile financiare din ofertă
      const invoiceQuery = `
        INSERT INTO invoices (
          invoice_number, quote_id, client_id, project_id, status,
          issue_date, due_date, subtotal_materials, subtotal_labor,
          subtotal_equipment, subtotal, discount_amount, total_net,
          vat_rate, vat_amount, total_gross, currency_code,
          notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
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
        quote.subtotal_materials || 0.0,
        quote.subtotal_labor || 0.0,
        quote.subtotal_equipment || 0.0,
        quote.subtotal || 0.0,
        quote.discount_amount || 0.0,
        quote.total_net || 0.0,
        quote.vat_rate || 19.0,
        quote.vat_amount || 0.0,
        quote.total_gross || 0.0,
        quote.currency_code || "EUR",
        quote.notes || null,
        userId,
      ];

      let newInvoice;
      try {
        const newInvoiceRes = await client.query(invoiceQuery, invoiceValues);
        newInvoice = newInvoiceRes.rows[0];
      } catch (dbError) {
        if (dbError.constraint === "uq_invoices_quote_id") {
          throw new Error(Errors.INVOICE_ALREADY_EXISTS);
        }
        if (dbError.constraint === "uq_user_invoice_number") {
          throw new Error("INVOICE_NUMBER_CONFLICT");
        }
        throw dbError;
      }

      // 6. Copiere 1:1 a liniilor din quote_items în invoice_items (11 coloane)
      const quoteItemsRes = await client.query(
        `SELECT category, item_code, description, quantity, 
                unit_of_measure, unit_price, margin_percent, total_price, 
                notes, sort_order 
         FROM quote_items 
         WHERE quote_id = $1
         ORDER BY sort_order ASC`,
        [quoteId],
      );

      if (quoteItemsRes.rows.length > 0) {
        const values = [];
        const valueClauses = [];

        quoteItemsRes.rows.forEach((item, index) => {
          const offset = index * 11;
          valueClauses.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`,
          );
          values.push(
            newInvoice.id,
            item.category,
            item.item_code,
            item.description,
            item.quantity,
            item.unit_of_measure,
            item.unit_price,
            item.margin_percent,
            item.total_price,
            item.notes,
            item.sort_order,
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
      throw error;
    } finally {
      if (typeof client.release === "function") {
        client.release();
      }
    }
  }

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

    const dataQuery = `
      SELECT i.*, 
             c.company_name as client_name, 
             p.project_name as project_name
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
        totalItems: totalItems,
        currentPage: page,
        limit: limit,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

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

    return {
      ...invoiceRes.rows[0],
      items: itemsRes.rows,
    };
  }

  static async update(
    id,
    userId,
    { status, vat_rate, issue_date, due_date, discount_amount },
  ) {
    // Preluăm factura curentă pentru a avea subtotalul de referință
    const currentRes = await db.query(
      `SELECT * FROM invoices WHERE id = $1 AND created_by = $2 AND is_active = true`,
      [id, userId],
    );

    if (currentRes.rows.length === 0) return null;

    const current = currentRes.rows[0];

    const finalStatus = status ?? current.status;
    const finalVatRate =
      vat_rate !== undefined && vat_rate !== null
        ? parseFloat(vat_rate)
        : parseFloat(current.vat_rate);
    const finalDiscount =
      discount_amount !== undefined && discount_amount !== null
        ? parseFloat(discount_amount)
        : parseFloat(current.discount_amount);
    const finalIssueDate = issue_date || current.issue_date;
    const finalDueDate = due_date || current.due_date;

    // Recalcul totaluri pe baza subtotalului existent
    const subtotal = parseFloat(current.subtotal) || 0;
    const totalNet = subtotal - finalDiscount;
    const vatAmount = totalNet * (finalVatRate / 100);
    const totalGross = totalNet + vatAmount;

    const updateQuery = `
      UPDATE invoices SET
        status = $1,
        vat_rate = $2,
        discount_amount = $3,
        issue_date = $4,
        due_date = $5,
        total_net = $6,
        vat_amount = $7,
        total_gross = $8,
        updated_by = $9
      WHERE id = $10 AND created_by = $11 AND is_active = true
      RETURNING *;
    `;

    const values = [
      finalStatus,
      finalVatRate,
      finalDiscount,
      finalIssueDate,
      finalDueDate,
      totalNet,
      vatAmount,
      totalGross,
      userId,
      id,
      userId,
    ];

    const result = await db.query(updateQuery, values);
    return result.rows[0] || null;
  }

  static async deleteAll(userId) {
    const query = `UPDATE invoices SET is_active = false WHERE created_by = $1 AND is_active = true`;
    const result = await db.query(query, [userId]);
    return result.rowCount;
  }
}

module.exports = InvoiceService;
