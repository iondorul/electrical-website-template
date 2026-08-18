const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const stripeController = require("../controllers/stripeController");

router.post(
  "/create-checkout-session",
  authMiddleware,
  stripeController.createCheckoutSession,
);

// Stripe apelează direct acest endpoint — verificarea se face prin semnătura
// webhook-ului (STRIPE_WEBHOOK_SECRET), nu prin JWT, deci fără authMiddleware.
router.post("/webhook", stripeController.handleWebhook);

module.exports = router;
