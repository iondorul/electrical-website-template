const db = require("../config/db");

class CompanySettingsService {
  static async getByUserId(userId) {
    const result = await db.query(
      `SELECT * FROM company_settings WHERE user_id = $1`,
      [userId],
    );
    return result.rows[0] || null;
  }

  static async upsert(
    userId,
    {
      company_name,
      address,
      city,
      country,
      postal_code,
      vat_number,
      registration_number,
      iban,
      bank_name,
      phone,
      email,
    },
  ) {
    const result = await db.query(
      `INSERT INTO company_settings (
         user_id, company_name, address, city, country, postal_code,
         vat_number, registration_number, iban, bank_name, phone, email
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (user_id) DO UPDATE SET
         company_name = EXCLUDED.company_name,
         address = EXCLUDED.address,
         city = EXCLUDED.city,
         country = EXCLUDED.country,
         postal_code = EXCLUDED.postal_code,
         vat_number = EXCLUDED.vat_number,
         registration_number = EXCLUDED.registration_number,
         iban = EXCLUDED.iban,
         bank_name = EXCLUDED.bank_name,
         phone = EXCLUDED.phone,
         email = EXCLUDED.email,
         updated_at = now()
       RETURNING *`,
      [
        userId,
        company_name,
        address || null,
        city || null,
        country || null,
        postal_code || null,
        vat_number || null,
        registration_number || null,
        iban || null,
        bank_name || null,
        phone || null,
        email || null,
      ],
    );
    return result.rows[0];
  }
}

module.exports = CompanySettingsService;
