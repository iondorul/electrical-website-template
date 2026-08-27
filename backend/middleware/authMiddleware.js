const jwt = require("jsonwebtoken");
const { Errors } = require("../constants");

module.exports = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        code: Errors.SESSION_EXPIRED,
        error: Errors.SESSION_EXPIRED,
        message: "Access denied. No token provided.",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;

    next();
  } catch (err) {
    console.error(err);

    // TokenExpiredError (jwt.verify pe un token cu semnătură validă dar
    // expirat) e semantic o sesiune expirată; orice altă eroare de verify
    // (semnătură invalidă, token malformat) e un token invalid propriu-zis —
    // ambele forțează logout pe frontend (vezi SESSION_EXPIRED/TOKEN_INVALID
    // în api.js), distincția e doar pentru claritatea codului/logurilor.
    const code =
      err.name === "TokenExpiredError" ? Errors.SESSION_EXPIRED : Errors.TOKEN_INVALID;

    return res.status(401).json({
      code,
      error: code,
      message: "Invalid token.",
      detail: err.message,
    });
  }
};
