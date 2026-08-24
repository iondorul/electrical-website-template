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
      "SELECT stripe_subscription_id, downgrade_scheduled, payment_failed_at, renewal_extension_period_end FROM users WHERE id = $1",
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
    // Extensie locală plătită prin "Reînnoiește acum" (vezi renewNow mai jos)
    // — Stripe nu știe nimic despre ea, deci nu se citește niciodată live.
    const renewalExtensionPeriodEnd =
      (userRes.rows[0] && userRes.rows[0].renewal_extension_period_end) ||
      null;

    if (!subscriptionId) {
      return res.json({
        success: true,
        data: {
          currentPeriodEnd: null,
          downgradeScheduled: false,
          paymentFailedAt: null,
          billingInterval: null,
        },
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
          data: {
            currentPeriodEnd: null,
            downgradeScheduled,
            paymentFailedAt,
            billingInterval: null,
          },
        });
      }

      // Intervalul real de facturare (lunar/anual) e citit direct din Stripe,
      // nu dintr-o coloană DB — subscription e deja preluat mai sus pentru
      // currentPeriodEnd, deci nu costă un apel suplimentar. Sursă de adevăr
      // unică, la fel ca restul câmpurilor din acest endpoint.
      const currentItem =
        subscription.items && subscription.items.data && subscription.items.data[0];
      const billingInterval =
        (currentItem &&
          currentItem.price &&
          currentItem.price.recurring &&
          currentItem.price.recurring.interval) ||
        null;

      // Data afișată efectiv userului: dacă există o extensie locală plătită
      // (renewal_extension_period_end) mai târzie decât data brută din
      // Stripe, aceea e cea reală de expirare — abonamentul Stripe însuși
      // rămâne neatins și continuă să factureze automat pe propriul ciclu,
      // dar userul a mai plătit un top-up separat care extinde efectiv
      // accesul dincolo de acel ciclu (vezi renewNow + handleWebhook mai jos).
      const rawPeriodEnd = new Date(periodEndTimestamp * 1000);
      const effectivePeriodEnd =
        renewalExtensionPeriodEnd && renewalExtensionPeriodEnd > rawPeriodEnd
          ? renewalExtensionPeriodEnd
          : rawPeriodEnd;
      const currentPeriodEnd = effectivePeriodEnd.toISOString();
      res.json({
        success: true,
        data: { currentPeriodEnd, downgradeScheduled, paymentFailedAt, billingInterval },
      });
    } catch (stripeErr) {
      console.error(
        `Nu s-a putut prelua abonamentul Stripe (subscription_id=${subscriptionId}):`,
        stripeErr,
      );
      res.json({
        success: false,
        status: "error",
        data: {
          currentPeriodEnd: null,
          downgradeScheduled,
          paymentFailedAt,
          billingInterval: null,
        },
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

// Trece abonamentul Pro existent de pe lunar (STRIPE_PRICE_ID_PRO) pe anual
// (STRIPE_PRICE_ID_PRO_YEARLY) — simetric cu switchToMonthly mai jos, doar cu
// price ID-ul opus. Fără Checkout Session, fără taxare imediată: doar schimbă
// item-ul abonamentului existent (subscriptions.update, proration_behavior:
// 'none', FĂRĂ billing_cycle_anchor). Efectul: userul păstrează accesul Pro la
// prețul lunar deja plătit până la finalul perioadei curente (fără proration),
// iar de la reînnoirea următoare Stripe facturează automat la prețul anual
// (€143.04/an, 20% discount). Nu se creează niciun abonament nou — e același
// subscription_id, neschimbat.
//
// Decizie revizuită (înlocuiește varianta anterioară, bazată pe Checkout
// Session cu taxare imediată de €143.04 + anularea separată a abonamentului
// vechi în webhook): userul nu trebuie taxat imediat doar pentru a-și
// programa trecerea la anual — la fel cum switchToMonthly nu taxează nimic
// acum. Confirmarea explicită se face printr-un modal local
// (#switchToYearlyConfirmModal în erp-plans.html), nu prin pagina de plată
// Stripe.
exports.switchToYearly = async (req, res) => {
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
        error: "Nu ai un abonament Pro activ de actualizat.",
      });
    }

    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const currentItem = subscription.items.data[0];

      // Guard simetric cu cel din switchToMonthly: dacă e deja pe anual, nu
      // mai rulăm update-ul din nou (no-op inofensiv la nivel Stripe, dar
      // respins explicit aici ca răspunsul să fie clar pentru frontend).
      if (
        currentItem &&
        currentItem.price &&
        currentItem.price.id === process.env.STRIPE_PRICE_ID_PRO_YEARLY
      ) {
        return res.status(400).json({
          success: false,
          error: "Ești deja pe planul anual.",
        });
      }

      await stripe.subscriptions.update(subscriptionId, {
        items: [
          { id: currentItem.id, price: process.env.STRIPE_PRICE_ID_PRO_YEARLY },
        ],
        proration_behavior: "none",
      });
    } catch (stripeErr) {
      console.error(
        `Eroare Stripe la trecerea la plata anuală (subscription_id=${subscriptionId}):`,
        stripeErr,
      );
      return res.status(500).json({
        success: false,
        error:
          stripeErr.message ||
          "Nu s-a putut procesa trecerea la plata anuală. Încearcă din nou sau contactează suportul.",
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Eroare la trecerea la plata anuală:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Nu s-a putut procesa trecerea la plata anuală.",
    });
  }
};

// Trece abonamentul Pro existent de pe anual (STRIPE_PRICE_ID_PRO_YEARLY) pe
// lunar (STRIPE_PRICE_ID_PRO) — simetric cu switchToYearly de mai sus.
// Fără Checkout Session, fără taxare imediată: doar schimbă item-ul
// abonamentului existent (subscriptions.update, proration_behavior: 'none',
// FĂRĂ billing_cycle_anchor). Efectul: userul păstrează accesul Pro până la
// finalul perioadei anuale deja plătite (fără refund, fără proration — vezi
// politica de anulare deja stabilită), iar de la reînnoirea următoare Stripe
// facturează automat la prețul lunar. Nu se creează niciun abonament nou și
// nu e nevoie să se anuleze vreunul — e același subscription_id, neschimbat.
exports.switchToMonthly = async (req, res) => {
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
        error: "Nu ai un abonament Pro activ de actualizat.",
      });
    }

    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const currentItem = subscription.items.data[0];

      // Guard simetric cu cel din switchToYearly: dacă e deja pe lunar, nu mai
      // rulăm update-ul din nou (no-op inofensiv la nivel Stripe, dar respins
      // explicit aici ca răspunsul să fie clar pentru frontend).
      if (
        currentItem &&
        currentItem.price &&
        currentItem.price.id === process.env.STRIPE_PRICE_ID_PRO
      ) {
        return res.status(400).json({
          success: false,
          error: "Ești deja pe planul lunar.",
        });
      }

      await stripe.subscriptions.update(subscriptionId, {
        items: [{ id: currentItem.id, price: process.env.STRIPE_PRICE_ID_PRO }],
        proration_behavior: "none",
      });
    } catch (stripeErr) {
      console.error(
        `Eroare Stripe la trecerea la plata lunară (subscription_id=${subscriptionId}):`,
        stripeErr,
      );
      return res.status(500).json({
        success: false,
        error:
          stripeErr.message ||
          "Nu s-a putut procesa trecerea la plata lunară. Încearcă din nou sau contactează suportul.",
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Eroare la trecerea la plata lunară:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Nu s-a putut procesa trecerea la plata lunară.",
    });
  }
};

// Adaugă intervalul de facturare la o dată dată — folosit de handleWebhook
// mai jos (ramura checkout.session.completed / flow:'renew-now') pentru a
// calcula noua dată de expirare efectivă, FĂRĂ apel Stripe suplimentar.
//
// Folosește metodele UTC (setUTCMonth/setUTCFullYear), NU cele locale
// (setMonth/setFullYear) — descoperit prin testare: setMonth() păstrează
// componentele de oră ÎN TIMPUL LOCAL, deci o interval care traversează o
// schimbare de oră de vară/iarnă (ex. octombrie→noiembrie) dă un timestamp
// UTC decalat cu o oră față de cel corect. UTC nu are DST, deci e sigur.
function addBillingInterval(date, interval, intervalCount) {
  const result = new Date(date);
  const count = intervalCount || 1;
  switch (interval) {
    case "year":
      result.setUTCFullYear(result.getUTCFullYear() + count);
      break;
    case "week":
      result.setUTCDate(result.getUTCDate() + 7 * count);
      break;
    case "day":
      result.setUTCDate(result.getUTCDate() + count);
      break;
    case "month":
    default:
      result.setUTCMonth(result.getUTCMonth() + count);
      break;
  }
  return result;
}

// Reînnoire anticipată plătită — cere userului să confirme o plată REALĂ
// printr-un Stripe Checkout Session (mode:'payment', FĂRĂ proration), exact
// ca la upgrade-ul inițial Free→Pro / switchToYearly.
//
// Mecanismul inițial (stripe.subscriptions.update cu billing_cycle_anchor:
// 'now' + proration_behavior:'create_prorations') a fost eliminat complet —
// dovedit greșit cu o plată REALĂ de test: reseta ciclul de facturare să
// înceapă azi, nu extindea de la data existentă de expirare a abonamentului,
// lăsând userul plătit fără nicio extindere reală vizibilă. Am încercat și
// stripe.invoices.createPreview pentru previzualizare — la fel de greșit,
// vezi istoricul (era deja eliminat înainte de acest task, pentru același
// motiv de fond: "acum" nu se comporta ca momentul real al apelului).
//
// Adaptiv la intervalul real al abonamentului (verificat live: un user pe
// Anual vedea tot €14.90/"1 lună" la reînnoire, indiferent de plan — găsit
// la retestarea manuală a task-ului de mai sus). Citim intervalul curent
// direct din subscription.items.data[0].price.recurring (deja retrieve-uit
// aici), la fel cum face getSubscriptionStatus — nu presupunem niciodată
// "lunar" implicit dincolo de fallback-ul defensiv de mai jos.
//
// Abonamentul Stripe existent NU e atins deloc de acest flux — continuă să
// factureze automat normal, pe propriul ciclu. Noua dată efectivă (vechiul
// current_period_end + 1 interval, la fel ca prețul plătit acum) se
// calculează și se scrie DOAR în webhook, după ce plata chiar a fost
// confirmată (vezi handleWebhook mai jos, migrarea 016,
// users.renewal_extension_period_end).
exports.renewNow = async (req, res) => {
  try {
    const userId = req.user.id;

    const userRes = await pool.query(
      "SELECT stripe_subscription_id, downgrade_scheduled FROM users WHERE id = $1",
      [userId],
    );
    const subscriptionId =
      userRes.rows[0] && userRes.rows[0].stripe_subscription_id;
    const downgradeScheduled =
      (userRes.rows[0] && userRes.rows[0].downgrade_scheduled) || false;

    if (!subscriptionId) {
      return res.status(400).json({
        success: false,
        error: "Nu ai un abonament Pro activ.",
      });
    }

    if (downgradeScheduled) {
      return res.status(400).json({
        success: false,
        error:
          "Ai deja un downgrade programat — anulează-l înainte de a reînnoi acum.",
      });
    }

    let interval;
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const currentItem =
        subscription.items && subscription.items.data && subscription.items.data[0];
      const recurring = currentItem && currentItem.price && currentItem.price.recurring;
      interval = (recurring && recurring.interval) || "month";
    } catch (stripeErr) {
      console.error(
        `Eroare Stripe la determinarea intervalului pentru reînnoire (subscription_id=${subscriptionId}):`,
        stripeErr,
      );
      return res.status(500).json({
        success: false,
        error:
          stripeErr.message ||
          "Nu s-a putut pregăti reînnoirea. Încearcă din nou sau contactează suportul.",
      });
    }

    const isYearly = interval === "year";
    const unitAmount = isYearly ? 14304 : 1490; // €143.04 / €14.90
    const productName = isYearly
      ? "Reînnoire anticipată ElectricalVPF Pro — 1 an"
      : "Reînnoire anticipată ElectricalVPF Pro — 1 lună";

    const frontendUrl =
      process.env.FRONTEND_URL || "http://127.0.0.1:5500/frontend";

    let session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "eur",
              unit_amount: unitAmount,
              product_data: { name: productName },
            },
            quantity: 1,
          },
        ],
        client_reference_id: String(userId),
        metadata: { userId: String(userId), flow: "renew-now" },
        success_url: `${frontendUrl}/payment-success.html?type=renew-now&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendUrl}/erp-plans.html?canceled=true`,
      });
    } catch (stripeErr) {
      console.error(
        `Eroare Stripe la crearea sesiunii de plată pentru reînnoire (subscription_id=${subscriptionId}):`,
        stripeErr,
      );
      return res.status(500).json({
        success: false,
        error:
          stripeErr.message ||
          "Nu s-a putut crea sesiunea de plată. Încearcă din nou sau contactează suportul.",
      });
    }

    res.json({ success: true, url: session.url });
  } catch (err) {
    console.error("Eroare la pregătirea reînnoirii anticipate:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Nu s-a putut procesa reînnoirea.",
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
      const flow = session.metadata && session.metadata.flow;

      if (userId) {
        if (flow === "renew-now") {
          // Reînnoire anticipată plătită — abonamentul Stripe existent NU e
          // atins (rămâne pe propriul ciclu automat). Calculăm noua dată
          // efectivă de expirare DOAR aici, după confirmarea reală a plății
          // (mode:'payment' nu creează niciun subscription, deci
          // session.subscription e null pentru acest flow).
          const extRes = await pool.query(
            "SELECT stripe_subscription_id, renewal_extension_period_end FROM users WHERE id = $1",
            [userId],
          );
          const subscriptionId =
            extRes.rows[0] && extRes.rows[0].stripe_subscription_id;
          const existingExtension =
            extRes.rows[0] && extRes.rows[0].renewal_extension_period_end;

          if (!subscriptionId) {
            console.error(
              `checkout.session.completed (renew-now) fără stripe_subscription_id pentru user_id=${userId}.`,
            );
          } else {
            const subscription =
              await stripe.subscriptions.retrieve(subscriptionId);
            const rawPeriodEndTimestamp =
              extractSubscriptionPeriodEnd(subscription);
            const rawPeriodEnd = rawPeriodEndTimestamp
              ? new Date(rawPeriodEndTimestamp * 1000)
              : null;

            // Baza de la care extindem: dacă există deja o extensie locală
            // mai târzie decât data brută din Stripe (userul a mai dat
            // "Reînnoiește acum" recent), extensiile se cumulează — pornim
            // de la ultima dată efectivă, altfel a doua reînnoire ar "sări"
            // peste prima în loc să se adauge la ea.
            const base =
              existingExtension && rawPeriodEnd && existingExtension > rawPeriodEnd
                ? existingExtension
                : rawPeriodEnd;

            // Intervalul cu care extindem — citit din ACEEAȘI subscription
            // deja retrieve-uită mai sus (fără apel Stripe suplimentar), nu
            // presupus "lună" fix. Găsit prin testare live: un user pe Anual
            // ar fi primit greșit doar +1 lună (renewNow deja plătește suma
            // corectă — €143.04/€14.90 — pe baza aceluiași interval real).
            const currentItem =
              subscription.items && subscription.items.data && subscription.items.data[0];
            const recurring = currentItem && currentItem.price && currentItem.price.recurring;
            const interval = (recurring && recurring.interval) || "month";
            const intervalCount = (recurring && recurring.interval_count) || 1;

            if (!base) {
              console.error(
                `checkout.session.completed (renew-now): nu s-a putut determina current_period_end pentru subscription_id=${subscriptionId}.`,
              );
            } else {
              const newPeriodEnd = addBillingInterval(base, interval, intervalCount);
              await pool.query(
                "UPDATE users SET renewal_extension_period_end = $2 WHERE id = $1",
                [userId, newPeriodEnd],
              );
            }
          }
        } else {
          // payment_failed_at = NULL: dacă userul se reabonează după un eșec
          // definitiv (subscription_id nou), nu trebuie să rămână stale un
          // avertisment de plată eșuată de la abonamentul anterior, deja închis.
          await pool.query(
            "UPDATE users SET plan = 'pro', stripe_subscription_id = $2, payment_failed_at = NULL WHERE id = $1",
            [userId, session.subscription],
          );
        }
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
      // renewal_extension_period_end = NULL, din același motiv: o extensie
      // plătită anterior n-are sens păstrată stale pe un cont redevenit Free.
      await pool.query(
        "UPDATE users SET plan = 'free', stripe_subscription_id = NULL, downgrade_scheduled = false, payment_failed_at = NULL, renewal_extension_period_end = NULL WHERE stripe_subscription_id = $1",
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
