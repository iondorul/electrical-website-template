const pool = require("../config/db");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// Creează o sesiune Stripe Checkout (mode: subscription) pentru planul Pro
// și returnează URL-ul către care frontend-ul trebuie să redirecționeze userul.
exports.createCheckoutSession = async (req, res) => {
  try {
    const userId = req.user.id;
    const frontendUrl =
      process.env.FRONTEND_URL || "http://127.0.0.1:5500/frontend";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID_PRO,
          quantity: 1,
        },
      ],
      client_reference_id: String(userId),
      metadata: {
        userId: String(userId),
      },
      success_url: `${frontendUrl}/erp-upgrade.html?success=true`,
      cancel_url: `${frontendUrl}/erp-upgrade.html?canceled=true`,
    });

    res.json({ success: true, url: session.url });
  } catch (err) {
    console.error("Eroare la crearea sesiunii Stripe Checkout:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Nu s-a putut crea sesiunea de plată.",
    });
  }
};

// Webhook Stripe — verifică semnătura cu STRIPE_WEBHOOK_SECRET (raw body,
// vezi middleware-ul express.raw montat în server.js DOAR pe această rută).
// La checkout.session.completed, trece userul pe plan='pro'.
exports.handleWebhook = async (req, res) => {
  const signature = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error("Semnătură webhook Stripe invalidă:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId =
        session.client_reference_id ||
        (session.metadata && session.metadata.userId);

      if (userId) {
        await pool.query("UPDATE users SET plan = 'pro' WHERE id = $1", [
          userId,
        ]);
      } else {
        console.error(
          "checkout.session.completed fără userId (client_reference_id/metadata) — nu s-a putut face upgrade.",
        );
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error("Eroare la procesarea webhook-ului Stripe:", err);
    res.status(500).json({ error: err.message });
  }
};
