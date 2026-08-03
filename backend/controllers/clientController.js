const pool = require("../config/db");

exports.createClient = async (req, res) => {
  try {
    const { company_name, contact_person, email, phone, address } = req.body;

    const user_id = req.user.id;

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

    res.status(500).json({
      error: err.message,
    });
  }
};

exports.getClients = async (req, res) => {
  try {
    const user_id = req.user.id;

    const result = await pool.query(
      `SELECT *
       FROM clients
       WHERE user_id = $1
       ORDER BY id`,
      [user_id],
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message,
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
        message: "Client not found.",
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message,
    });
  }
};
