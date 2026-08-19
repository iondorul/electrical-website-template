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
      success_url: `${frontendUrl}/payment-success.html?session_id={CHECKOUT_SESSION_ID}`,
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

// Returnează URL-ul facturii Stripe (hosted_invoice_url) pentru o sesiune de
// checkout finalizată. Verifică explicit ownership-ul sesiunii (client_reference_id/
// metadata.userId trebuie să corespundă userului autentificat), ca un user să nu
// poată vedea factura altcuiva ghicind un sessionId.
exports.getInvoiceForSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["invoice"],
    });

    const sessionUserId =
      session.client_reference_id ||
      (session.metadata && session.metadata.userId);

    if (!sessionUserId || String(sessionUserId) !== String(userId)) {
      return res.status(403).json({
        success: false,
        error: "Nu ai acces la această sesiune de plată.",
      });
    }

    const invoice = session.invoice;
    const url =
      (invoice && (invoice.hosted_invoice_url || invoice.invoice_pdf)) ||
      null;

    if (!url) {
      return res.status(404).json({
        success: false,
        error: "Factura nu este încă disponibilă pentru această sesiune.",
      });
    }

    res.json({ success: true, url });
  } catch (err) {
    console.error("Eroare la preluarea facturii Stripe:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Nu s-a putut prelua factura.",
    });
  }
};

// Returnează data reală de reînnoire (current_period_end) a abonamentului Stripe
// activ al userului curent. Pentru useri fără stripe_subscription_id (plan Free,
// sau plan Pro setat manual/altfel decât prin checkout real) returnează
// currentPeriodEnd: null — frontend-ul nu afișează nicio dată în acest caz.
exports.getSubscriptionStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    const userRes = await pool.query(
      "SELECT stripe_subscription_id FROM users WHERE id = $1",
      [userId],
    );

    const subscriptionId =
      userRes.rows[0] && userRes.rows[0].stripe_subscription_id;

    if (!subscriptionId) {
      return res.json({ success: true, data: { currentPeriodEnd: null } });
    }

    try {
      const subscription =
        await stripe.subscriptions.retrieve(subscriptionId);
      const currentPeriodEnd = subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null;

      res.json({ success: true, data: { currentPeriodEnd } });
    } catch (stripeErr) {
      console.error(
        `Nu s-a putut prelua abonamentul Stripe (subscription_id=${subscriptionId}):`,
        stripeErr,
      );
      res.json({ success: true, data: { currentPeriodEnd: null } });
    }
  } catch (err) {
    console.error("Eroare la verificarea statusului abonamentului:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Nu s-a putut verifica statusul abonamentului.",
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
        await pool.query(
          "UPDATE users SET plan = 'pro', stripe_subscription_id = $2 WHERE id = $1",
          [userId, session.subscription],
        );
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
