const express = require("express");
const router = express.Router();
const EstimateController = require("../controllers/estimateController");
const authMiddleware = require("../middleware/authMiddleware");

router.use(authMiddleware);

router.get("/", EstimateController.getAll);
router.get("/:id", EstimateController.getById);
router.post("/", EstimateController.create);
router.put("/:id", EstimateController.update);
router.delete("/:id", EstimateController.delete);

module.exports = router;
