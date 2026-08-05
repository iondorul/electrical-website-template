const pool = require("../config/db");

// Generare automată cod proiect (PRJ-2026-000001)
const generateProjectNumber = async (userId) => {
  const year = new Date().getFullYear();
  const countQuery = `
        SELECT COUNT(*) FROM public.projects 
        WHERE user_id = $1 AND EXTRACT(YEAR FROM created_at) = $2
    `;
  const result = await pool.query(countQuery, [userId, year]);
  const count = parseInt(result.rows[0].count) + 1;
  return `PRJ-${year}-${count.toString().padStart(6, "0")}`;
};

exports.getAllProjects = async (userId, { search, page, limit }) => {
  if (!search && !page && !limit) {
    const query = `
            SELECT p.*, c.company_name, c.contact_person 
            FROM public.projects p
            JOIN public.clients c ON p.client_id = c.id
            WHERE p.user_id = $1 AND p.is_active = TRUE 
            ORDER BY p.id DESC`;
    const result = await pool.query(query, [userId]);
    return result.rows;
  }

  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 10;
  const offset = (pageNum - 1) * limitNum;
  const searchPattern = `%${search || ""}%`;

  const dataQuery = `
        SELECT p.*, c.company_name, c.contact_person 
        FROM public.projects p
        JOIN public.clients c ON p.client_id = c.id
        WHERE p.user_id = $1 AND p.is_active = TRUE
          AND (
            p.project_number ILIKE $2 OR 
            p.project_name ILIKE $2 OR 
            c.company_name ILIKE $2 OR 
            c.contact_person ILIKE $2
          )
        ORDER BY p.id DESC
        LIMIT $3 OFFSET $4`;

  const countQuery = `
        SELECT COUNT(*) 
        FROM public.projects p
        JOIN public.clients c ON p.client_id = c.id
        WHERE p.user_id = $1 AND p.is_active = TRUE
          AND (
            p.project_number ILIKE $2 OR 
            p.project_name ILIKE $2 OR 
            c.company_name ILIKE $2 OR 
            c.contact_person ILIKE $2
          )`;

  const [dataResult, countResult] = await Promise.all([
    pool.query(dataQuery, [userId, searchPattern, limitNum, offset]),
    pool.query(countQuery, [userId, searchPattern]),
  ]);

  return {
    data: dataResult.rows,
    total: parseInt(countResult.rows[0].count),
  };
};

exports.getProjectById = async (userId, id) => {
  const query = `
        SELECT p.*, c.company_name, c.contact_person 
        FROM public.projects p
        JOIN public.clients c ON p.client_id = c.id
        WHERE p.id = $1 AND p.user_id = $2 AND p.is_active = TRUE`;
  const result = await pool.query(query, [id, userId]);
  return result.rows[0] || null;
};

exports.createProject = async (userId, data) => {
  const projectNumber = await generateProjectNumber(userId);

  const query = `
        INSERT INTO public.projects (
            user_id, client_id, project_number, project_name, description, notes,
            status, priority, estimated_value, actual_value, currency,
            start_date, end_date, completion_date, address, city, country, postal_code,
            created_by, updated_by
        ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11,
            $12, $13, $14, $15, $16, $17, $18,
            $1, $1
        ) RETURNING *`;

  const values = [
    userId,
    data.client_id,
    projectNumber,
    data.project_name,
    data.description || null,
    data.notes || null,
    data.status || "draft",
    data.priority || "medium",
    data.estimated_value || 0,
    data.actual_value || 0,
    data.currency || "EUR",
    data.start_date || null,
    data.end_date || null,
    data.completion_date || null,
    data.address || null,
    data.city || null,
    data.country || null,
    data.postal_code || null,
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
};

exports.updateProject = async (userId, id, data) => {
  const query = `
        UPDATE public.projects SET
            client_id = $1, project_name = $2, description = $3, notes = $4,
            status = $5, priority = $6, estimated_value = $7, actual_value = $8, currency = $9,
            start_date = $10, end_date = $11, completion_date = $12, address = $13, city = $14, country = $15, postal_code = $16,
            updated_by = $17
        WHERE id = $18 AND user_id = $19 AND is_active = TRUE
        RETURNING *`;

  const values = [
    data.client_id,
    data.project_name,
    data.description || null,
    data.notes || null,
    data.status,
    data.priority,
    data.estimated_value,
    data.actual_value,
    data.currency,
    data.start_date || null,
    data.end_date || null,
    data.completion_date || null,
    data.address || null,
    data.city || null,
    data.country || null,
    data.postal_code || null,
    userId,
    id,
    userId,
  ];

  const result = await pool.query(query, values);
  return result.rows[0] || null;
};

exports.softDeleteProject = async (userId, id) => {
  const query = `
        UPDATE public.projects 
        SET is_active = FALSE, updated_by = $1 
        WHERE id = $2 AND user_id = $3 
        RETURNING id`;
  const result = await pool.query(query, [userId, id, userId]);
  return result.rows[0] || null;
};
