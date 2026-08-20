const pool = require("../config/db");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { sendPaymentFailedEmail } = require("../services/emailService");

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

// Stripe a eliminat current_period_end/current_period_start de pe Subscription
// începând cu versiunea API "2025-03-31.basil" (stripe-node v18+; avem instalat
// v22.5.0, fără apiVersion fixat explicit -> folosim implicit versiunea nouă) și
// le-a mutat pe fiecare subscription item (subscription.items.data[].current_period_end).
// Citim ambele locații documentate, cu fallback pe cea veche pentru compatibilitate.
// Sursă: https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end
function extractSubscriptionPeriodEnd(subscription) {
  if (typeof subscription.current_period_end === "number") {
    return subscription.current_period_end;
  }

  const itemPeriodEnd = subscription.items?.data?.[0]?.current_period_end;
  if (typeof itemPeriodEnd === "number") {
    return itemPeriodEnd;
  }

  return null;
}

// Aceeași problemă Basil ca la current_period_end: legătura invoice ->
// subscription s-a mutat din invoice.subscription (string, deprecated) în
// invoice.parent.subscription_details.subscription (string sau obiect
// expandat, în funcție de expand-uri). Citim ambele locații, cu fallback pe
// cea veche.
function extractInvoiceSubscriptionId(invoice) {
  if (typeof invoice.subscription === "string") {
    return invoice.subscription;
  }

  const parentSubscription =
    invoice.parent?.subscription_details?.subscription;
  if (typeof parentSubscription === "string") {
    return parentSubscription;
  }
  if (parentSubscription && typeof parentSubscription.id === "string") {
    return parentSubscription.id;
  }

  return null;
}

// Returnează data reală de reînnoire (current_period_end) a abonamentului Stripe
// activ al userului curent. Pentru useri fără stripe_subscription_id (plan Free,
// sau plan Pro setat manual/altfel decât prin checkout real) returnează
// currentPeriodEnd: null cu success:true — caz legitim, nu e o eroare.
// Dacă subscriptionId există dar nu poate fi verificat (eroare Stripe) sau
// structura răspunsului e neașteptată, răspunsul e success:false/status:"error"
// — diferit explicit de cazul "fără abonament", ca frontend-ul și logurile să
// nu confunde o eroare reală cu un user pe Free.
exports.getSubscriptionStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    const userRes = await pool.query(
      "SELECT stripe_subscription_id, downgrade_scheduled, payment_failed_at FROM users WHERE id = $1",
      [userId],
    );

    const subscriptionId =
      userRes.rows[0] && userRes.rows[0].stripe_subscription_id;
    const downgradeScheduled =
      (userRes.rows[0] && userRes.rows[0].downgrade_scheduled) || false;
    // payment_failed_at e citit direct din DB (nu depinde de Stripe API) — se
    // completează în toate ramurile de mai jos, inclusiv cele de eroare Stripe.
    const paymentFailedAt =
      (userRes.rows[0] &&
        userRes.rows[0].payment_failed_at &&
        userRes.rows[0].payment_failed_at.toISOString()) ||
      null;

    if (!subscriptionId) {
      return res.json({
        success: true,
        data: { currentPeriodEnd: null, downgradeScheduled: false, paymentFailedAt: null },
      });
    }

    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const periodEndTimestamp = extractSubscriptionPeriodEnd(subscription);

      if (periodEndTimestamp === null) {
        console.error(
          `Structura Stripe subscription neașteptată - verifică manual, subscription_id: ${subscriptionId}`,
        );
        return res.json({
          success: false,
          status: "error",
          data: { currentPeriodEnd: null, downgradeScheduled, paymentFailedAt },
        });
      }

      const currentPeriodEnd = new Date(periodEndTimestamp * 1000).toISOString();
      res.json({
        success: true,
        data: { currentPeriodEnd, downgradeScheduled, paymentFailedAt },
      });
    } catch (stripeErr) {
      console.error(
        `Nu s-a putut prelua abonamentul Stripe (subscription_id=${subscriptionId}):`,
        stripeErr,
      );
      res.json({
        success: false,
        status: "error",
        data: { currentPeriodEnd: null, downgradeScheduled, paymentFailedAt },
      });
    }
  } catch (err) {
    console.error("Eroare la verificarea statusului abonamentului:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Nu s-a putut verifica statusul abonamentului.",
    });
  }
};

// Programează downgrade la Free la finalul perioadei curent plătite —
// stripe.subscriptions.update(id, { cancel_at_period_end: true }). Userul
// rămâne plan='pro' (păstrează accesul) — doar downgrade_scheduled devine true.
// Dacă apelul Stripe eșuează, DB nu se atinge deloc (nicio schimbare silențioasă).
exports.scheduleDowngrade = async (req, res) => {
  try {
    const userId = req.user.id;

    const userRes = await pool.query(
      "SELECT stripe_subscription_id FROM users WHERE id = $1",
      [userId],
    );
    const subscriptionId =
      userRes.rows[0] && userRes.rows[0].stripe_subscription_id;

    if (!subscriptionId) {
      return res.status(400).json({
        success: false,
        error: "Nu ai un abonament Pro activ de anulat.",
      });
    }

    let subscription;
    try {
      subscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    } catch (stripeErr) {
      console.error(
        `Eroare Stripe la programarea downgrade-ului (subscription_id=${subscriptionId}):`,
        stripeErr,
      );
      return res.status(500).json({
        success: false,
        error:
          stripeErr.message ||
          "Nu s-a putut programa downgrade-ul. Încearcă din nou.",
      });
    }

    await pool.query(
      "UPDATE users SET downgrade_scheduled = true WHERE id = $1",
      [userId],
    );

    const periodEndTimestamp = extractSubscriptionPeriodEnd(subscription);
    const currentPeriodEnd = periodEndTimestamp
      ? new Date(periodEndTimestamp * 1000).toISOString()
      : null;

    res.json({
      success: true,
      data: { downgradeScheduled: true, currentPeriodEnd },
    });
  } catch (err) {
    console.error("Eroare la programarea downgrade-ului:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Nu s-a putut programa downgrade-ul.",
    });
  }
};

// Anulează un downgrade programat — cancel_at_period_end: false. Simetric cu
// scheduleDowngrade: dacă Stripe eșuează, DB nu se atinge.
exports.cancelScheduledDowngrade = async (req, res) => {
  try {
    const userId = req.user.id;

    const userRes = await pool.query(
      "SELECT stripe_subscription_id FROM users WHERE id = $1",
      [userId],
    );
    const subscriptionId =
      userRes.rows[0] && userRes.rows[0].stripe_subscription_id;

    if (!subscriptionId) {
      return res.status(400).json({
        success: false,
        error: "Nu ai un abonament Pro activ.",
      });
    }

    try {
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
      });
    } catch (stripeErr) {
      console.error(
        `Eroare Stripe la anularea downgrade-ului programat (subscription_id=${subscriptionId}):`,
        stripeErr,
      );
      return res.status(500).json({
        success: false,
        error:
          stripeErr.message ||
          "Nu s-a putut anula downgrade-ul programat. Încearcă din nou.",
      });
    }

    await pool.query(
      "UPDATE users SET downgrade_scheduled = false WHERE id = $1",
      [userId],
    );

    res.json({ success: true, data: { downgradeScheduled: false } });
  } catch (err) {
    console.error("Eroare la anularea downgrade-ului programat:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Nu s-a putut anula downgrade-ul programat.",
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
        // payment_failed_at = NULL: dacă userul se reabonează după un eșec
        // definitiv (subscription_id nou), nu trebuie să rămână stale un
        // avertisment de plată eșuată de la abonamentul anterior, deja închis.
        await pool.query(
          "UPDATE users SET plan = 'pro', stripe_subscription_id = $2, payment_failed_at = NULL WHERE id = $1",
          [userId, session.subscription],
        );
      } else {
        console.error(
          "checkout.session.completed fără userId (client_reference_id/metadata) — nu s-a putut face upgrade.",
        );
      }
    }

    // Stripe trimite acest eveniment automat când perioada plătită expiră și
    // cancel_at_period_end era true (downgrade programat) — abonamentul chiar
    // s-a încheiat. Găsim userul după subscription_id (nu avem userId direct
    // pe acest eveniment) și îl trecem efectiv pe Free.
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;

      // payment_failed_at = NULL alături de resetul de plan: abonamentul chiar
      // s-a încheiat (fie prin downgrade programat, fie prin eșecul final al
      // tuturor reîncercărilor) — avertismentul de plată eșuată nu mai are ce
      // reprezenta pentru un user care oricum nu mai are abonament activ.
      await pool.query(
        "UPDATE users SET plan = 'free', stripe_subscription_id = NULL, downgrade_scheduled = false, payment_failed_at = NULL WHERE stripe_subscription_id = $1",
        [subscription.id],
      );
    }

    // Grace period: Stripe reîncearcă automat plata pe câteva zile — userul
    // rămâne plan='pro' (nu se atinge plan/downgrade_scheduled aici), doar
    // marcăm momentul eșecului și trimitem un avertisment. Eșecul final (toate
    // reîncercările epuizate) e acoperit de customer.subscription.deleted mai
    // sus, care acum resetează și payment_failed_at.
    //
    // Spre deosebire de blocurile de mai sus, orice eroare aici (DB sau email)
    // e prinsă local și doar logată, fără să urce la catch-ul general — Stripe
    // trebuie să primească tot 200, altfel reface retry pe webhook-ul însuși
    // la nesfârșit pentru un eveniment care oricum nu poate fi remediat retrimis.
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      const subscriptionId = extractInvoiceSubscriptionId(invoice);

      if (!subscriptionId) {
        console.error(
          "invoice.payment_failed fără subscription_id identificabil pe invoice.",
        );
      } else {
        try {
          const userRes = await pool.query(
            "UPDATE users SET payment_failed_at = NOW() WHERE stripe_subscription_id = $1 RETURNING id, email, full_name",
            [subscriptionId],
          );
          const user = userRes.rows[0];

          if (!user) {
            console.error(
              `invoice.payment_failed: niciun user găsit pentru subscription_id=${subscriptionId}`,
            );
          } else {
            try {
              await sendPaymentFailedEmail({
                to: user.email,
                fullName: user.full_name,
              });
            } catch (emailErr) {
              console.error(
                `Eroare la trimiterea emailului de plată eșuată (user_id=${user.id}):`,
                emailErr,
              );
            }
          }
        } catch (dbErr) {
          console.error(
            `Eroare DB la procesarea invoice.payment_failed (subscription_id=${subscriptionId}):`,
            dbErr,
          );
        }
      }
    }

    // Un retry automat al Stripe a reușit după un eșec anterior — resetăm
    // avertismentul, ca userul să nu mai vadă banner-ul din Settings. Același
    // fail-safe ca mai sus: eroarea rămâne locală, răspunsul e tot 200.
    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object;
      const subscriptionId = extractInvoiceSubscriptionId(invoice);

      if (!subscriptionId) {
        console.error(
          "invoice.payment_succeeded fără subscription_id identificabil pe invoice.",
        );
      } else {
        try {
          await pool.query(
            "UPDATE users SET payment_failed_at = NULL WHERE stripe_subscription_id = $1",
            [subscriptionId],
          );
        } catch (dbErr) {
          console.error(
            `Eroare DB la procesarea invoice.payment_succeeded (subscription_id=${subscriptionId}):`,
            dbErr,
          );
        }
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error("Eroare la procesarea webhook-ului Stripe:", err);
    res.status(500).json({ error: err.message });
  }
};
