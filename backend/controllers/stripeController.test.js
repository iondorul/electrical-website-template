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
  test("la expirarea reală a abonamentului, resetează userul: plan='free', stripe_subscription_id=NULL, downgrade_scheduled=false", async () => {
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
    expect(params).toEqual(["sub_123"]);
    expect(res.json).toHaveBeenCalledWith({ received: true });
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
