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
