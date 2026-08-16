const db = require("../config/db");

class ReportArchiveService {
  static async generateReportNumber(client, userId) {
    const year = new Date().getFullYear();
    const lockKey = `report-${userId}-${year}`;

    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [lockKey]);

    const prefix = `REP-${year}-`;

    const res = await client.query(
      `SELECT report_number
       FROM generated_reports
       WHERE generated_by = $1 AND report_number LIKE $2
       ORDER BY id DESC LIMIT 1`,
      [userId, `${prefix}%`],
    );

    if (res.rows.length === 0) {
      return `${prefix}00001`;
    }

    const lastNumStr = res.rows[0].report_number.replace(prefix, "");
    const nextNum = parseInt(lastNumStr, 10) + 1;
    return `${prefix}${String(nextNum).padStart(5, "0")}`;
  }

  static async create(
    userId,
    { reportType, reportName, filters, fileName, fileBuffer },
  ) {
    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const reportNumber = await this.generateReportNumber(client, userId);

      const res = await client.query(
        `INSERT INTO generated_reports (
           report_number, report_type, report_name, filters_json,
           file_name, file_size, file_data, generated_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, report_number, report_type, report_name, filters_json,
                   file_name, file_size, status, generated_at, generated_by`,
        [
          reportNumber,
          reportType,
          reportName,
          JSON.stringify(filters || {}),
          fileName,
          fileBuffer.length,
          fileBuffer,
          userId,
        ],
      );

      await client.query("COMMIT");
      return res.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  static async list(
    userId,
    { search, reportType, clientId, projectId, from, to },
  ) {
    const params = [userId];
    let where = `WHERE generated_by = $1`;

    if (reportType) {
      params.push(reportType);
      where += ` AND report_type = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (report_name ILIKE $${params.length} OR report_number ILIKE $${params.length})`;
    }
    if (clientId) {
      params.push(String(clientId));
      where += ` AND filters_json->>'clientId' = $${params.length}`;
    }
    if (projectId) {
      params.push(String(projectId));
      where += ` AND filters_json->>'projectId' = $${params.length}`;
    }
    if (from) {
      params.push(from);
      where += ` AND generated_at >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      where += ` AND generated_at <= $${params.length}`;
    }

    const query = `
      SELECT id, report_number, report_type, report_name, filters_json,
             file_name, file_size, status, generated_at, generated_by
      FROM generated_reports
      ${where}
      ORDER BY generated_at DESC
    `;
    const result = await db.query(query, params);
    return result.rows;
  }

  static async deleteById(id, userId) {
    const result = await db.query(
      `DELETE FROM generated_reports WHERE id = $1 AND generated_by = $2 RETURNING id`,
      [id, userId],
    );
    return result.rows[0] || null;
  }

  static async getForDownload(id, userId) {
    const result = await db.query(
      `SELECT report_number, file_name, file_data
       FROM generated_reports
       WHERE id = $1 AND generated_by = $2`,
      [id, userId],
    );
    return result.rows[0] || null;
  }
}

module.exports = ReportArchiveService;
