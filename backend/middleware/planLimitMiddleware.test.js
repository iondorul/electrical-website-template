jest.mock("../config/db", () => ({
  query: jest.fn(),
}));

jest.mock("jsonwebtoken", () => ({
  verify: jest.fn(),
}));

const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const checkPlanLimit = require("./planLimitMiddleware");

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// users.plan reprezintă STRICT planul ALES de user (Free/Pro), nu starea
// reală Stripe — poate fi 'free' chiar dacă userul mai are acces Pro real,
// în grace period (downgrade programat, dar current_period_end încă
// neatins). Accesul efectiv la facilități Pro trebuie deci decis din
// plan==='pro' SAU downgrade_scheduled===true, NU din plan singur.
describe("checkPlanLimit — acces la facilități Pro, independent de users.plan", () => {
  test("plan='pro' → nelimitat", async () => {
    jwt.verify.mockReturnValueOnce({ id: 1 });
    pool.query.mockResolvedValueOnce({
      rows: [{ plan: "pro", downgrade_scheduled: false }],
    });

    const middleware = checkPlanLimit("clients");
    const req = { method: "POST", headers: { authorization: "Bearer faketoken" } };
    const res = mockRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test("plan='free' dar downgrade_scheduled=true (grace period) → tot nelimitat, chiar dacă users.plan arată 'free'", async () => {
    jwt.verify.mockReturnValueOnce({ id: 1 });
    pool.query.mockResolvedValueOnce({
      rows: [{ plan: "free", downgrade_scheduled: true }],
    });

    const middleware = checkPlanLimit("clients");
    const req = { method: "POST", headers: { authorization: "Bearer faketoken" } };
    const res = mockRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test("plan='free', downgrade_scheduled=false, sub limită → trece mai departe", async () => {
    jwt.verify.mockReturnValueOnce({ id: 1 });
    pool.query
      .mockResolvedValueOnce({ rows: [{ plan: "free", downgrade_scheduled: false }] })
      .mockResolvedValueOnce({ rows: [{ cnt: "1" }] }); // sub limita de 2

    const middleware = checkPlanLimit("clients");
    const req = { method: "POST", headers: { authorization: "Bearer faketoken" } };
    const res = mockRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test("plan='free', downgrade_scheduled=false, la limită → 403 cu mesaj clar", async () => {
    jwt.verify.mockReturnValueOnce({ id: 1 });
    pool.query
      .mockResolvedValueOnce({ rows: [{ plan: "free", downgrade_scheduled: false }] })
      .mockResolvedValueOnce({ rows: [{ cnt: "2" }] }); // la limita de 2

    const middleware = checkPlanLimit("clients");
    const req = { method: "POST", headers: { authorization: "Bearer faketoken" } };
    const res = mockRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });

  test("metodă non-POST → trece mai departe fără nicio verificare DB", async () => {
    const middleware = checkPlanLimit("clients");
    const req = { method: "GET", headers: {} };
    const res = mockRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });

  test("fără token valid → trece mai departe (401 rămâne responsabilitatea authMiddleware din router)", async () => {
    const middleware = checkPlanLimit("clients");
    const req = { method: "POST", headers: {} };
    const res = mockRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });
});
