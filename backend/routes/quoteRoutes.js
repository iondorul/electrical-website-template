const express = require("express");
const router = express.Router();
const QuoteController = require("../controllers/quoteController");
const authMiddleware = require("../middleware/authMiddleware");

router.use(authMiddleware);

// Standard RESTful API Routes
router.post("/", QuoteController.create);
router.get("/", QuoteController.getAll);

// ATENȚIE: Ruta specifică de ștergere totală trebuie pusă ÎNAINTE de rutele cu parametru dinamic (/:id)
router.delete("/delete-all", QuoteController.deleteAll);

router.get("/:id", QuoteController.getById);
router.put("/:id/status", QuoteController.updateStatus);
router.delete("/:id", QuoteController.softDelete);

module.exports = router;
