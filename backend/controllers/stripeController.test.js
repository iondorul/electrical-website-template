jest.mock("../config/db", () => ({
  query: jest.fn(),
}));

const mockUpdate = jest.fn();
const mockRetrieve = jest.fn();
const mockConstructEvent = jest.fn();

jest.mock("stripe", () => {
  return jest.fn(() => ({
    subscriptions: {
      update: mockUpdate,
      retrieve: mockRetrieve,
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

describe("handleWebhook — customer.subscription.deleted", () => {
  test("la expirarea reală a abonamentului, resetează userul: plan='free', stripe_subscription_id=NULL, downgrade_scheduled=false, payment_failed_at=NULL", async () => {
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
});
