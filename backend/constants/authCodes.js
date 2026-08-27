// Coduri de mesaj pentru rutele de autentificare publice (register, login,
// forgot-password, reset-password) — separate de `Errors` (taxonomia de erori
// HTTP generică, cross-modul) pentru că aici includem și coduri de SUCCES,
// nu doar erori: frontend-ul (login.js/register.js/forgot-password.js/
// reset-password.js) mapează fiecare cod la propria cheie de traducere din
// namespace-ul `auth.*` (frontend/locales/*.json), în loc să afișeze direct
// un text hardcodat venit din backend (mereu RO/EN, indiferent de limba
// selectată în frontend). Câmpul `code` e prezent pe ORICE răspuns al acestor
// 4 rute (succes sau eroare) — `error`/`message` rămân doar pentru
// compatibilitate cu convenția existentă `{success, error, message}` și
// pentru loguri/debugging, NU pentru afișare directă către utilizator.
module.exports = {
  // Erori de validare (400)
  FULL_NAME_REQUIRED: "FULL_NAME_REQUIRED",
  COMPANY_NAME_REQUIRED: "COMPANY_NAME_REQUIRED",
  INVALID_EMAIL: "INVALID_EMAIL",
  PASSWORD_TOO_SHORT: "PASSWORD_TOO_SHORT",
  EMAIL_REQUIRED: "EMAIL_REQUIRED",
  RESET_TOKEN_AND_PASSWORD_REQUIRED: "RESET_TOKEN_AND_PASSWORD_REQUIRED",

  // Erori de business logic
  EMAIL_ALREADY_EXISTS: "EMAIL_ALREADY_EXISTS",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  RESET_TOKEN_INVALID: "RESET_TOKEN_INVALID",
  RESET_TOKEN_EXPIRED: "RESET_TOKEN_EXPIRED",

  // Succes
  ACCOUNT_CREATED: "ACCOUNT_CREATED",
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  PASSWORD_RESET_EMAIL_SENT: "PASSWORD_RESET_EMAIL_SENT",
  PASSWORD_RESET_SUCCESS: "PASSWORD_RESET_SUCCESS",

  // Eroare neașteptată (500) — identică cu Errors.SERVER_ERROR, duplicată aici
  // ca literal ca acest fișier să rămână independent/autonom (fără import
  // încrucișat), la fel ca restul fișierelor din backend/constants/.
  SERVER_ERROR: "SERVER_ERROR",
};
