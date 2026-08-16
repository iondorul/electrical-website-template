const express = require("express");
const router = express.Router();
const ReportsController = require("../controllers/reportsController");
const authenticateToken = require("../middleware/authMiddleware");

// Nu modifică nicio structură/date existente din celelalte module (Invoices,
// Projects, Materials, Clients rămân neatinse) — scrie doar în tabela proprie
// generated_reports (arhiva de PDF-uri).
router.use(authenticateToken);

router.get("/financial", ReportsController.financial);
router.get("/projects", ReportsController.projects);
router.get("/materials", ReportsController.materials);
router.get("/clients", ReportsController.clients);

router.post("/generate-pdf", ReportsController.generatePdf);
router.get("/history", ReportsController.history);
router.get("/history/:id/download", ReportsController.downloadHistoryItem);
router.delete("/history/:id", ReportsController.deleteHistoryItem);

module.exports = router;
