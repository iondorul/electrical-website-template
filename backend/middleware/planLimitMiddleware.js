/**
 * Enforcement pentru limitele planului Free (Clients / Quotes).
 *
 * Montat DOAR în server.js, înaintea routerelor clientRoutes/quoteRoutes —
 * NU modifică niciun fișier din modulele FROZEN (clientController/Service/Routes,
 * quoteController/Service/Routes).
 *
 * clientRoutes.js și quoteRoutes.js își fac propria autentificare (authMiddleware)
 * ÎN INTERIORUL routerului, nu la nivelul server.js — deci acest middleware nu se
 * poate baza pe un req.user deja populat. De aceea își verifică singur tokenul
 * (aceeași logică JWT ca authMiddleware.js) doar ca să afle userId pentru
 * verificarea planului; dacă tokenul lipsește/e invalid, lasă mai departe (next())
 * fără să blocheze — respingerea 401 pentru autentificare rămâne, ca înainte,
 * responsabilitatea authMiddleware-ului din routerul frozen.
 */
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

const LIMITS = {
  clients: {
    max: 2,
    message:
      "Ai atins limita planului Free (2 clienți). Fă upgrade la Pro pentru acces nelimitat.",
  },
  quotes: {
    max: 2,
    message:
      "Ai atins limita planului Free (2 oferte pe lună). Fă upgrade la Pro pentru acces nelimitat.",
  },
};

function getUserIdFromToken(req) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;

    const token = authHeader.split(" ")[1];
    if (!token) return null;

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.id || null;
  } catch (err) {
    return null;
  }
}

async function countClients(userId) {
  const result = await pool.query(
    "SELECT COUNT(*) AS cnt FROM clients WHERE user_id = $1",
    [userId],
  );
  return parseInt(result.rows[0].cnt, 10);
}

async function countQuotesThisMonth(userId) {
  const result = await pool.query(
    `SELECT COUNT(*) AS cnt FROM quotes
     WHERE created_by = $1 AND created_at >= date_trunc('month', CURRENT_DATE)`,
    [userId],
  );
  return parseInt(result.rows[0].cnt, 10);
}

function checkPlanLimit(resourceType) {
  const limitConfig = LIMITS[resourceType];

  return async (req, res, next) => {
    if (req.method !== "POST") return next();
    if (!limitConfig) return next();

    const userId = getUserIdFromToken(req);
    if (!userId) return next(); // token lipsă/invalid — gestionat de authMiddleware-ul frozen din router

    try {
      const userResult = await pool.query(
        "SELECT plan FROM users WHERE id = $1",
        [userId],
      );
      const plan = userResult.rows[0] && userResult.rows[0].plan;

      if (plan !== "free") return next(); // Pro = nelimitat

      const count =
        resourceType === "clients"
          ? await countClients(userId)
          : await countQuotesThisMonth(userId);

      if (count >= limitConfig.max) {
        return res.status(403).json({
          success: false,
          error: limitConfig.message,
        });
      }

      return next();
    } catch (err) {
      console.error(
        `Eroare la verificarea limitei de plan (${resourceType}):`,
        err,
      );
      return next(); // nu blocăm requestul dacă verificarea eșuează neașteptat
    }
  };
}

module.exports = checkPlanLimit;
