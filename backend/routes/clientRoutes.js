const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

router.get("/", authMiddleware, (req, res) => {
  res.json({
    message: "Clients route is protected.",
    user: req.user,
  });
});

module.exports = router;
