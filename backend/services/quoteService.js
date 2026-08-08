const db = require("../config/db");
const { Errors, Statuses } = require("../constants");

class QuoteService {
  // Helper preluat din estimateService.js
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

  static async generateQuoteNumber(client, userId) {
    const year = new Date().getFullYear();
    const lockKey = `${userId}-${year}`;

    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [lockKey]);

    const prefix = `OFF-${year}-`;

    const res = await client.query(
      `SELECT quote_number 
             FROM quotes 
             WHERE created_by = $1 AND quote_number LIKE $2 
             ORDER BY id DESC LIMIT 1`,
      [userId, `${prefix}%`],
    );

    if (res.rows.length === 0) {
      return `${prefix}0001`;
    }

    const lastNumStr = res.rows[0].quote_number.replace(prefix, "");
    const nextNum = parseInt(lastNumStr, 10) + 1;
    return `${prefix}${String(nextNum).padStart(4, "0")}`;
  }

  static async createFromEstimate(estimateId, userId, quotePayload) {
    const client = await this._getDbClient();
    try {
      await client.query("BEGIN");

      const estimateRes = await client.query(
        `SELECT * FROM estimates 
                 WHERE id = $1 AND created_by = $2 AND is_active = true`,
        [estimateId, userId],
      );

      if (estimateRes.rows.length === 0) {
        throw new Error(Errors.ESTIMATE_NOT_FOUND);
      }

      const est = estimateRes.rows[0];

      if (
        est.status !== "completed" &&
        est.status !== Statuses.ESTIMATE.COMPLETED
      ) {
        throw new Error(
          "Devizul trebuie să fie în starea Finalizat (completed).",
        );
      }

      const existingQuoteRes = await client.query(
        `SELECT id FROM quotes WHERE estimate_id = $1 AND is_active = true`,
        [estimateId],
      );

      if (existingQuoteRes.rows.length > 0) {
        throw new Error(Errors.QUOTE_ALREADY_EXISTS);
      }

      const quoteNumber = await this.generateQuoteNumber(client, userId);

      // Calculare și mapare sume de pe coloanele reale din estimates
      const subtotalMaterials = parseFloat(est.total_materials_cost) || 0.0;
      const subtotalLabor = parseFloat(est.total_labor_cost) || 0.0;
      const subtotalEquipment = 0.0;
      const subtotal = subtotalMaterials + subtotalLabor + subtotalEquipment;
      const discountAmount = 0.0;
      const totalNet = subtotal - discountAmount;
      const vatRate = 19.0;
      const vatAmount = totalNet * (vatRate / 100);
      const totalGross = totalNet + vatAmount;

      const quoteQuery = `
                INSERT INTO quotes (
                    quote_number, estimate_id, project_id, client_id, status,
                    issue_date, valid_until, subtotal_materials, subtotal_labor,
                    subtotal_equipment, subtotal, discount_amount, total_net,
                    vat_rate, vat_amount, total_gross, currency_code,
                    show_material_breakdown, terms_and_conditions, notes, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
                RETURNING *;
            `;

      const quoteValues = [
        quoteNumber,
        est.id,
        est.project_id,
        est.client_id,
        Statuses.QUOTE.DRAFT,
        quotePayload.issue_date || new Date(),
        quotePayload.valid_until,
        subtotalMaterials,
        subtotalLabor,
        subtotalEquipment,
        subtotal,
        discountAmount,
        totalNet,
        vatRate,
        vatAmount,
        totalGross,
        "EUR",
        quotePayload.show_material_breakdown || false,
        quotePayload.terms_and_conditions || null,
        quotePayload.notes || null,
        userId,
      ];

      const newQuoteRes = await client.query(quoteQuery, quoteValues);
      const newQuote = newQuoteRes.rows[0];

      const itemsRes = await client.query(
        `SELECT item_type, description, quantity, unit_of_measure, 
                        unit_price, margin_percent, total_price, notes, sort_order 
                 FROM estimate_items 
                 WHERE estimate_id = $1`,
        [estimateId],
      );

      if (itemsRes.rows.length > 0) {
        const values = [];
        const valueClauses = [];

        itemsRes.rows.forEach((item, index) => {
          const offset = index * 10;
          valueClauses.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`,
          );
          values.push(
            newQuote.id,
            item.item_type,
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

        // Corectat denumirea coloanei conform DDL real PostgreSQL (category în loc de item_type)
        const bulkInsertQuery = `
              INSERT INTO quote_items (
                  quote_id, category, description, quantity, 
                  unit_of_measure, unit_price, margin_percent, total_price, 
                  notes, sort_order
              ) VALUES ${valueClauses.join(", ")}
          `;

        await client.query(bulkInsertQuery, values);
      }

      await client.query("COMMIT");
      return newQuote;
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

    let whereClause = `WHERE q.created_by = $1 AND q.is_active = true`;
    const params = [userId];

    if (status) {
      params.push(status);
      whereClause += ` AND q.status = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (q.quote_number ILIKE $${params.length} OR c.company_name ILIKE $${params.length} OR p.project_name ILIKE $${params.length})`;
    }

    const countQuery = `
            SELECT COUNT(q.id) as total 
            FROM quotes q
            LEFT JOIN clients c ON q.client_id = c.id
            LEFT JOIN projects p ON q.project_id = p.id
            ${whereClause}
        `;
    const countRes = await db.query(countQuery, params);
    const totalItems = parseInt(countRes.rows[0].total, 10);

    let dataQuery = `
            SELECT q.*, c.company_name as client_name, p.project_name as project_name
            FROM quotes q
            LEFT JOIN clients c ON q.client_id = c.id
            LEFT JOIN projects p ON q.project_id = p.id
            ${whereClause}
            ORDER BY q.created_at DESC 
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
    const quoteRes = await db.query(
      `SELECT q.*, c.company_name as client_name, p.project_name as project_name 
             FROM quotes q
             LEFT JOIN clients c ON q.client_id = c.id
             LEFT JOIN projects p ON q.project_id = p.id
             WHERE q.id = $1 AND q.created_by = $2 AND q.is_active = true`,
      [id, userId],
    );

    if (quoteRes.rows.length === 0) return null;

    const itemsRes = await db.query(
      `SELECT * FROM quote_items WHERE quote_id = $1 ORDER BY sort_order ASC`,
      [id],
    );

    return {
      ...quoteRes.rows[0],
      items: itemsRes.rows,
    };
  }

  static async updateStatus(id, userId, newStatus) {
    const currentRes = await db.query(
      `SELECT status FROM quotes WHERE id = $1 AND created_by = $2 AND is_active = true`,
      [id, userId],
    );

    if (currentRes.rows.length === 0) return null;

    const currentStatus = currentRes.rows[0].status;

    const allowedTransitions = {
      [Statuses.QUOTE.DRAFT]: [Statuses.QUOTE.SENT, Statuses.QUOTE.CANCELED],
      [Statuses.QUOTE.SENT]: [
        Statuses.QUOTE.APPROVED,
        Statuses.QUOTE.REJECTED,
        Statuses.QUOTE.EXPIRED,
        Statuses.QUOTE.CANCELED,
      ],
      [Statuses.QUOTE.APPROVED]: [Statuses.QUOTE.CANCELED],
      [Statuses.QUOTE.REJECTED]: [Statuses.QUOTE.DRAFT],
      [Statuses.QUOTE.EXPIRED]: [Statuses.QUOTE.DRAFT],
      [Statuses.QUOTE.CANCELED]: [],
    };

    if (!allowedTransitions[currentStatus]?.includes(newStatus)) {
      throw new Error(Errors.INVALID_STATUS_TRANSITION);
    }

    const res = await db.query(
      `UPDATE quotes 
             SET status = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
             WHERE id = $3 AND created_by = $4 AND is_active = true
             RETURNING *`,
      [newStatus, userId, id, userId],
    );

    return res.rows[0];
  }

  static async softDelete(id, userId) {
    const res = await db.query(
      `UPDATE quotes 
             SET is_active = false, updated_by = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND created_by = $3 AND is_active = true
             RETURNING id`,
      [userId, id, userId],
    );
    return res.rows.length > 0;
  }
}

module.exports = QuoteService;
