const pool = require("../config/db");
const { Errors } = require("../constants");

exports.createClient = async (req, res) => {
  try {
    const { company_name, contact_person, email, phone, address } = req.body;
    const user_id = req.user.id;

    // Check prealabil pentru email duplicat
    const existingClient = await pool.query(
      `SELECT id FROM clients WHERE user_id = $1 AND email = $2`,
      [user_id, email],
    );

    if (existingClient.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: Errors.CLIENT_EMAIL_ALREADY_EXISTS,
        message: "This email address is already used by another client.",
      });
    }

    const result = await pool.query(
      `INSERT INTO clients
      (user_id, company_name, contact_person, email, phone, address)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *`,
      [user_id, company_name, contact_person, email, phone, address],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    // Prindem și eroarea de constrângere UNIQUE din PostgreSQL (cod 23505)
    if (err.code === "23505") {
      return res.status(400).json({
        success: false,
        error: Errors.CLIENT_EMAIL_ALREADY_EXISTS,
        message: "This email address is already registered.",
      });
    }
    res.status(500).json({
      success: false,
      error: Errors.SERVER_ERROR,
      message: err.message || "An error occurred while saving the client.",
    });
  }
};

exports.updateClient = async (req, res) => {
  try {
    const { id } = req.params;
    const { company_name, contact_person, email, phone, address } = req.body;
    const user_id = req.user.id;

    // Check dacă email-ul aparține ALTUI client
    const existingClient = await pool.query(
      `SELECT id FROM clients WHERE user_id = $1 AND email = $2 AND id != $3`,
      [user_id, email, id],
    );

    if (existingClient.rows.length > 0) {
      return res.status(400).json({
        message:
          "Această adresă de email este deja utilizată de un alt client. Vă rugăm să introduceți o altă adresă de email.",
      });
    }

    const result = await pool.query(
      `UPDATE clients
       SET
         company_name = $1,
         contact_person = $2,
         email = $3,
         phone = $4,
         address = $5
       WHERE id = $6
       AND user_id = $7
       RETURNING *`,
      [company_name, contact_person, email, phone, address, id, user_id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Clientul nu a fost găsit.",
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === "23505") {
      return res.status(400).json({
        message:
          "Această adresă de email este deja înregistrată. Vă rugăm să folosiți un email unic.",
      });
    }
    res.status(500).json({
      message: err.message || "A apărut o eroare la actualizarea clientului.",
    });
  }
};

exports.getClients = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { search, page, limit } = req.query;

    // Daca nu avem parametri de cautare/paginare, returnam tot ca pana acum
    if (!search && !page && !limit) {
      const result = await pool.query(
        `SELECT * FROM clients WHERE user_id = $1 AND is_active = true ORDER BY id DESC`,
        [user_id],
      );
      return res.json(result.rows);
    }

    // Paginare & Cautare SQL
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const offset = (pageNum - 1) * limitNum;
    const searchPattern = `%${search || ""}%`;

    const dataQuery = `
      SELECT * FROM clients
      WHERE user_id = $1
        AND is_active = true
        AND (
          company_name ILIKE $2
          OR contact_person ILIKE $2
          OR email ILIKE $2
          OR phone ILIKE $2
          OR address ILIKE $2
        )
      ORDER BY id DESC
      LIMIT $3 OFFSET $4`;

    const countQuery = `
      SELECT COUNT(*) FROM clients
      WHERE user_id = $1
        AND is_active = true
        AND (
          company_name ILIKE $2
          OR contact_person ILIKE $2
          OR email ILIKE $2
          OR phone ILIKE $2
          OR address ILIKE $2
        )`;

    const [dataResult, countResult] = await Promise.all([
      pool.query(dataQuery, [user_id, searchPattern, limitNum, offset]),
      pool.query(countQuery, [user_id, searchPattern]),
    ]);

    res.json({
      data: dataResult.rows,
      total: parseInt(countResult.rows[0].count),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: Errors.SERVER_ERROR,
      message: err.message,
    });
  }
};

exports.updateClient = async (req, res) => {
  try {
    const { id } = req.params;

    const { company_name, contact_person, email, phone, address } = req.body;

    const user_id = req.user.id;

    const result = await pool.query(
      `UPDATE clients
       SET
         company_name = $1,
         contact_person = $2,
         email = $3,
         phone = $4,
         address = $5
       WHERE id = $6
       AND user_id = $7
       RETURNING *`,
      [company_name, contact_person, email, phone, address, id, user_id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: Errors.CLIENT_NOT_FOUND,
        message: "Client not found.",
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: Errors.SERVER_ERROR,
      message: err.message,
    });
  }
};

exports.deleteClient = async (req, res) => {
  try {
    const { id } = req.params;

    const user_id = req.user.id;

    const result = await pool.query(
      `UPDATE clients
       SET is_active = false
       WHERE id = $1
       AND user_id = $2
       AND is_active = true
       RETURNING *`,
      [id, user_id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: Errors.CLIENT_NOT_FOUND,
        message: "Client not found.",
      });
    }

    res.json({
      success: true,
      message: "Client deleted successfully.",
      client: result.rows[0],
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: Errors.SERVER_ERROR,
      message: err.message,
    });
  }
};
