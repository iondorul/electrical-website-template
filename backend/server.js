const express = require("express");
require("dotenv").config();

const pool = require("./config/db");

const authRoutes = require("./routes/authRoutes");

console.log("SERVER LOADED");

const app = express();

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

app.listen(process.env.PORT, () => {
  console.log(`🚀 Server running on http://localhost:${process.env.PORT}`);
});
