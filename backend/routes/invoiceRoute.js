const express = require("express");
const router = express.Router();
const InvoiceController = require("../controllers/invoiceController");
const PaymentController = require("../controllers/paymentController");
const authenticateToken = require("../middleware/authMiddleware"); // sau calea corectă către middleware-ul tău de auth

// Toate rutele de facturi sunt protejate de autentificare
router.use(authenticateToken);

// Generare factură dintr-o ofertă aprobată
router.post("/from-quote", InvoiceController.createFromQuote);

// Listare facturi (cu paginare, search, status)
router.get("/", InvoiceController.getAll);

// Preluare detalii factură după ID
router.get("/:id", InvoiceController.getById);

// Actualizare factură (status, date, discount, TVA)
router.put("/:id", InvoiceController.update);

// Descărcare/preview PDF factură
router.get("/:id/pdf", InvoiceController.downloadPdf);

// Trimitere factură (PDF) pe email către client
router.post("/:id/send", InvoiceController.sendEmail);

// Înregistrare / listare plăți pentru o factură
router.post("/:id/payments", PaymentController.recordPayment);
router.get("/:id/payments", PaymentController.listPayments);

router.delete("/", InvoiceController.deleteAll);

module.exports = router;
