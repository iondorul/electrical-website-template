const express = require("express");
const router = express.Router();
const InvoiceController = require("../controllers/invoiceController");
const authMiddleware = require("../middleware/authMiddleware");

// Protejăm toate rutele de facturare cu middleware-ul de autentificare
router.use(authMiddleware);

// Endpoint-uri RESTful API pentru Invoices
router.post("/from-quote", InvoiceController.createFromQuote);
router.get("/", InvoiceController.getAll);
router.get("/:id", InvoiceController.getById);

module.exports = router;
