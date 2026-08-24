// Setate explicit — Jest nu încarcă .env, iar controllerul citește direct
// process.env.STRIPE_PRICE_ID_PRO / STRIPE_PRICE_ID_PRO_YEARLY la fiecare
// apel (switchToYearly/switchToMonthly), nu o singură dată la import.
process.env.STRIPE_PRICE_ID_PRO = "price_test_monthly";
process.env.STRIPE_PRICE_ID_PRO_YEARLY = "price_test_yearly";

jest.mock("../config/db", () => ({
  query: jest.fn(),
}));

const mockUpdate = jest.fn();
const mockRetrieve = jest.fn();
const mockConstructEvent = jest.fn();
const mockSessionsCreate = jest.fn();

jest.mock("stripe", () => {
  return jest.fn(() => ({
    subscriptions: {
      update: mockUpdate,
      retrieve: mockRetrieve,
    },
    checkout: {
      sessions: {
        create: mockSessionsCreate,
      },
    },
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  }));
});

const mockSendPaymentFailedEmail = jest.fn();

jest.mock("../services/emailService", () => ({
  sendPaymentFailedEmail: (...args) => mockSendPaymentFailedEmail(...args),
}));

const pool = require("../config/db");
const stripeController = require("./stripeController");

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("scheduleDowngrade", () => {
  test("cheamă stripe.subscriptions.update cu cancel_at_period_end:true și setează doar downgrade_scheduled=true (nu atinge plan)", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ stripe_subscription_id: "sub_123" }] }) // SELECT
      .mockResolvedValueOnce({ rows: [] }); // UPDATE

    mockUpdate.mockResolvedValueOnce({
      id: "sub_123",
      current_period_end: 1780000000,
    });

    const req = { user: { id: 1 } };
    const res = mockRes();

    await stripeController.scheduleDowngrade(req, res);

    expect(mockUpdate).toHaveBeenCalledWith("sub_123", {
      cancel_at_period_end: true,
    });

    expect(pool.query).toHaveBeenCalledTimes(2);
    const [updateSql, updateParams] = pool.query.mock.calls[1];
    expect(updateSql).toMatch(/UPDATE\s+users/i);
    expect(updateSql).toMatch(/downgrade_scheduled\s*=\s*true/i);
    expect(updateSql).not.toMatch(/\bplan\s*=/i);
    expect(updateParams).toEqual([1]);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  test("dacă userul nu are stripe_subscription_id, respinge cu 400 și nu apelează Stripe", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: null }],
    });

    const req = { user: { id: 2 } };
    const res = mockRes();

    await stripeController.scheduleDowngrade(req, res);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("dacă apelul Stripe eșuează, NU scrie nimic în DB și returnează eroare 500 clară", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: "sub_123" }],
    });
    mockUpdate.mockRejectedValueOnce(new Error("Stripe API is down"));

    const req = { user: { id: 1 } };
    const res = mockRes();

    await stripeController.scheduleDowngrade(req, res);

    // Doar SELECT-ul inițial a rulat — niciun UPDATE după eroarea Stripe
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });
});

describe("cancelScheduledDowngrade", () => {
  test("cheamă stripe.subscriptions.update cu cancel_at_period_end:false și setează downgrade_scheduled=false", async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ stripe_subscription_id: "sub_123" }] })
      .mockResolvedValueOnce({ rows: [] });

    mockUpdate.mockResolvedValueOnce({ id: "sub_123" });

    const req = { user: { id: 1 } };
    const res = mockRes();

    await stripeController.cancelScheduledDowngrade(req, res);

    expect(mockUpdate).toHaveBeenCalledWith("sub_123", {
      cancel_at_period_end: false,
    });

    const [updateSql] = pool.query.mock.calls[1];
    expect(updateSql).toMatch(/downgrade_scheduled\s*=\s*false/i);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
  });

  test("dacă apelul Stripe eșuează, NU modifică DB și returnează eroare clară", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: "sub_123" }],
    });
    mockUpdate.mockRejectedValueOnce(new Error("network error"));

    const req = { user: { id: 1 } };
    const res = mockRes();

    await stripeController.cancelScheduledDowngrade(req, res);

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("switchToYearly", () => {
  // Simetric cu switchToMonthly: fără Checkout Session, fără taxare
  // imediată — direct subscriptions.update cu price ID-ul anual,
  // proration_behavior:'none'. Înlocuiește complet mecanismul anterior
  // (Checkout Session mode:'subscription' + anulare abonament vechi în
  // webhook), eliminat pentru că taxa imediat €143.04 doar pentru a
  // programa trecerea la anual — userul trebuie doar să confirme, nu să
  // plătească acum (accesul Pro lunar deja plătit rămâne activ până la
  // expirare, apoi Stripe facturează automat la anual).
  test("cheamă stripe.subscriptions.update cu price ID-ul anual și proration_behavior:'none', fără nicio sesiune Checkout", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: "sub_123" }],
    });
    mockRetrieve.mockResolvedValueOnce({
      items: {
        data: [{ id: "si_current", price: { id: "price_test_monthly" } }],
      },
    });
    mockUpdate.mockResolvedValueOnce({ id: "sub_123" });

    const req = { user: { id: 1 } };
    const res = mockRes();

    await stripeController.switchToYearly(req, res);

    expect(mockUpdate).toHaveBeenCalledWith("sub_123", {
      items: [{ id: "si_current", price: "price_test_yearly" }],
      proration_behavior: "none",
    });
    expect(mockSessionsCreate).not.toHaveBeenCalled();

    // Un singur query — SELECT-ul de guard; niciun DB write (la fel ca
    // switchToMonthly, nu se persistă nimic aici, Stripe rămâne unica
    // sursă de adevăr pentru billingInterval, citit live de getSubscriptionStatus).
    expect(pool.query).toHaveBeenCalledTimes(1);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true }),
    );
    // Fără url — spre deosebire de vechiul flux Checkout, nu există nicio
    // pagină Stripe către care să redirecționeze frontend-ul.
    expect(res.json).not.toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.anything() }),
    );
  });

  test("dacă userul nu are stripe_subscription_id, respinge cu 400 și nu apelează Stripe", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: null }],
    });

    const req = { user: { id: 1 } };
    const res = mockRes();

    await stripeController.switchToYearly(req, res);

    expect(mockRetrieve).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("dacă e deja pe planul anual, respinge cu 400 și nu apelează subscriptions.update", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: "sub_123" }],
    });
    mockRetrieve.mockResolvedValueOnce({
      items: {
        data: [{ id: "si_current", price: { id: "price_test_yearly" } }],
      },
    });

    const req = { user: { id: 1 } };
    const res = mockRes();

    await stripeController.switchToYearly(req, res);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });

  test("dacă apelul Stripe eșuează, returnează 500 și nu scrie nimic în DB", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: "sub_123" }],
    });
    mockRetrieve.mockRejectedValueOnce(new Error("Stripe API is down"));

    const req = { user: { id: 1 } };
    const res = mockRes();

    await stripeController.switchToYearly(req, res);

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });
});

describe("handleWebhook — checkout.session.completed (fără flow yearly-switch — mecanism eliminat)", () => {
  test("un checkout.session.completed cu metadata.flow='yearly-switch' NU mai are ramură dedicată — cade pe ramura implicită Free→Pro (comportament vechi eliminat, nu mai poate fi produs de switchToYearly, dar verificăm explicit că handler-ul n-a rămas cu cod mort periculos)", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "1",
          subscription: "sub_new",
          metadata: { userId: "1", flow: "yearly-switch", oldSubscriptionId: "sub_old" },
        },
      },
    });

    pool.query.mockResolvedValueOnce({ rows: [] });

    const req = {
      headers: { "stripe-signature": "sig" },
      body: Buffer.from("{}"),
    };
    const res = mockRes();

    await stripeController.handleWebhook(req, res);

    // Fără ramură dedicată yearly-switch, cade pe ramura implicită (Free→Pro):
    // trece plan='pro' — inofensiv pentru un user deja Pro, dar confirmă că
    // NU se mai apelează stripe.subscriptions.cancel() pe niciun abonament vechi.
    expect(mockUpdate).not.toHaveBeenCalled();
    const [sql] = pool.query.mock.calls[0];
    expect(sql).toMatch(/plan\s*=\s*'pro'/i);
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });
});

describe("handleWebhook — customer.subscription.deleted", () => {
  test("la expirarea reală a abonamentului, resetează userul: plan='free', stripe_subscription_id=NULL, downgrade_scheduled=false, payment_failed_at=NULL, renewal_extension_period_end=NULL", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_123" } },
    });

    pool.query.mockResolvedValueOnce({ rows: [] });

    const req = {
      headers: { "stripe-signature": "sig" },
      body: Buffer.from("{}"),
    };
    const res = mockRes();

    await stripeController.handleWebhook(req, res);

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/plan\s*=\s*'free'/i);
    expect(sql).toMatch(/stripe_subscription_id\s*=\s*null/i);
    expect(sql).toMatch(/downgrade_scheduled\s*=\s*false/i);
    expect(sql).toMatch(/payment_failed_at\s*=\s*null/i);
    expect(sql).toMatch(/renewal_extension_period_end\s*=\s*null/i);
    expect(params).toEqual(["sub_123"]);
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });
});

describe("handleWebhook — checkout.session.completed", () => {
  test("trece userul pe plan='pro', setează stripe_subscription_id și resetează payment_failed_at=NULL", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "1",
          subscription: "sub_new_456",
        },
      },
    });

    pool.query.mockResolvedValueOnce({ rows: [] });

    const req = {
      headers: { "stripe-signature": "sig" },
      body: Buffer.from("{}"),
    };
    const res = mockRes();

    await stripeController.handleWebhook(req, res);

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/plan\s*=\s*'pro'/i);
    expect(sql).toMatch(/stripe_subscription_id\s*=\s*\$2/i);
    expect(sql).toMatch(/payment_failed_at\s*=\s*null/i);
    expect(params).toEqual(["1", "sub_new_456"]);
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  test("fără userId identificabil (client_reference_id/metadata), doar loghează — nu apelează DB, tot 200", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: { object: { subscription: "sub_new_456" } },
    });

    const req = {
      headers: { "stripe-signature": "sig" },
      body: Buffer.from("{}"),
    };
    const res = mockRes();

    const consoleErrSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await stripeController.handleWebhook(req, res);

    expect(pool.query).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ received: true });

    consoleErrSpy.mockRestore();
  });
});

describe("handleWebhook — invoice.payment_failed", () => {
  test("setează payment_failed_at=NOW() (nu atinge plan/downgrade_scheduled) și trimite emailul de avertizare", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "invoice.payment_failed",
      data: { object: { subscription: "sub_123" } },
    });

    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, email: "user@example.com", full_name: "Ion Pop" }],
    });
    mockSendPaymentFailedEmail.mockResolvedValueOnce();

    const req = {
      headers: { "stripe-signature": "sig" },
      body: Buffer.from("{}"),
    };
    const res = mockRes();

    await stripeController.handleWebhook(req, res);

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE\s+users/i);
    expect(sql).toMatch(/payment_failed_at\s*=\s*now\(\)/i);
    expect(sql).not.toMatch(/\bplan\s*=/i);
    expect(sql).not.toMatch(/downgrade_scheduled\s*=/i);
    expect(params).toEqual(["sub_123"]);

    expect(mockSendPaymentFailedEmail).toHaveBeenCalledWith({
      to: "user@example.com",
      fullName: "Ion Pop",
    });

    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(res.status).not.toHaveBeenCalled();
  });

  test("citește subscription_id și din invoice.parent.subscription_details.subscription (Basil)", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "invoice.payment_failed",
      data: {
        object: {
          parent: { subscription_details: { subscription: "sub_basil" } },
        },
      },
    });

    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, email: "user@example.com", full_name: "Ion Pop" }],
    });
    mockSendPaymentFailedEmail.mockResolvedValueOnce();

    const req = {
      headers: { "stripe-signature": "sig" },
      body: Buffer.from("{}"),
    };
    const res = mockRes();

    await stripeController.handleWebhook(req, res);

    const [, params] = pool.query.mock.calls[0];
    expect(params).toEqual(["sub_basil"]);
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  test("dacă niciun user nu are acel subscription_id, doar loghează — nu trimite email, răspunde tot 200", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "invoice.payment_failed",
      data: { object: { subscription: "sub_necunoscut" } },
    });

    pool.query.mockResolvedValueOnce({ rows: [] });

    const req = {
      headers: { "stripe-signature": "sig" },
      body: Buffer.from("{}"),
    };
    const res = mockRes();

    const consoleErrSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await stripeController.handleWebhook(req, res);

    expect(mockSendPaymentFailedEmail).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(res.status).not.toHaveBeenCalled();

    consoleErrSpy.mockRestore();
  });

  test("dacă query-ul DB eșuează, nu blochează webhook-ul — loghează eroarea și răspunde tot 200 (fail-safe)", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "invoice.payment_failed",
      data: { object: { subscription: "sub_123" } },
    });

    pool.query.mockRejectedValueOnce(new Error("connection terminated"));

    const req = {
      headers: { "stripe-signature": "sig" },
      body: Buffer.from("{}"),
    };
    const res = mockRes();

    const consoleErrSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await stripeController.handleWebhook(req, res);

    expect(mockSendPaymentFailedEmail).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(res.status).not.toHaveBeenCalled();
    expect(consoleErrSpy).toHaveBeenCalled();

    consoleErrSpy.mockRestore();
  });

  test("dacă trimiterea emailului eșuează, tot nu blochează webhook-ul — DB rămâne deja actualizat, răspunde 200", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "invoice.payment_failed",
      data: { object: { subscription: "sub_123" } },
    });

    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, email: "user@example.com", full_name: "Ion Pop" }],
    });
    mockSendPaymentFailedEmail.mockRejectedValueOnce(new Error("SMTP down"));

    const req = {
      headers: { "stripe-signature": "sig" },
      body: Buffer.from("{}"),
    };
    const res = mockRes();

    const consoleErrSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await stripeController.handleWebhook(req, res);

    expect(mockSendPaymentFailedEmail).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(res.status).not.toHaveBeenCalled();

    consoleErrSpy.mockRestore();
  });
});

describe("handleWebhook — invoice.payment_succeeded", () => {
  test("resetează payment_failed_at la NULL pentru userul cu acel subscription_id", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "invoice.payment_succeeded",
      data: { object: { subscription: "sub_123" } },
    });

    pool.query.mockResolvedValueOnce({ rows: [] });

    const req = {
      headers: { "stripe-signature": "sig" },
      body: Buffer.from("{}"),
    };
    const res = mockRes();

    await stripeController.handleWebhook(req, res);

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE\s+users/i);
    expect(sql).toMatch(/payment_failed_at\s*=\s*null/i);
    expect(params).toEqual(["sub_123"]);

    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(res.status).not.toHaveBeenCalled();
  });

  test("dacă subscription_id nu poate fi identificat pe invoice, nu apelează DB și răspunde tot 200", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "invoice.payment_succeeded",
      data: { object: {} },
    });

    const req = {
      headers: { "stripe-signature": "sig" },
      body: Buffer.from("{}"),
    };
    const res = mockRes();

    const consoleErrSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await stripeController.handleWebhook(req, res);

    expect(pool.query).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ received: true });

    consoleErrSpy.mockRestore();
  });

  test("dacă query-ul DB eșuează, nu blochează webhook-ul — răspunde tot 200 (fail-safe)", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "invoice.payment_succeeded",
      data: { object: { subscription: "sub_123" } },
    });

    pool.query.mockRejectedValueOnce(new Error("connection terminated"));

    const req = {
      headers: { "stripe-signature": "sig" },
      body: Buffer.from("{}"),
    };
    const res = mockRes();

    const consoleErrSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await stripeController.handleWebhook(req, res);

    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(res.status).not.toHaveBeenCalled();

    consoleErrSpy.mockRestore();
  });
});

describe("getSubscriptionStatus — expune downgradeScheduled", () => {
  test("returnează downgradeScheduled din DB alături de currentPeriodEnd existent", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        { stripe_subscription_id: "sub_123", downgrade_scheduled: true },
      ],
    });

    mockRetrieve.mockResolvedValueOnce({
      current_period_end: 1780000000,
    });

    const req = { user: { id: 1 } };
    const res = mockRes();

    await stripeController.getSubscriptionStatus(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ downgradeScheduled: true }),
      }),
    );
  });

  test("dacă există o extensie locală (renewal_extension_period_end) mai târzie decât data brută din Stripe, o afișează pe aceea", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          stripe_subscription_id: "sub_123",
          downgrade_scheduled: false,
          renewal_extension_period_end: new Date("2026-10-20T09:00:00.000Z"),
        },
      ],
    });

    mockRetrieve.mockResolvedValueOnce({
      current_period_end: Math.floor(new Date("2026-09-20T09:00:00.000Z").getTime() / 1000),
    });

    const req = { user: { id: 1 } };
    const res = mockRes();

    await stripeController.getSubscriptionStatus(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          currentPeriodEnd: "2026-10-20T09:00:00.000Z",
        }),
      }),
    );
  });

  test("dacă extensia locală e mai veche decât data brută din Stripe (deja depășită), ignoră extensia și afișează data brută", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          stripe_subscription_id: "sub_123",
          downgrade_scheduled: false,
          renewal_extension_period_end: new Date("2026-08-01T09:00:00.000Z"),
        },
      ],
    });

    mockRetrieve.mockResolvedValueOnce({
      current_period_end: Math.floor(new Date("2026-09-20T09:00:00.000Z").getTime() / 1000),
    });

    const req = { user: { id: 1 } };
    const res = mockRes();

    await stripeController.getSubscriptionStatus(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          currentPeriodEnd: "2026-09-20T09:00:00.000Z",
        }),
      }),
    );
  });
});

describe("renewNow", () => {
  // Mecanismul anterior (subscriptions.update cu billing_cycle_anchor:'now' +
  // create_prorations) a fost eliminat complet — dovedit greșit cu plată REALĂ
  // de test: reseta ciclul de facturare să înceapă azi, în loc să extindă de
  // la data existentă de expirare, lăsând userul plătit fără nicio extindere
  // reală. Noul mecanism: Checkout Session (mode:'payment', fără proration) —
  // userul confirmă explicit pe pagina Stripe; calculul efectiv al noii date
  // se face abia în webhook, după plată confirmată (vezi describe-ul de mai jos).
  //
  // Adaptiv la intervalul real al abonamentului (verificat live: userul pe
  // Anual vedea tot €14.90/"1 lună" la reînnoire — nu avea sens; acum
  // stripe.subscriptions.retrieve() citește intervalul real înainte de a crea
  // sesiunea, exact ca la getSubscriptionStatus).
  test("abonament lunar: creează o Checkout Session mode:'payment', €14.90 / 1 lună, fără proration, metadata flow:'renew-now'", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: "sub_123", downgrade_scheduled: false }],
    });
    mockRetrieve.mockResolvedValueOnce({
      items: {
        data: [{ price: { recurring: { interval: "month", interval_count: 1 } } }],
      },
    });
    mockSessionsCreate.mockResolvedValueOnce({
      url: "https://checkout.stripe.com/session_renew_now_monthly",
    });

    const req = { user: { id: 1 } };
    const res = mockRes();

    await stripeController.renewNow(req, res);

    expect(mockRetrieve).toHaveBeenCalledWith("sub_123");
    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        client_reference_id: "1",
        metadata: expect.objectContaining({ userId: "1", flow: "renew-now" }),
        line_items: [
          expect.objectContaining({
            quantity: 1,
            price_data: expect.objectContaining({
              currency: "eur",
              unit_amount: 1490,
              product_data: expect.objectContaining({
                name: expect.stringMatching(/1 lună/),
              }),
            }),
          }),
        ],
      }),
    );

    // Niciun DB write aici — doar SELECT-ul de guard. Extensia efectivă se
    // scrie abia în webhook, după confirmarea reală a plății.
    expect(pool.query).toHaveBeenCalledTimes(1);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      url: "https://checkout.stripe.com/session_renew_now_monthly",
    });
  });

  test("abonament anual: creează o Checkout Session cu €143.04 / 1 an, nu €14.90 / 1 lună", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: "sub_456", downgrade_scheduled: false }],
    });
    mockRetrieve.mockResolvedValueOnce({
      items: {
        data: [{ price: { recurring: { interval: "year", interval_count: 1 } } }],
      },
    });
    mockSessionsCreate.mockResolvedValueOnce({
      url: "https://checkout.stripe.com/session_renew_now_yearly",
    });

    const req = { user: { id: 1 } };
    const res = mockRes();

    await stripeController.renewNow(req, res);

    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          expect.objectContaining({
            quantity: 1,
            price_data: expect.objectContaining({
              currency: "eur",
              unit_amount: 14304,
              product_data: expect.objectContaining({
                name: expect.stringMatching(/1 an/),
              }),
            }),
          }),
        ],
      }),
    );
  });

  test("dacă downgrade_scheduled=true, respinge cu 400 și nu creează nicio sesiune Stripe", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: "sub_123", downgrade_scheduled: true }],
    });

    const req = { user: { id: 1 } };
    const res = mockRes();

    await stripeController.renewNow(req, res);

    expect(mockRetrieve).not.toHaveBeenCalled();
    expect(mockSessionsCreate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("dacă userul nu are stripe_subscription_id, respinge cu 400 și nu creează nicio sesiune Stripe", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: null, downgrade_scheduled: false }],
    });

    const req = { user: { id: 1 } };
    const res = mockRes();

    await stripeController.renewNow(req, res);

    expect(mockRetrieve).not.toHaveBeenCalled();
    expect(mockSessionsCreate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("dacă determinarea intervalului real eșuează (eroare Stripe la retrieve), returnează 500 și nu creează nicio sesiune", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: "sub_123", downgrade_scheduled: false }],
    });
    mockRetrieve.mockRejectedValueOnce(new Error("Stripe API is down"));

    const req = { user: { id: 1 } };
    const res = mockRes();

    await stripeController.renewNow(req, res);

    expect(mockSessionsCreate).not.toHaveBeenCalled();
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });

  test("dacă crearea sesiunii Stripe eșuează, returnează 500 și nu scrie nimic în DB", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: "sub_123", downgrade_scheduled: false }],
    });
    mockRetrieve.mockResolvedValueOnce({
      items: {
        data: [{ price: { recurring: { interval: "month", interval_count: 1 } } }],
      },
    });
    mockSessionsCreate.mockRejectedValueOnce(new Error("Stripe API is down"));

    const req = { user: { id: 1 } };
    const res = mockRes();

    await stripeController.renewNow(req, res);

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });
});

describe("handleWebhook — checkout.session.completed (flow: renew-now)", () => {
  // TESTUL CARE AR FI PRINS BUG-UL RAPORTAT CU PLATĂ REALĂ: noua dată trebuie
  // calculată din VECHIUL current_period_end al abonamentului (citit din
  // Stripe), NU din "azi" — "azi" e fixat aici la o dată clar diferită de
  // vechiul current_period_end, ca cele două rezultate posibile (corect vs.
  // bug-ul vechi) să nu poată coincide accidental.
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-24T09:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("calculează noul current_period_end = VECHIUL current_period_end + 1 lună (nu azi + 1 lună)", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "1",
          metadata: { userId: "1", flow: "renew-now" },
        },
      },
    });

    pool.query
      .mockResolvedValueOnce({
        rows: [
          { stripe_subscription_id: "sub_123", renewal_extension_period_end: null },
        ],
      }) // SELECT
      .mockResolvedValueOnce({ rows: [] }); // UPDATE

    // Vechiul current_period_end e la 20 septembrie 2026 — la >25 de zile de
    // "azi" (24 august), deci "azi + 1 lună" (~24 septembrie) și "vechiul +
    // 1 lună" (20 octombrie) sunt date net diferite, imposibil de confundat.
    mockRetrieve.mockResolvedValueOnce({
      current_period_end: Math.floor(new Date("2026-09-20T09:00:00.000Z").getTime() / 1000),
      items: {
        data: [{ price: { recurring: { interval: "month", interval_count: 1 } } }],
      },
    });

    const req = {
      headers: { "stripe-signature": "sig" },
      body: Buffer.from("{}"),
    };
    const res = mockRes();

    await stripeController.handleWebhook(req, res);

    expect(mockRetrieve).toHaveBeenCalledWith("sub_123");
    expect(pool.query).toHaveBeenCalledTimes(2);

    const [updateSql, updateParams] = pool.query.mock.calls[1];
    expect(updateSql).toMatch(/UPDATE\s+users/i);
    expect(updateSql).toMatch(/renewal_extension_period_end\s*=\s*\$2/i);
    expect(updateParams[0]).toBe("1");
    expect(updateParams[1].toISOString()).toBe("2026-10-20T09:00:00.000Z");
    // Guard explicit împotriva regresiei raportate: NU trebuie să fie "azi + 1 lună".
    expect(updateParams[1].toISOString()).not.toBe("2026-09-24T09:00:00.000Z");

    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  test("abonament anual: calculează noul current_period_end = vechiul + 1 AN (nu +1 lună) — găsit prin testare live pe un user real pe planul Anual", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "1",
          metadata: { userId: "1", flow: "renew-now" },
        },
      },
    });

    pool.query
      .mockResolvedValueOnce({
        rows: [
          { stripe_subscription_id: "sub_456", renewal_extension_period_end: null },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    mockRetrieve.mockResolvedValueOnce({
      current_period_end: Math.floor(new Date("2027-08-24T09:00:00.000Z").getTime() / 1000),
      items: {
        data: [{ price: { recurring: { interval: "year", interval_count: 1 } } }],
      },
    });

    const req = {
      headers: { "stripe-signature": "sig" },
      body: Buffer.from("{}"),
    };
    const res = mockRes();

    await stripeController.handleWebhook(req, res);

    const [, updateParams] = pool.query.mock.calls[1];
    expect(updateParams[1].toISOString()).toBe("2028-08-24T09:00:00.000Z");
  });

  test("dacă există deja o extensie locală mai târzie decât data brută din Stripe, extensiile se cumulează (pornește de la extensia existentă, nu de la valoarea brută)", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "1",
          metadata: { userId: "1", flow: "renew-now" },
        },
      },
    });

    pool.query
      .mockResolvedValueOnce({
        rows: [
          {
            stripe_subscription_id: "sub_123",
            renewal_extension_period_end: new Date("2026-10-20T09:00:00.000Z"),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    mockRetrieve.mockResolvedValueOnce({
      current_period_end: Math.floor(new Date("2026-09-20T09:00:00.000Z").getTime() / 1000),
      items: {
        data: [{ price: { recurring: { interval: "month", interval_count: 1 } } }],
      },
    });

    const req = {
      headers: { "stripe-signature": "sig" },
      body: Buffer.from("{}"),
    };
    const res = mockRes();

    await stripeController.handleWebhook(req, res);

    const [, updateParams] = pool.query.mock.calls[1];
    // Pornește de la extensia existentă (20 octombrie), nu de la valoarea
    // brută Stripe (20 septembrie) — altfel a doua reînnoire ar "sări" peste prima.
    expect(updateParams[1].toISOString()).toBe("2026-11-20T09:00:00.000Z");
  });

  test("fără stripe_subscription_id pentru user, doar loghează — nu apelează Stripe, răspunde tot 200", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "1",
          metadata: { userId: "1", flow: "renew-now" },
        },
      },
    });

    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: null, renewal_extension_period_end: null }],
    });

    const req = {
      headers: { "stripe-signature": "sig" },
      body: Buffer.from("{}"),
    };
    const res = mockRes();

    const consoleErrSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await stripeController.handleWebhook(req, res);

    expect(mockRetrieve).not.toHaveBeenCalled();
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({ received: true });

    consoleErrSpy.mockRestore();
  });
});
