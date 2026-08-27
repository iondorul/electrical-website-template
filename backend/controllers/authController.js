const pool = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { sendPasswordResetEmail } = require("../services/emailService");
const { AuthCodes } = require("../constants");

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 oră
// Mesaj generic de securitate (nu dezvăluim dacă emailul există sau nu în
// sistem) — text în engleză doar pentru loguri/debugging server-side, câmpul
// `message` nu mai e afișat direct de frontend (vezi `code`, AuthCodes.PASSWORD_RESET_EMAIL_SENT,
// tradus prin auth.forgotPassword.genericSuccessMessage în toate cele 9 limbi).
const GENERIC_RESET_MESSAGE =
  "If the address exists in our system, you'll receive an email with reset instructions.";

function hashResetToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

exports.register = async (req, res) => {
  try {
    const { full_name, company_name, email, password } = req.body;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!full_name || !full_name.trim()) {
      return res.status(400).json({
        success: false,
        code: AuthCodes.FULL_NAME_REQUIRED,
        error: AuthCodes.FULL_NAME_REQUIRED,
        message: "Full name is required.",
      });
    }
    if (!company_name || !company_name.trim()) {
      return res.status(400).json({
        success: false,
        code: AuthCodes.COMPANY_NAME_REQUIRED,
        error: AuthCodes.COMPANY_NAME_REQUIRED,
        message: "Company/sole trader name is required.",
      });
    }
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        code: AuthCodes.INVALID_EMAIL,
        error: AuthCodes.INVALID_EMAIL,
        message: "Invalid email address.",
      });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({
        success: false,
        code: AuthCodes.PASSWORD_TOO_SHORT,
        error: AuthCodes.PASSWORD_TOO_SHORT,
        message: "Password must be at least 8 characters.",
      });
    }

    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email=$1",
      [email],
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        code: AuthCodes.EMAIL_ALREADY_EXISTS,
        error: AuthCodes.EMAIL_ALREADY_EXISTS,
        message: "An account with this email already exists.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const insertResult = await pool.query(
      `INSERT INTO users (full_name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, full_name, email`,
      [full_name.trim(), email, passwordHash],
    );

    const newUser = insertResult.rows[0];

    // Pre-populează Date Firmă (Settings) cu numele firmei/PFA introdus la înregistrare.
    await pool.query(
      `INSERT INTO company_settings (user_id, company_name)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET company_name = EXCLUDED.company_name`,
      [newUser.id, company_name.trim()],
    );

    res.status(201).json({
      success: true,
      code: AuthCodes.ACCOUNT_CREATED,
      message: "Account created successfully.",
      data: newUser,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
      code: AuthCodes.SERVER_ERROR,
      error: AuthCodes.SERVER_ERROR,
      message: err.message,
    });
  }
};

exports.getMe = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, full_name, email, phone, role, plan, avatar_id FROM users WHERE id = $1",
      [req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        code: AuthCodes.USER_NOT_FOUND,
        error: AuthCodes.USER_NOT_FOUND,
        message: "User not found.",
      });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      code: AuthCodes.SERVER_ERROR,
      error: AuthCodes.SERVER_ERROR,
      message: err.message,
    });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { full_name, phone } = req.body;

    if (!full_name || !full_name.trim()) {
      return res.status(400).json({
        success: false,
        code: AuthCodes.PROFILE_NAME_REQUIRED,
        error: AuthCodes.PROFILE_NAME_REQUIRED,
        message: "Full name is required.",
      });
    }

    const result = await pool.query(
      `UPDATE users SET full_name = $1, phone = $2 WHERE id = $3
       RETURNING id, full_name, email, phone`,
      [full_name.trim(), phone ? phone.trim() : null, req.user.id],
    );

    res.json({
      success: true,
      code: AuthCodes.PROFILE_UPDATED,
      message: "Profile updated successfully.",
      data: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      code: AuthCodes.SERVER_ERROR,
      error: AuthCodes.SERVER_ERROR,
      message: err.message,
    });
  }
};

// Galerie fixă de avatare tematice (electricieni, vezi AVATAR_CATALOG în
// frontend/js/shell.js) — validare server-side pe o listă fixă, userul nu
// poate seta o valoare arbitrară (nu e upload de fișiere).
const VALID_AVATAR_IDS = [
  "e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8", "e9", "e10",
];

exports.updateAvatar = async (req, res) => {
  try {
    const { avatar_id } = req.body;

    if (!avatar_id || !VALID_AVATAR_IDS.includes(avatar_id)) {
      return res.status(400).json({
        success: false,
        code: AuthCodes.INVALID_AVATAR,
        error: AuthCodes.INVALID_AVATAR,
        message: "Invalid avatar.",
      });
    }

    const result = await pool.query(
      "UPDATE users SET avatar_id = $1 WHERE id = $2 RETURNING id, avatar_id",
      [avatar_id, req.user.id],
    );

    res.json({
      success: true,
      code: AuthCodes.AVATAR_UPDATED,
      message: "Avatar updated successfully.",
      data: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      code: AuthCodes.SERVER_ERROR,
      error: AuthCodes.SERVER_ERROR,
      message: err.message,
    });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({
        success: false,
        code: AuthCodes.PASSWORD_FIELDS_REQUIRED,
        error: AuthCodes.PASSWORD_FIELDS_REQUIRED,
        message: "Current password and new password are required.",
      });
    }

    if (new_password.length < 6) {
      return res.status(400).json({
        success: false,
        code: AuthCodes.NEW_PASSWORD_TOO_SHORT,
        error: AuthCodes.NEW_PASSWORD_TOO_SHORT,
        message: "New password must be at least 6 characters.",
      });
    }

    const result = await pool.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        code: AuthCodes.USER_NOT_FOUND,
        error: AuthCodes.USER_NOT_FOUND,
        message: "User not found.",
      });
    }

    const matches = await bcrypt.compare(
      current_password,
      result.rows[0].password_hash,
    );

    if (!matches) {
      return res.status(401).json({
        success: false,
        code: AuthCodes.CURRENT_PASSWORD_INCORRECT,
        error: AuthCodes.CURRENT_PASSWORD_INCORRECT,
        message: "Current password is incorrect.",
      });
    }

    const newHash = await bcrypt.hash(new_password, 10);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      newHash,
      req.user.id,
    ]);

    res.json({
      success: true,
      code: AuthCodes.PASSWORD_CHANGED,
      message: "Password changed successfully.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      code: AuthCodes.SERVER_ERROR,
      error: AuthCodes.SERVER_ERROR,
      message: err.message,
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        code: AuthCodes.INVALID_CREDENTIALS,
        error: AuthCodes.INVALID_CREDENTIALS,
        message: "Invalid email or password.",
      });
    }

    const user = result.rows[0];

    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        code: AuthCodes.INVALID_CREDENTIALS,
        error: AuthCodes.INVALID_CREDENTIALS,
        message: "Invalid email or password.",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      },
    );

    res.json({
      success: true,
      code: AuthCodes.LOGIN_SUCCESS,
      message: "Login successful.",
      token,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      code: AuthCodes.SERVER_ERROR,
      error: AuthCodes.SERVER_ERROR,
      message: err.message,
    });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        code: AuthCodes.EMAIL_REQUIRED,
        error: AuthCodes.EMAIL_REQUIRED,
        message: "Email address is required.",
      });
    }

    const result = await pool.query(
      "SELECT id, full_name, email FROM users WHERE email = $1",
      [email],
    );

    // Din motive de securitate răspundem mereu cu același mesaj generic,
    // indiferent dacă emailul există sau nu în sistem.
    if (result.rows.length > 0) {
      const user = result.rows[0];
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashResetToken(rawToken);
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

      await pool.query(
        "UPDATE users SET reset_token_hash = $1, reset_token_expires_at = $2 WHERE id = $3",
        [tokenHash, expiresAt, user.id],
      );

      const frontendUrl =
        process.env.FRONTEND_URL || "http://127.0.0.1:5500/frontend";
      const resetLink = `${frontendUrl}/reset-password.html?token=${rawToken}`;

      try {
        await sendPasswordResetEmail({
          to: user.email,
          fullName: user.full_name,
          resetLink,
        });
      } catch (emailErr) {
        console.error("Eroare la trimiterea emailului de resetare:", emailErr);
        // Nu expunem eroarea SMTP către client — păstrăm mesajul generic.
      }
    }

    res.json({
      success: true,
      code: AuthCodes.PASSWORD_RESET_EMAIL_SENT,
      message: GENERIC_RESET_MESSAGE,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      code: AuthCodes.SERVER_ERROR,
      error: AuthCodes.SERVER_ERROR,
      message: err.message,
    });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, new_password } = req.body;

    if (!token || !new_password) {
      return res.status(400).json({
        success: false,
        code: AuthCodes.RESET_TOKEN_AND_PASSWORD_REQUIRED,
        error: AuthCodes.RESET_TOKEN_AND_PASSWORD_REQUIRED,
        message: "Token and new password are required.",
      });
    }

    if (new_password.length < 8) {
      return res.status(400).json({
        success: false,
        code: AuthCodes.PASSWORD_TOO_SHORT,
        error: AuthCodes.PASSWORD_TOO_SHORT,
        message: "Password must be at least 8 characters.",
      });
    }

    const tokenHash = hashResetToken(token);

    // Interogare în 2 pași (hash întâi, expirare verificată separat) — ca să
    // putem distinge INVALID (hash-ul nu există deloc) de EXPIRED (hash
    // valid, dar expirat), cerință explicită pentru mesaje traduse distincte
    // pe frontend. Comportamentul pentru un token valid rămâne identic cu
    // interogarea combinată de dinainte.
    const result = await pool.query(
      `SELECT id, reset_token_expires_at FROM users WHERE reset_token_hash = $1`,
      [tokenHash],
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        code: AuthCodes.RESET_TOKEN_INVALID,
        error: AuthCodes.RESET_TOKEN_INVALID,
        message: "The reset link is invalid.",
      });
    }

    const { id: userId, reset_token_expires_at: expiresAt } = result.rows[0];

    if (!expiresAt || new Date(expiresAt) <= new Date()) {
      return res.status(400).json({
        success: false,
        code: AuthCodes.RESET_TOKEN_EXPIRED,
        error: AuthCodes.RESET_TOKEN_EXPIRED,
        message: "The reset link has expired.",
      });
    }

    const passwordHash = await bcrypt.hash(new_password, 10);

    await pool.query(
      `UPDATE users
       SET password_hash = $1, reset_token_hash = NULL, reset_token_expires_at = NULL
       WHERE id = $2`,
      [passwordHash, userId],
    );

    res.json({
      success: true,
      code: AuthCodes.PASSWORD_RESET_SUCCESS,
      message: "Password reset successfully.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      code: AuthCodes.SERVER_ERROR,
      error: AuthCodes.SERVER_ERROR,
      message: err.message,
    });
  }
};
