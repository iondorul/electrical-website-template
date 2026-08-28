const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./config/db");
const checkPlanLimit = require("./middleware/planLimitMiddleware");
const authRoutes = require("./routes/authRoutes");
const clientRoutes = require("./routes/clientRoutes");
const estimateRoutes = require("./routes/estimateRoutes");
const quoteRoutes = require("./routes/quoteRoutes");
const invoiceRoutes = require("./routes/invoiceRoute");
const materialRoutes = require("./routes/materialRoutes");
const companySettingsRoutes = require("./routes/companySettingsRoutes");
const reportsRoutes = require("./routes/reportsRoutes");
const stripeRoutes = require("./routes/stripeRoutes");

console.log("SERVER LOADED");

const app = express();

// Origini de dezvoltare locală — permise DOAR când NODE_ENV !== "production"
// (implicit development dacă NODE_ENV nu e deloc setat). În producție,
// singura origine permisă rămâne cea derivată din FRONTEND_URL, mai jos.
const isProduction = process.env.NODE_ENV === "production";
const LOCAL_DEV_ORIGINS = isProduction ? [] : ["http://localhost:5500", "http://127.0.0.1:5500"];

// FRONTEND_URL poate include un path (ex. "http://127.0.0.1:5500/frontend",
// vezi .env local) — new URL(...).origin extrage doar schema+host+port,
// exact ce trimite browserul în header-ul Origin (fără path).
let configuredFrontendOrigin = null;
if (process.env.FRONTEND_URL) {
  try {
    configuredFrontendOrigin = new URL(process.env.FRONTEND_URL).origin;
  } catch (err) {
    console.error("FRONTEND_URL invalid, ignorat la configurarea CORS:", process.env.FRONTEND_URL);
  }
}

const allowedOrigins = new Set(
  [...LOCAL_DEV_ORIGINS, configuredFrontendOrigin].filter(Boolean),
);

// Autentificarea aplicației e 100% prin header Authorization: Bearer <jwt>
// (vezi middleware/authMiddleware.js — citește doar req.headers.authorization,
// niciun cookie de sesiune nicăieri în backend/frontend), deci NU setăm
// credentials: true — nu e nevoie, iar activarea lui ar necesita inutil un
// singur allowedOrigin per request (nu se poate combina cu reflectarea
// implicită a lui "*"), fără niciun beneficiu real aici.
app.use(
  cors({
    origin(origin, callback) {
      // Cereri fără header Origin (curl, Postman, apeluri server-to-server,
      // webhook-uri) — CORS e impus doar de browsere, deci acestea oricum nu
      // sunt restricționate real de verificarea de mai jos; le lăsăm să treacă.
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      // callback(null, false) — NU new Error(...): pachetul `cors` propagă un
      // Error primit aici direct la Express prin next(err), care (fără niciun
      // error handler custom în server.js, și fără NODE_ENV=production setat
      // nicăieri în acest proiect) răspunde cu un 500 + stack trace COMPLET
      // (căi absolute de fișiere) în body — verificat live, reprodus cu curl.
      // callback(null, false) lasă requestul să treacă mai departe fără
      // niciun header CORS (browserul îl blochează oricum, neavând
      // Access-Control-Allow-Origin), fără 500, fără scurgere de informații.
      return callback(null, false);
    },
  }),
);

// Stripe cere raw body (neparsat) pe /api/stripe/webhook, ca să poată verifica
// semnătura evenimentului — montat DOAR pe această rută, înaintea lui
// express.json() global, ca să nu afecteze restul aplicației.
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));

app.use(express.json());

app.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    res.json({
      message: "ElectricalVPF Backend Online 🚀",
      database: "Connected",
      serverTime: result.rows[0].now,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/clients", checkPlanLimit("clients"), clientRoutes);
app.use("/api/projects", require("./routes/projectRoutes"));
app.use("/api/estimates", estimateRoutes);
app.use("/api/quotes", checkPlanLimit("quotes"), quoteRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/materials", materialRoutes);
app.use("/api/company-settings", companySettingsRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/stripe", stripeRoutes);

app.listen(process.env.PORT, () => {
  console.log(`🚀 Server running on http://localhost:${process.env.PORT}`);
});
