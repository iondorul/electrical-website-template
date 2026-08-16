const db = require("../config/db");

class MaterialService {
  static async getAll(
    userId,
    { page = 1, limit = 10, search = "", category = null },
  ) {
    const offset = (page - 1) * limit;

    let whereClause = `WHERE created_by = $1 AND is_active = true`;
    const params = [userId];

    if (category) {
      params.push(category);
      whereClause += ` AND category = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (name ILIKE $${params.length} OR item_code ILIKE $${params.length})`;
    }

    const countQuery = `SELECT COUNT(id) as total FROM materials ${whereClause}`;
    const countRes = await db.query(countQuery, params);
    const totalItems = parseInt(countRes.rows[0].total, 10);

    const dataQuery = `
      SELECT * FROM materials
      ${whereClause}
      ORDER BY name ASC
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

  static async getById(id, userId) {
    const res = await db.query(
      `SELECT * FROM materials WHERE id = $1 AND created_by = $2 AND is_active = true`,
      [id, userId],
    );
    return res.rows[0] || null;
  }

  static async create(userId, data) {
    const {
      item_code,
      name,
      category,
      unit_of_measure,
      unit_price,
      stock_quantity,
      min_stock,
    } = data;

    const query = `
      INSERT INTO materials (
        created_by, item_code, name, category,
        unit_of_measure, unit_price, stock_quantity, min_stock
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;

    const values = [
      userId,
      item_code || null,
      name,
      category,
      unit_of_measure,
      unit_price || 0,
      stock_quantity || 0,
      min_stock || 0,
    ];

    const res = await db.query(query, values);
    return res.rows[0];
  }

  static async update(id, userId, data) {
    const current = await this.getById(id, userId);
    if (!current) return null;

    const {
      item_code,
      name,
      category,
      unit_of_measure,
      unit_price,
      stock_quantity,
      min_stock,
    } = data;

    const query = `
      UPDATE materials SET
        item_code = $1,
        name = $2,
        category = $3,
        unit_of_measure = $4,
        unit_price = $5,
        stock_quantity = $6,
        min_stock = $7
      WHERE id = $8 AND created_by = $9 AND is_active = true
      RETURNING *;
    `;

    const values = [
      item_code !== undefined ? item_code : current.item_code,
      name !== undefined ? name : current.name,
      category !== undefined ? category : current.category,
      unit_of_measure !== undefined ? unit_of_measure : current.unit_of_measure,
      unit_price !== undefined ? unit_price : current.unit_price,
      stock_quantity !== undefined ? stock_quantity : current.stock_quantity,
      min_stock !== undefined ? min_stock : current.min_stock,
      id,
      userId,
    ];

    const res = await db.query(query, values);
    return res.rows[0] || null;
  }

  static async delete(id, userId) {
    const res = await db.query(
      `UPDATE materials SET is_active = false WHERE id = $1 AND created_by = $2 AND is_active = true RETURNING id`,
      [id, userId],
    );
    return res.rows[0] || null;
  }

  static async deleteAll(userId) {
    const result = await db.query(
      `UPDATE materials SET is_active = false WHERE created_by = $1 AND is_active = true`,
      [userId],
    );
    return result.rowCount;
  }
}

module.exports = MaterialService;
