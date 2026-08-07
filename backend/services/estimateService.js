const db = require("../config/db");

class EstimateService {
  // Helper pentru obținerea clientului de DB (suportă db.getClient, db.connect sau db.pool.connect)
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

  // Helper Thread-Safe cu Advisory Lock dedicat pe (userId, year)
  static async generateEstimateNumber(client, userId) {
    const year = new Date().getFullYear();
    const prefix = `EST-${year}-`;

    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1 || '-' || $2))`,
      [userId.toString(), year.toString()],
    );

    const query = `
      SELECT estimate_number 
      FROM public.estimates 
      WHERE user_id = $1 AND estimate_number LIKE $2 
      ORDER BY id DESC LIMIT 1
    `;
    const { rows } = await client.query(query, [userId, `${prefix}%`]);

    if (rows.length === 0) {
      return `${prefix}000001`;
    }

    const lastNum = parseInt(rows[0].estimate_number.replace(prefix, ""), 10);
    const nextNum = (lastNum + 1).toString().padStart(6, "0");
    return `${prefix}${nextNum}`;
  }

  // 1. GET ALL ESTIMATES
  static async getAllEstimates(userId, options = {}) {
    const { page = 1, limit = 10, search = "", status = "" } = options;
    const offset = (page - 1) * limit;
    const params = [userId];
    let paramIndex = 2;

    let whereClause = `WHERE e.user_id = $1 AND e.is_active = TRUE`;

    if (search) {
      whereClause += ` AND (e.estimate_number ILIKE $${paramIndex} OR e.title ILIKE $${paramIndex} OR c.company_name ILIKE $${paramIndex} OR p.project_name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (status) {
      whereClause += ` AND e.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    const countQuery = `
      SELECT COUNT(e.id) 
      FROM public.estimates e
      LEFT JOIN public.clients c ON e.client_id = c.id
      LEFT JOIN public.projects p ON e.project_id = p.id
      ${whereClause}
    `;
    const countResult = await db.query(countQuery, params);
    const totalItems = parseInt(countResult.rows[0].count, 10);

    const dataQuery = `
      SELECT e.*, 
             c.company_name AS client_name, 
             p.project_name AS project_name
      FROM public.estimates e
      LEFT JOIN public.clients c ON e.client_id = c.id
      LEFT JOIN public.projects p ON e.project_id = p.id
      ${whereClause}
      ORDER BY e.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limit, offset);

    const { rows } = await db.query(dataQuery, params);

    return {
      data: rows,
      pagination: {
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: parseInt(page, 10),
        limit: parseInt(limit, 10),
      },
    };
  }

  // 2. GET BY ID WITH ITEMS
  static async getEstimateById(id, userId) {
    const estimateQuery = `
      SELECT e.*, 
             c.company_name AS client_name, 
             p.project_name AS project_name
      FROM public.estimates e
      LEFT JOIN public.clients c ON e.client_id = c.id
      LEFT JOIN public.projects p ON e.project_id = p.id
      WHERE e.id = $1 AND e.user_id = $2 AND e.is_active = TRUE
    `;
    const { rows: estimateRows } = await db.query(estimateQuery, [id, userId]);

    if (estimateRows.length === 0) return null;

    const itemsQuery = `
      SELECT * FROM public.estimate_items
      WHERE estimate_id = $1
      ORDER BY sort_order ASC, id ASC
    `;
    const { rows: itemRows } = await db.query(itemsQuery, [id]);

    return {
      ...estimateRows[0],
      items: itemRows,
    };
  }

  // 3. CREATE ESTIMATE
  static async createEstimate(userId, data) {
    const client = await this._getDbClient();
    try {
      await client.query("BEGIN");

      const estimateNumber = await this.generateEstimateNumber(client, userId);
      const {
        client_id,
        project_id,
        title,
        status = "draft",
        labor_rate_per_hour = 0,
        notes,
        items = [],
      } = data;

      let totalLaborHours = 0;
      let totalMaterialsCost = 0;
      let totalLaborCost = 0;

      const processedItems = items.map((item, index) => {
        const qty = parseFloat(item.quantity) || 0;
        const unitCost = parseFloat(item.unit_cost) || 0;
        const margin = parseFloat(item.margin_percent) || 0;
        const unitPrice = unitCost + unitCost * (margin / 100);
        const totalPrice = qty * unitPrice;

        if (item.item_type === "labor") {
          totalLaborHours += qty;
          totalLaborCost += totalPrice;
        } else {
          totalMaterialsCost += totalPrice;
        }

        return {
          material_id: item.material_id || null,
          item_type: item.item_type || "material",
          description: item.description,
          unit_of_measure: item.unit_of_measure || "buc",
          quantity: qty,
          unit_cost: unitCost,
          margin_percent: margin,
          unit_price: unitPrice,
          total_price: totalPrice,
          notes: item.notes || null,
          sort_order: index + 1,
        };
      });

      const grandTotal = totalMaterialsCost + totalLaborCost;

      const insertEstimateQuery = `
        INSERT INTO public.estimates (
          user_id, client_id, project_id, estimate_number, title, status,
          labor_rate_per_hour, total_labor_hours, total_materials_cost,
          total_labor_cost, grand_total, notes, created_by, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $1, $1)
        RETURNING *
      `;

      const { rows: estimateRows } = await client.query(insertEstimateQuery, [
        userId,
        client_id,
        project_id || null,
        estimateNumber,
        title,
        status,
        labor_rate_per_hour,
        totalLaborHours,
        totalMaterialsCost,
        totalLaborCost,
        grandTotal,
        notes,
      ]);

      const newEstimate = estimateRows[0];

      if (processedItems.length > 0) {
        const valueStrings = [];
        const queryParams = [];
        let paramIdx = 1;

        processedItems.forEach((item) => {
          valueStrings.push(
            `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8}, $${paramIdx + 9}, $${paramIdx + 10}, $${paramIdx + 11})`,
          );
          queryParams.push(
            newEstimate.id,
            item.material_id,
            item.item_type,
            item.description,
            item.unit_of_measure,
            item.quantity,
            item.unit_cost,
            item.margin_percent,
            item.unit_price,
            item.total_price,
            item.notes,
            item.sort_order,
          );
          paramIdx += 12;
        });

        const bulkInsertQuery = `
          INSERT INTO public.estimate_items (
            estimate_id, material_id, item_type, description, unit_of_measure,
            quantity, unit_cost, margin_percent, unit_price, total_price, notes, sort_order
          ) VALUES ${valueStrings.join(", ")}
        `;
        await client.query(bulkInsertQuery, queryParams);
      }

      await client.query("COMMIT");
      return this.getEstimateById(newEstimate.id, userId);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      if (typeof client.release === "function") {
        client.release();
      }
    }
  }

  // 4. UPDATE ESTIMATE
  static async updateEstimate(id, userId, data) {
    const client = await this._getDbClient();
    try {
      await client.query("BEGIN");

      const {
        client_id,
        project_id,
        title,
        status,
        labor_rate_per_hour = 0,
        notes,
        items = [],
      } = data;

      let totalLaborHours = 0;
      let totalMaterialsCost = 0;
      let totalLaborCost = 0;

      const processedItems = items.map((item, index) => {
        const qty = parseFloat(item.quantity) || 0;
        const unitCost = parseFloat(item.unit_cost) || 0;
        const margin = parseFloat(item.margin_percent) || 0;
        const unitPrice = unitCost + unitCost * (margin / 100);
        const totalPrice = qty * unitPrice;

        if (item.item_type === "labor") {
          totalLaborHours += qty;
          totalLaborCost += totalPrice;
        } else {
          totalMaterialsCost += totalPrice;
        }

        return {
          material_id: item.material_id || null,
          item_type: item.item_type || "material",
          description: item.description,
          unit_of_measure: item.unit_of_measure || "buc",
          quantity: qty,
          unit_cost: unitCost,
          margin_percent: margin,
          unit_price: unitPrice,
          total_price: totalPrice,
          notes: item.notes || null,
          sort_order: index + 1,
        };
      });

      const grandTotal = totalMaterialsCost + totalLaborCost;

      const updateEstimateQuery = `
        UPDATE public.estimates
        SET client_id = $1, project_id = $2, title = $3, status = $4,
            labor_rate_per_hour = $5, total_labor_hours = $6, total_materials_cost = $7,
            total_labor_cost = $8, grand_total = $9, notes = $10, updated_by = $11
        WHERE id = $12 AND user_id = $11 AND is_active = TRUE
        RETURNING *
      `;

      const { rows } = await client.query(updateEstimateQuery, [
        client_id,
        project_id || null,
        title,
        status,
        labor_rate_per_hour,
        totalLaborHours,
        totalMaterialsCost,
        totalLaborCost,
        grandTotal,
        notes,
        userId,
        id,
      ]);

      if (rows.length === 0) {
        await client.query("ROLLBACK");
        return null;
      }

      await client.query(
        `DELETE FROM public.estimate_items WHERE estimate_id = $1`,
        [id],
      );

      if (processedItems.length > 0) {
        const valueStrings = [];
        const queryParams = [];
        let paramIdx = 1;

        processedItems.forEach((item) => {
          valueStrings.push(
            `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8}, $${paramIdx + 9}, $${paramIdx + 10}, $${paramIdx + 11})`,
          );
          queryParams.push(
            id,
            item.material_id,
            item.item_type,
            item.description,
            item.unit_of_measure,
            item.quantity,
            item.unit_cost,
            item.margin_percent,
            item.unit_price,
            item.total_price,
            item.notes,
            item.sort_order,
          );
          paramIdx += 12;
        });

        const bulkInsertQuery = `
          INSERT INTO public.estimate_items (
            estimate_id, material_id, item_type, description, unit_of_measure,
            quantity, unit_cost, margin_percent, unit_price, total_price, notes, sort_order
          ) VALUES ${valueStrings.join(", ")}
        `;
        await client.query(bulkInsertQuery, queryParams);
      }

      await client.query("COMMIT");
      return this.getEstimateById(id, userId);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      if (typeof client.release === "function") {
        client.release();
      }
    }
  }

  // 5. SOFT DELETE
  static async softDeleteEstimate(id, userId) {
    const query = `
      UPDATE public.estimates 
      SET is_active = FALSE, updated_by = $2 
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `;
    const { rows } = await db.query(query, [id, userId]);
    return rows.length > 0;
  }
}

module.exports = EstimateService;
