const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const clientController = require("../controllers/clientController");

// Creează un client nou
router.post("/", authMiddleware, clientController.createClient);

// Test (îl păstrăm momentan)
router.get("/", authMiddleware, (req, res) => {
  res.json({
    message: "Clients route is protected.",
    user: req.user,
  });
});

module.exports = router;
