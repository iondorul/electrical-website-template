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

describe("createCheckoutSession", () => {
  // Userul e în grace period (a confirmat "Downgrade la Free" — users.plan
  // deja 'free', dar abonamentul Stripe rămâne activ cu
  // cancel_at_period_end=true, până la current_period_end deja plătit).
  // "Upgrade la Pro" în acest caz TOT trece printr-o Checkout Session reală,
  // cu plată efectivă — NU o reactivare gratuită. stripe.subscriptions.retrieve
  // rămâne apelat aici doar ca verificare că abonamentul chiar există/e
  // accesibil înainte de a crea o sesiune de plată.
  //
  // Suma facturată e determinată STRICT de `period` (dropdown-ul cu 5 opțiuni,
  // 1 lună/6 luni/1 an/3 ani/5 ani + discount, vezi RENEWAL_PERIODS) — mereu
  // calculată din baza €14.90/lună, INDIFERENT de `interval` (Lunar/Anual) sau
  // de intervalul curent al abonamentului. `interval` rămâne complet
  // independent: decide DOAR dacă se schimbă și prețul abonamentului Stripe
  // de bază (vezi handleWebhook mai jos) — nu are niciun efect asupra sumei
  // plătite acum pentru extindere. Cele două axe (period → sumă/extindere,
  // interval → schimbare plan de bază) sunt intenționat decuplate.
  test("grace period, period='1m' (implicit) — €14.90, 0% discount, flow:'grace-period-upgrade'", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: "sub_123", downgrade_scheduled: true }],
    });
    mockRetrieve.mockResolvedValueOnce({
      items: {
        data: [{ price: { recurring: { interval: "month", interval_count: 1 } } }],
      },
    });
    mockSessionsCreate.mockResolvedValueOnce({
      url: "https://checkout.stripe.com/session_grace_upgrade",
    });

    const req = { user: { id: 1 }, body: {} };
    const res = mockRes();

    await stripeController.createCheckoutSession(req, res);

    expect(mockRetrieve).toHaveBeenCalledWith("sub_123");
    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        client_reference_id: "1",
        metadata: expect.objectContaining({
          userId: "1",
          flow: "grace-period-upgrade",
          interval: "month",
          months: "1",
        }),
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
    expect(mockUpdate).not.toHaveBeenCalled(); // nimic modificat pe Stripe încă — abia în webhook, după plată
    expect(pool.query).toHaveBeenCalledTimes(1); // doar SELECT-ul de guard, niciun DB write aici

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      url: "https://checkout.stripe.com/session_grace_upgrade",
    });
  });

  test("grace period, period='6m' — €80.46 (6×€14.90, 10% discount)", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: "sub_456", downgrade_scheduled: true }],
    });
    mockRetrieve.mockResolvedValueOnce({
      items: { data: [{ price: { recurring: { interval: "month", interval_count: 1 } } }] },
    });
    mockSessionsCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/s_6m" });

    const req = { user: { id: 1 }, body: { period: "6m" } };
    const res = mockRes();

    await stripeController.createCheckoutSession(req, res);

    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ months: "6" }),
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              unit_amount: 8046,
              product_data: expect.objectContaining({ name: expect.stringMatching(/6 luni/) }),
            }),
          }),
        ],
      }),
    );
  });

  test("grace period, period='1y' — €143.04 (20% discount), INDIFERENT de interval='month' ales pe toggle", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: "sub_789", downgrade_scheduled: true }],
    });
    mockRetrieve.mockResolvedValueOnce({
      items: { data: [{ price: { recurring: { interval: "month", interval_count: 1 } } }] },
    });
    mockSessionsCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/s_1y" });

    // interval='month' (toggle pe Lunar) + period='1y' — testează explicit
    // decuplarea: alegerea de interval NU trebuie să schimbe suma facturată.
    const req = { user: { id: 1 }, body: { interval: "month", period: "1y" } };
    const res = mockRes();

    await stripeController.createCheckoutSession(req, res);

    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ interval: "month", months: "12" }),
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              unit_amount: 14304,
              product_data: expect.objectContaining({ name: expect.stringMatching(/1 an/) }),
            }),
          }),
        ],
      }),
    );
  });

  test("grace period, period='3y' — €375.48 (30% discount)", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: "sub_3y", downgrade_scheduled: true }],
    });
    mockRetrieve.mockResolvedValueOnce({
      items: { data: [{ price: { recurring: { interval: "month", interval_count: 1 } } }] },
    });
    mockSessionsCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/s_3y" });

    const req = { user: { id: 1 }, body: { period: "3y" } };
    const res = mockRes();

    await stripeController.createCheckoutSession(req, res);

    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ months: "36" }),
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              unit_amount: 37548,
              product_data: expect.objectContaining({ name: expect.stringMatching(/3 ani/) }),
            }),
          }),
        ],
      }),
    );
  });

  test("grace period, period='5y' — €536.40 (40% discount)", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: "sub_5y", downgrade_scheduled: true }],
    });
    mockRetrieve.mockResolvedValueOnce({
      items: { data: [{ price: { recurring: { interval: "month", interval_count: 1 } } }] },
    });
    mockSessionsCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/s_5y" });

    const req = { user: { id: 1 }, body: { period: "5y" } };
    const res = mockRes();

    await stripeController.createCheckoutSession(req, res);

    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ months: "60" }),
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              unit_amount: 53640,
              product_data: expect.objectContaining({ name: expect.stringMatching(/5 ani/) }),
            }),
          }),
        ],
      }),
    );
  });

  test("grace period, period necunoscut ('foo') — cade sigur pe '1m' (€14.90), nu crapă", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: "sub_bad", downgrade_scheduled: true }],
    });
    mockRetrieve.mockResolvedValueOnce({
      items: { data: [{ price: { recurring: { interval: "month", interval_count: 1 } } }] },
    });
    mockSessionsCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/s_fallback" });

    const req = { user: { id: 1 }, body: { period: "foo" } };
    const res = mockRes();

    await stripeController.createCheckoutSession(req, res);

    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ months: "1" }),
        line_items: [
          expect.objectContaining({ price_data: expect.objectContaining({ unit_amount: 1490 }) }),
        ],
      }),
    );
  });

  test("interval='year' ales pe toggle — schimbă metadata.interval, dar NU suma facturată (rămâne €14.90 la period='1m' implicit)", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: "sub_456", downgrade_scheduled: true }],
    });
    mockRetrieve.mockResolvedValueOnce({
      items: {
        data: [{ price: { recurring: { interval: "month", interval_count: 1 } } }],
      },
    });
    mockSessionsCreate.mockResolvedValueOnce({
      url: "https://checkout.stripe.com/session_grace_upgrade_yearly",
    });

    const req = { user: { id: 1 }, body: { interval: "year" } };
    const res = mockRes();

    await stripeController.createCheckoutSession(req, res);

    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ interval: "year", months: "1" }),
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({ unit_amount: 1490 }),
          }),
        ],
      }),
    );
  });

  // Bug găsit live (screenshot): userul alegea Anual, ajungea în Stripe
  // Checkout, apăsa Back/X (plată anulată) — și era redirecționat spre
  // erp-upgrade.html?canceled=true FĂRĂ interval=year, deci pagina revenea
  // pe Lunar, pierzând alegerea. cancel_url trebuie să care aceeași alegere
  // ca success_url.
  test("cancel_url păstrează interval=year (nu doar success_url), ca alegerea userului să nu se piardă la Back din Stripe", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: "sub_789", downgrade_scheduled: true }],
    });
    mockRetrieve.mockResolvedValueOnce({
      items: {
        data: [{ price: { recurring: { interval: "month", interval_count: 1 } } }],
      },
    });
    mockSessionsCreate.mockResolvedValueOnce({
      url: "https://checkout.stripe.com/session_grace_upgrade_yearly",
    });

    const req = { user: { id: 1 }, body: { interval: "year" } };
    const res = mockRes();

    await stripeController.createCheckoutSession(req, res);

    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        cancel_url: expect.stringContaining("erp-upgrade.html?canceled=true&interval=year"),
      }),
    );
  });

  test("dacă verificarea abonamentului eșuează, returnează 500 și nu creează nicio sesiune", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: "sub_123", downgrade_scheduled: true }],
    });
    mockRetrieve.mockRejectedValueOnce(new Error("Stripe API is down"));

    const req = { user: { id: 1 }, body: {} };
    const res = mockRes();

    await stripeController.createCheckoutSession(req, res);

    expect(mockSessionsCreate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });

  test("user fără abonament Stripe (Free normal) — creează Checkout Session mode:'subscription', ca înainte (neschimbat)", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: null, downgrade_scheduled: false }],
    });
    mockSessionsCreate.mockResolvedValueOnce({
      url: "https://checkout.stripe.com/session_upgrade",
    });

    const req = { user: { id: 1 } };
    const res = mockRes();

    await stripeController.createCheckoutSession(req, res);

    expect(mockRetrieve).not.toHaveBeenCalled();
    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "subscription" }),
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      url: "https://checkout.stripe.com/session_upgrade",
    });
  });

  test("user cu abonament activ dar FĂRĂ downgrade programat — creează Checkout Session mode:'subscription', ca înainte (neschimbat)", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: "sub_123", downgrade_scheduled: false }],
    });
    mockSessionsCreate.mockResolvedValueOnce({
      url: "https://checkout.stripe.com/session_upgrade",
    });

    const req = { user: { id: 1 } };
    const res = mockRes();

    await stripeController.createCheckoutSession(req, res);

    expect(mockRetrieve).not.toHaveBeenCalled();
    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "subscription" }),
    );
  });

  // Alegerea Lunar/Anual de pe toggle-ul din erp-plans.html trebuie să ajungă
  // efectiv în Checkout Session-ul creat pentru un user genuin Free (fără
  // abonament) — altfel toggle-ul e doar decor și userul plătește mereu
  // lunar indiferent ce a ales (bug găsit la afișarea planului ales pe
  // erp-upgrade.html, care are nevoie de un interval real pentru a-l afișa).
  test("user Free normal, interval='year' trimis din erp-upgrade.html — folosește STRIPE_PRICE_ID_PRO_YEARLY", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: null, downgrade_scheduled: false }],
    });
    mockSessionsCreate.mockResolvedValueOnce({
      url: "https://checkout.stripe.com/session_upgrade_yearly",
    });

    const req = { user: { id: 1 }, body: { interval: "year" } };
    const res = mockRes();

    await stripeController.createCheckoutSession(req, res);

    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        line_items: [
          expect.objectContaining({ price: "price_test_yearly", quantity: 1 }),
        ],
        cancel_url: expect.stringContaining("erp-upgrade.html?canceled=true&interval=year"),
      }),
    );
  });

  test("user Free normal, fără interval în body — rămâne STRIPE_PRICE_ID_PRO (lunar), neschimbat", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: null, downgrade_scheduled: false }],
    });
    mockSessionsCreate.mockResolvedValueOnce({
      url: "https://checkout.stripe.com/session_upgrade_monthly",
    });

    const req = { user: { id: 1 }, body: {} };
    const res = mockRes();

    await stripeController.createCheckoutSession(req, res);

    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          expect.objectContaining({ price: "price_test_monthly", quantity: 1 }),
        ],
      }),
    );
  });

  test("user Free normal, interval necunoscut ('foo') — cade sigur pe lunar, nu crapă", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: null, downgrade_scheduled: false }],
    });
    mockSessionsCreate.mockResolvedValueOnce({
      url: "https://checkout.stripe.com/session_upgrade_fallback",
    });

    const req = { user: { id: 1 }, body: { interval: "foo" } };
    const res = mockRes();

    await stripeController.createCheckoutSession(req, res);

    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          expect.objectContaining({ price: "price_test_monthly" }),
        ],
      }),
    );
  });
});

describe("scheduleDowngrade", () => {
  // users.plan reprezintă STRICT planul ales de user (Free/Pro), NU starea
  // reală Stripe — la downgrade confirmat, plan devine 'free' IMEDIAT, chiar
  // dacă abonamentul Stripe rămâne activ până la current_period_end.
  // Accesul real la facilitățile Pro rămâne controlat separat, prin
  // downgrade_scheduled (vezi planLimitMiddleware.test.js).
  test("cheamă stripe.subscriptions.update cu cancel_at_period_end:true și setează downgrade_scheduled=true ȘI plan='free' imediat", async () => {
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
    expect(updateSql).toMatch(/plan\s*=\s*'free'/i);
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
  // Dropdown universal "Reînnoiește acum" (1 lună/6 luni/1 an/3 ani/5 ani,
  // discount 0/10/20/30/40%) — suma NU mai e adaptivă la intervalul curent al
  // abonamentului (comportamentul vechi, verificat live ieri, dar înlocuit azi
  // explicit la cererea userului: dropdown-ul trebuie să fie universal,
  // indiferent dacă abonamentul de bază e Monthly sau Annual). Prețul e mereu
  // calculat din baza €14.90/lună × luni × (1 − discount) — vezi RENEWAL_PERIODS.
  // stripe.subscriptions.retrieve rămâne apelat doar ca verificare de
  // accesibilitate a abonamentului, nu mai determină prețul.
  test("period='1m' (implicit, fără period în body) — €14.90, 0% discount, metadata flow:'renew-now', months:'1'", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: "sub_123", downgrade_scheduled: false }],
    });
    mockRetrieve.mockResolvedValueOnce({
      items: {
        data: [{ price: { recurring: { interval: "month", interval_count: 1 } } }],
      },
    });
    mockSessionsCreate.mockResolvedValueOnce({
      url: "https://checkout.stripe.com/session_renew_now_1m",
    });

    const req = { user: { id: 1 }, body: {} };
    const res = mockRes();

    await stripeController.renewNow(req, res);

    expect(mockRetrieve).toHaveBeenCalledWith("sub_123");
    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        client_reference_id: "1",
        metadata: expect.objectContaining({ userId: "1", flow: "renew-now", months: "1" }),
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
      url: "https://checkout.stripe.com/session_renew_now_1m",
    });
  });

  // Testează explicit că, spre deosebire de comportamentul vechi, un
  // abonament ANUAL primește tot prețul de bază lunar la period='1m' — nu mai
  // există nicio adaptare la intervalul curent al abonamentului.
  test("period='1m' pe abonament ANUAL — tot €14.90 (nu €143.04), prețul nu mai depinde de intervalul abonamentului", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: "sub_456", downgrade_scheduled: false }],
    });
    mockRetrieve.mockResolvedValueOnce({
      items: {
        data: [{ price: { recurring: { interval: "year", interval_count: 1 } } }],
      },
    });
    mockSessionsCreate.mockResolvedValueOnce({
      url: "https://checkout.stripe.com/session_renew_now_1m_yearly_sub",
    });

    const req = { user: { id: 1 }, body: { period: "1m" } };
    const res = mockRes();

    await stripeController.renewNow(req, res);

    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({ unit_amount: 1490 }),
          }),
        ],
      }),
    );
  });

  test("period='6m' — €80.46 (6×€14.90, 10% discount)", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: "sub_6m", downgrade_scheduled: false }],
    });
    mockRetrieve.mockResolvedValueOnce({
      items: { data: [{ price: { recurring: { interval: "month", interval_count: 1 } } }] },
    });
    mockSessionsCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/rn_6m" });

    const req = { user: { id: 1 }, body: { period: "6m" } };
    const res = mockRes();

    await stripeController.renewNow(req, res);

    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ months: "6" }),
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              unit_amount: 8046,
              product_data: expect.objectContaining({ name: expect.stringMatching(/6 luni/) }),
            }),
          }),
        ],
      }),
    );
  });

  test("period='1y' — €143.04 (12×€14.90, 20% discount)", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: "sub_1y", downgrade_scheduled: false }],
    });
    mockRetrieve.mockResolvedValueOnce({
      items: { data: [{ price: { recurring: { interval: "month", interval_count: 1 } } }] },
    });
    mockSessionsCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/rn_1y" });

    const req = { user: { id: 1 }, body: { period: "1y" } };
    const res = mockRes();

    await stripeController.renewNow(req, res);

    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ months: "12" }),
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              unit_amount: 14304,
              product_data: expect.objectContaining({ name: expect.stringMatching(/1 an/) }),
            }),
          }),
        ],
      }),
    );
  });

  test("period='3y' — €375.48 (36×€14.90, 30% discount)", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: "sub_3y", downgrade_scheduled: false }],
    });
    mockRetrieve.mockResolvedValueOnce({
      items: { data: [{ price: { recurring: { interval: "month", interval_count: 1 } } }] },
    });
    mockSessionsCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/rn_3y" });

    const req = { user: { id: 1 }, body: { period: "3y" } };
    const res = mockRes();

    await stripeController.renewNow(req, res);

    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ months: "36" }),
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              unit_amount: 37548,
              product_data: expect.objectContaining({ name: expect.stringMatching(/3 ani/) }),
            }),
          }),
        ],
      }),
    );
  });

  test("period='5y' — €536.40 (60×€14.90, 40% discount)", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: "sub_5y", downgrade_scheduled: false }],
    });
    mockRetrieve.mockResolvedValueOnce({
      items: { data: [{ price: { recurring: { interval: "month", interval_count: 1 } } }] },
    });
    mockSessionsCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/rn_5y" });

    const req = { user: { id: 1 }, body: { period: "5y" } };
    const res = mockRes();

    await stripeController.renewNow(req, res);

    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ months: "60" }),
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              unit_amount: 53640,
              product_data: expect.objectContaining({ name: expect.stringMatching(/5 ani/) }),
            }),
          }),
        ],
      }),
    );
  });

  test("period necunoscut ('foo') — cade sigur pe '1m' (€14.90), nu crapă", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: "sub_bad", downgrade_scheduled: false }],
    });
    mockRetrieve.mockResolvedValueOnce({
      items: { data: [{ price: { recurring: { interval: "month", interval_count: 1 } } }] },
    });
    mockSessionsCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/rn_fallback" });

    const req = { user: { id: 1 }, body: { period: "foo" } };
    const res = mockRes();

    await stripeController.renewNow(req, res);

    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ months: "1" }),
        line_items: [
          expect.objectContaining({ price_data: expect.objectContaining({ unit_amount: 1490 }) }),
        ],
      }),
    );
  });

  test("dacă downgrade_scheduled=true, respinge cu 400 și nu creează nicio sesiune Stripe", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: "sub_123", downgrade_scheduled: true }],
    });

    const req = { user: { id: 1 }, body: {} };
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

    const req = { user: { id: 1 }, body: {} };
    const res = mockRes();

    await stripeController.renewNow(req, res);

    expect(mockRetrieve).not.toHaveBeenCalled();
    expect(mockSessionsCreate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("dacă verificarea abonamentului eșuează (eroare Stripe la retrieve), returnează 500 și nu creează nicio sesiune", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ stripe_subscription_id: "sub_123", downgrade_scheduled: false }],
    });
    mockRetrieve.mockRejectedValueOnce(new Error("Stripe API is down"));

    const req = { user: { id: 1 }, body: {} };
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

    const req = { user: { id: 1 }, body: {} };
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

  test("months:'1' — noul current_period_end = VECHIUL current_period_end + 1 lună (nu azi + 1 lună)", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "1",
          metadata: { userId: "1", flow: "renew-now", months: "1" },
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

  // Universalitate: months:'12' pe un abonament LUNAR (nu anual) tot extinde
  // cu 12 luni (1 an) — dovedește că extensia depinde STRICT de metadata.months
  // (alegerea userului din dropdown), NU de intervalul curent al abonamentului
  // Stripe. Comportamentul vechi (adaptiv la subscription.items.price.recurring)
  // a fost înlocuit explicit azi, la cererea userului.
  test("months:'12' pe abonament LUNAR — extinde tot cu 12 luni (1 an), indiferent de intervalul abonamentului", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "1",
          metadata: { userId: "1", flow: "renew-now", months: "12" },
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
    expect(updateParams[1].toISOString()).toBe("2027-09-20T09:00:00.000Z");
  });

  test("months:'36' (3 ani) — extinde corect peste mai mulți ani", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "1",
          metadata: { userId: "1", flow: "renew-now", months: "36" },
        },
      },
    });

    pool.query
      .mockResolvedValueOnce({
        rows: [{ stripe_subscription_id: "sub_3y", renewal_extension_period_end: null }],
      })
      .mockResolvedValueOnce({ rows: [] });

    mockRetrieve.mockResolvedValueOnce({
      current_period_end: Math.floor(new Date("2026-09-20T09:00:00.000Z").getTime() / 1000),
      items: { data: [{ price: { recurring: { interval: "month", interval_count: 1 } } }] },
    });

    const req = {
      headers: { "stripe-signature": "sig" },
      body: Buffer.from("{}"),
    };
    const res = mockRes();

    await stripeController.handleWebhook(req, res);

    const [, updateParams] = pool.query.mock.calls[1];
    expect(updateParams[1].toISOString()).toBe("2029-09-20T09:00:00.000Z");
  });

  test("fără metadata.months (sesiune veche, dinainte de dropdown) — cade sigur pe 1 lună", async () => {
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
        rows: [{ stripe_subscription_id: "sub_legacy", renewal_extension_period_end: null }],
      })
      .mockResolvedValueOnce({ rows: [] });

    mockRetrieve.mockResolvedValueOnce({
      current_period_end: Math.floor(new Date("2026-09-20T09:00:00.000Z").getTime() / 1000),
      items: { data: [{ price: { recurring: { interval: "month", interval_count: 1 } } }] },
    });

    const req = {
      headers: { "stripe-signature": "sig" },
      body: Buffer.from("{}"),
    };
    const res = mockRes();

    await stripeController.handleWebhook(req, res);

    const [, updateParams] = pool.query.mock.calls[1];
    expect(updateParams[1].toISOString()).toBe("2026-10-20T09:00:00.000Z");
  });

  test("dacă există deja o extensie locală mai târzie decât data brută din Stripe, extensiile se cumulează (pornește de la extensia existentă, nu de la valoarea brută)", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "1",
          metadata: { userId: "1", flow: "renew-now", months: "1" },
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

describe("handleWebhook — checkout.session.completed (flow: grace-period-upgrade)", () => {
  // "Upgrade la Pro" apăsat în grace period (users.plan deja 'free',
  // downgrade_scheduled=true) — la fel ca renew-now, calculul noii date
  // pleacă din VECHIUL current_period_end + 1 interval, NU din "azi". În plus
  // față de renew-now: anulează efectiv downgrade-ul programat pe abonamentul
  // Stripe (cancel_at_period_end:false — altfel userul ar pierde accesul
  // oricum la data originală de expirare, în ciuda plății tocmai făcute) și
  // restaurează users.plan='pro' + downgrade_scheduled=false.
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-24T09:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("calculează noul current_period_end = vechiul + 1 lună (months implicit), anulează downgrade-ul pe Stripe și restaurează plan='pro'", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "1",
          metadata: { userId: "1", flow: "grace-period-upgrade", months: "1" },
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

    mockRetrieve.mockResolvedValueOnce({
      current_period_end: Math.floor(new Date("2026-09-20T09:00:00.000Z").getTime() / 1000),
      items: {
        data: [{ price: { recurring: { interval: "month", interval_count: 1 } } }],
      },
    });
    mockUpdate.mockResolvedValueOnce({ id: "sub_123" });

    const req = {
      headers: { "stripe-signature": "sig" },
      body: Buffer.from("{}"),
    };
    const res = mockRes();

    await stripeController.handleWebhook(req, res);

    expect(mockRetrieve).toHaveBeenCalledWith("sub_123");
    expect(mockUpdate).toHaveBeenCalledWith("sub_123", {
      cancel_at_period_end: false,
    });

    expect(pool.query).toHaveBeenCalledTimes(2);
    const [updateSql, updateParams] = pool.query.mock.calls[1];
    expect(updateSql).toMatch(/UPDATE\s+users/i);
    expect(updateSql).toMatch(/plan\s*=\s*'pro'/i);
    expect(updateSql).toMatch(/downgrade_scheduled\s*=\s*false/i);
    expect(updateSql).toMatch(/renewal_extension_period_end\s*=\s*\$2/i);
    expect(updateParams[0]).toBe("1");
    expect(updateParams[1].toISOString()).toBe("2026-10-20T09:00:00.000Z");
    // Guard explicit — NU trebuie să fie "azi + 1 lună".
    expect(updateParams[1].toISOString()).not.toBe("2026-09-24T09:00:00.000Z");

    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  test("fără stripe_subscription_id pentru user, doar loghează — nu apelează Stripe, răspunde tot 200", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "1",
          metadata: { userId: "1", flow: "grace-period-upgrade" },
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
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({ received: true });

    consoleErrSpy.mockRestore();
  });

  // Bug găsit live ieri: userul selecta Anual pe toggle-ul din erp-plans.html,
  // dar reactivarea din grace period rămânea mereu pe intervalul VECHI al
  // abonamentului (Lunar), ignorând complet alegerea. Fix: metadata.interval
  // (scris la crearea sesiunii) e citit aici; dacă diferă de intervalul
  // curent al item-ului din abonament, schimbă și prețul abonamentului
  // (același mecanism ca switchToYearly/switchToMonthly: proration_behavior:
  // 'none', fără taxare suplimentară), în ACELAȘI apel subscriptions.update
  // care anulează downgrade-ul programat.
  //
  // Decuplare deliberată, azi: `interval` decide DOAR dacă se schimbă prețul
  // abonamentului de bază — NU mai influențează câte luni se extinde
  // renewal_extension_period_end (asta vine STRICT din metadata.months,
  // dropdown-ul cu 5 opțiuni, la fel ca la renew-now). Ieri cele două erau
  // cuplate (alegerea de interval determina implicit "+1 unitate din acel
  // interval"); azi sunt complet independente — vezi testul de combinare
  // de mai jos, care le verifică pe amândouă simultan.
  test("interval ales ('year') diferă de intervalul curent al abonamentului ('month') — schimbă și prețul abonamentului; data urmează STRICT months (implicit 1 lună), nu intervalul", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "1",
          metadata: { userId: "1", flow: "grace-period-upgrade", interval: "year", months: "1" },
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

    mockRetrieve.mockResolvedValueOnce({
      current_period_end: Math.floor(new Date("2026-09-20T09:00:00.000Z").getTime() / 1000),
      items: {
        data: [
          {
            id: "si_123",
            price: { recurring: { interval: "month", interval_count: 1 } },
          },
        ],
      },
    });
    mockUpdate.mockResolvedValueOnce({ id: "sub_123" });

    const req = {
      headers: { "stripe-signature": "sig" },
      body: Buffer.from("{}"),
    };
    const res = mockRes();

    await stripeController.handleWebhook(req, res);

    expect(mockUpdate).toHaveBeenCalledWith("sub_123", {
      cancel_at_period_end: false,
      items: [{ id: "si_123", price: "price_test_yearly" }],
      proration_behavior: "none",
    });

    const [, updateParams] = pool.query.mock.calls[1];
    // Doar +1 lună (months:'1'), NU +1 an — deși interval='year' a schimbat prețul abonamentului.
    expect(updateParams[1].toISOString()).toBe("2026-10-20T09:00:00.000Z");

    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

  test("interval='year' ȘI months='12' combinate — schimbă prețul abonamentului ȘI extinde cu 12 luni, cele două axe funcționează simultan", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "1",
          metadata: { userId: "1", flow: "grace-period-upgrade", interval: "year", months: "12" },
        },
      },
    });

    pool.query
      .mockResolvedValueOnce({
        rows: [{ stripe_subscription_id: "sub_combo", renewal_extension_period_end: null }],
      })
      .mockResolvedValueOnce({ rows: [] });

    mockRetrieve.mockResolvedValueOnce({
      current_period_end: Math.floor(new Date("2026-09-20T09:00:00.000Z").getTime() / 1000),
      items: {
        data: [{ id: "si_combo", price: { recurring: { interval: "month", interval_count: 1 } } }],
      },
    });
    mockUpdate.mockResolvedValueOnce({ id: "sub_combo" });

    const req = {
      headers: { "stripe-signature": "sig" },
      body: Buffer.from("{}"),
    };
    const res = mockRes();

    await stripeController.handleWebhook(req, res);

    expect(mockUpdate).toHaveBeenCalledWith("sub_combo", {
      cancel_at_period_end: false,
      items: [{ id: "si_combo", price: "price_test_yearly" }],
      proration_behavior: "none",
    });

    const [, updateParams] = pool.query.mock.calls[1];
    expect(updateParams[1].toISOString()).toBe("2027-09-20T09:00:00.000Z");
  });

  test("interval ales ('month') coincide cu intervalul curent al abonamentului — NU trimite items/proration_behavior, doar anulează downgrade-ul", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "1",
          metadata: { userId: "1", flow: "grace-period-upgrade", interval: "month", months: "1" },
        },
      },
    });

    pool.query
      .mockResolvedValueOnce({
        rows: [
          { stripe_subscription_id: "sub_123", renewal_extension_period_end: null },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    mockRetrieve.mockResolvedValueOnce({
      current_period_end: Math.floor(new Date("2026-09-20T09:00:00.000Z").getTime() / 1000),
      items: {
        data: [
          {
            id: "si_123",
            price: { recurring: { interval: "month", interval_count: 1 } },
          },
        ],
      },
    });
    mockUpdate.mockResolvedValueOnce({ id: "sub_123" });

    const req = {
      headers: { "stripe-signature": "sig" },
      body: Buffer.from("{}"),
    };
    const res = mockRes();

    await stripeController.handleWebhook(req, res);

    expect(mockUpdate).toHaveBeenCalledWith("sub_123", {
      cancel_at_period_end: false,
    });

    const [, updateParams] = pool.query.mock.calls[1];
    expect(updateParams[1].toISOString()).toBe("2026-10-20T09:00:00.000Z");
  });

  test("metadata.months='6' fără schimbare de interval — extinde cu 6 luni (period='6m' din dropdown)", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "1",
          metadata: { userId: "1", flow: "grace-period-upgrade", interval: "month", months: "6" },
        },
      },
    });

    pool.query
      .mockResolvedValueOnce({
        rows: [{ stripe_subscription_id: "sub_6m", renewal_extension_period_end: null }],
      })
      .mockResolvedValueOnce({ rows: [] });

    mockRetrieve.mockResolvedValueOnce({
      current_period_end: Math.floor(new Date("2026-09-20T09:00:00.000Z").getTime() / 1000),
      items: {
        data: [{ id: "si_6m", price: { recurring: { interval: "month", interval_count: 1 } } }],
      },
    });
    mockUpdate.mockResolvedValueOnce({ id: "sub_6m" });

    const req = {
      headers: { "stripe-signature": "sig" },
      body: Buffer.from("{}"),
    };
    const res = mockRes();

    await stripeController.handleWebhook(req, res);

    expect(mockUpdate).toHaveBeenCalledWith("sub_6m", { cancel_at_period_end: false });

    const [, updateParams] = pool.query.mock.calls[1];
    expect(updateParams[1].toISOString()).toBe("2027-03-20T09:00:00.000Z");
  });

  test("metadata.interval ȘI months lipsă (sesiune veche, dinainte de dropdown) — cade sigur pe intervalul curent al abonamentului, fără schimbare de preț", async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "1",
          metadata: { userId: "1", flow: "grace-period-upgrade" },
        },
      },
    });

    pool.query
      .mockResolvedValueOnce({
        rows: [
          { stripe_subscription_id: "sub_123", renewal_extension_period_end: null },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    mockRetrieve.mockResolvedValueOnce({
      current_period_end: Math.floor(new Date("2026-09-20T09:00:00.000Z").getTime() / 1000),
      items: {
        data: [
          {
            id: "si_123",
            price: { recurring: { interval: "year", interval_count: 1 } },
          },
        ],
      },
    });
    mockUpdate.mockResolvedValueOnce({ id: "sub_123" });

    const req = {
      headers: { "stripe-signature": "sig" },
      body: Buffer.from("{}"),
    };
    const res = mockRes();

    await stripeController.handleWebhook(req, res);

    expect(mockUpdate).toHaveBeenCalledWith("sub_123", {
      cancel_at_period_end: false,
    });

    const [, updateParams] = pool.query.mock.calls[1];
    // Fără months, cade pe intervalul curent al abonamentului (aici 'year' din mock) — +1 an.
    expect(updateParams[1].toISOString()).toBe("2027-09-20T09:00:00.000Z");
  });
});
