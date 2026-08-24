const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const stripeController = require("../controllers/stripeController");

router.post(
  "/create-checkout-session",
  authMiddleware,
  stripeController.createCheckoutSession,
);

router.get(
  "/invoice/:sessionId",
  authMiddleware,
  stripeController.getInvoiceForSession,
);

router.get(
  "/subscription-status",
  authMiddleware,
  stripeController.getSubscriptionStatus,
);

router.post(
  "/schedule-downgrade",
  authMiddleware,
  stripeController.scheduleDowngrade,
);

router.post(
  "/switch-to-yearly",
  authMiddleware,
  stripeController.switchToYearly,
);

router.post(
  "/switch-to-monthly",
  authMiddleware,
  stripeController.switchToMonthly,
);

router.post(
  "/renew-now",
  authMiddleware,
  stripeController.renewNow,
);

// Stripe apelează direct acest endpoint — verificarea se face prin semnătura
// webhook-ului (STRIPE_WEBHOOK_SECRET), nu prin JWT, deci fără authMiddleware.
router.post("/webhook", stripeController.handleWebhook);

module.exports = router;
