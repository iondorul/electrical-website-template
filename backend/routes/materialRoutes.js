const express = require("express");
const router = express.Router();
const MaterialController = require("../controllers/materialController");
const authenticateToken = require("../middleware/authMiddleware");

router.use(authenticateToken);

router.get("/", MaterialController.getAll);
router.get("/:id", MaterialController.getById);
router.post("/", MaterialController.create);
router.put("/:id", MaterialController.update);
router.delete("/all", MaterialController.deleteAll);
router.delete("/:id", MaterialController.delete);

module.exports = router;
