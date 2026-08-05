const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const clientRoutes = require("./routes/clientRoutes");

console.log("SERVER LOADED");

const app = express();
app.use(cors());
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
app.use("/api/clients", clientRoutes);
app.use("/api/projects", require("./routes/projectRoutes"));

app.listen(process.env.PORT, () => {
  console.log(`🚀 Server running on http://localhost:${process.env.PORT}`);
});
