const express = require("express");
const router = express.Router();
const CompanySettingsController = require("../controllers/companySettingsController");
const authenticateToken = require("../middleware/authMiddleware");

router.use(authenticateToken);

router.get("/", CompanySettingsController.get);
router.put("/", CompanySettingsController.update);

module.exports = router;
