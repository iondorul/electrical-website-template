const express = require("express");
const router = express.Router();
const QuoteController = require("../controllers/quoteController");
const authMiddleware = require("../middleware/auth");

router.use(authMiddleware);

// Standard RESTful API Routes
router.post("/", QuoteController.create);
router.get("/", QuoteController.getAll);
router.get("/:id", QuoteController.getById);
router.patch("/:id/status", QuoteController.updateStatus);
router.delete("/:id", QuoteController.softDelete);

module.exports = router;
