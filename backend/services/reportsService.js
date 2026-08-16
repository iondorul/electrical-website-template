const db = require("../config/db");

// "Invoiced"/"Outstanding"/"Overdue" exclud facturile draft (nu au fost încă
// emise către client) și canceled (anulate, nu reprezintă bani reali).
const BILLABLE_STATUSES = ["issued", "partially_paid", "paid", "overdue"];
const OPEN_STATUSES = ["issued", "partially_paid", "overdue"];

function buildDateFilter(column, from, to, params) {
  let clause = "";
  if (from) {
    params.push(from);
    clause += ` AND ${column} >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    clause += ` AND ${column} <= $${params.length}`;
  }
  return clause;
}

class ReportsService {
  // --- TAB 1: Financial ---
  // Invoiced = suma facturilor emise (nu draft, nu canceled) din perioadă.
  // Paid = suma reală încasată (invoices.paid_amount, alimentat de fluxul
  // Record Payment) — nu o aproximare pe bază de status.
  // Outstanding = Invoiced - Paid, pentru facturile încă deschise.
  // Overdue = calculat din due_date < azi, nu din statusul manual "overdue"
  // (statusul poate fi neactualizat; due_date e un fapt verificabil).
  static async getFinancialSummary(userId, { from, to, clientId, projectId }) {
    const params = [userId];
    let where = `WHERE i.created_by = $1 AND i.is_active = true`;
    where += buildDateFilter("i.issue_date", from, to, params);
    if (clientId) {
      params.push(clientId);
      where += ` AND i.client_id = $${params.length}`;
    }
    if (projectId) {
      params.push(projectId);
      where += ` AND i.project_id = $${params.length}`;
    }

    const billableList = BILLABLE_STATUSES.map((s) => `'${s}'`).join(",");
    const openList = OPEN_STATUSES.map((s) => `'${s}'`).join(",");

    const query = `
      SELECT
        COALESCE(SUM(total_gross) FILTER (WHERE status IN (${billableList})), 0) AS invoiced,
        COALESCE(SUM(paid_amount) FILTER (WHERE status IN (${billableList})), 0) AS paid,
        COALESCE(SUM(GREATEST(total_gross - paid_amount, 0)) FILTER (WHERE status IN (${openList})), 0) AS outstanding,
        COALESCE(SUM(GREATEST(total_gross - paid_amount, 0)) FILTER (
          WHERE status IN (${openList}) AND due_date < CURRENT_DATE
        ), 0) AS overdue
      FROM invoices i
      ${where}
    `;
    const result = await db.query(query, params);
    return result.rows[0];
  }

  // Serie temporală lunară: facturat (issue_date) vs. încasat (payment_date
  // real din tabela payments) — pentru graficul "venituri vs. încasări".
  static async getFinancialTimeseries(userId, { from, to, clientId, projectId }) {
    const invoicedParams = [userId];
    let invoicedWhere = `WHERE i.created_by = $1 AND i.is_active = true AND i.status <> 'draft' AND i.status <> 'canceled'`;
    invoicedWhere += buildDateFilter("i.issue_date", from, to, invoicedParams);
    if (clientId) {
      invoicedParams.push(clientId);
      invoicedWhere += ` AND i.client_id = $${invoicedParams.length}`;
    }
    if (projectId) {
      invoicedParams.push(projectId);
      invoicedWhere += ` AND i.project_id = $${invoicedParams.length}`;
    }

    const invoicedQuery = `
      SELECT to_char(date_trunc('month', i.issue_date), 'YYYY-MM') AS period,
             SUM(i.total_gross) AS amount
      FROM invoices i
      ${invoicedWhere}
      GROUP BY 1
      ORDER BY 1
    `;

    const paidParams = [userId];
    let paidWhere = `WHERE i.created_by = $1 AND i.is_active = true`;
    paidWhere += buildDateFilter("p.payment_date", from, to, paidParams);
    if (clientId) {
      paidParams.push(clientId);
      paidWhere += ` AND i.client_id = $${paidParams.length}`;
    }
    if (projectId) {
      paidParams.push(projectId);
      paidWhere += ` AND i.project_id = $${paidParams.length}`;
    }

    const paidQuery = `
      SELECT to_char(date_trunc('month', p.payment_date), 'YYYY-MM') AS period,
             SUM(p.amount) AS amount
      FROM payments p
      JOIN invoices i ON p.invoice_id = i.id
      ${paidWhere}
      GROUP BY 1
      ORDER BY 1
    `;

    const [invoicedRes, paidRes] = await Promise.all([
      db.query(invoicedQuery, invoicedParams),
      db.query(paidQuery, paidParams),
    ]);

    const periods = new Set([
      ...invoicedRes.rows.map((r) => r.period),
      ...paidRes.rows.map((r) => r.period),
    ]);
    const invoicedMap = Object.fromEntries(
      invoicedRes.rows.map((r) => [r.period, parseFloat(r.amount)]),
    );
    const paidMap = Object.fromEntries(
      paidRes.rows.map((r) => [r.period, parseFloat(r.amount)]),
    );

    return Array.from(periods)
      .sort()
      .map((period) => ({
        period,
        invoiced: invoicedMap[period] || 0,
        paid: paidMap[period] || 0,
      }));
  }

  // --- TAB 2: Projects ---
  // Cost materiale/labor vine STRICT din estimarea asociată proiectului
  // (cea mai recentă aprobată, sau cea mai recentă dacă nu există una
  // aprobată) — reflectă planificarea inițială, nu neapărat costul final
  // dacă oferta/factura au fost modificate ulterior. Marcat explicit
  // "sourceLabel: estimate" ca frontend-ul să eticheteze clar cifra.
  static async getProjectsReport(userId, { from, to, clientId }) {
    const params = [userId];
    let where = `WHERE p.created_by = $1 AND p.is_active = true`;
    where += buildDateFilter("p.start_date", from, to, params);
    if (clientId) {
      params.push(clientId);
      where += ` AND p.client_id = $${params.length}`;
    }

    const query = `
      SELECT
        p.id, p.project_number, p.project_name, p.status,
        p.estimated_value, p.actual_value, p.currency,
        p.start_date, p.end_date, p.completion_date,
        c.company_name AS client_name,
        est.id AS estimate_id,
        est.status AS estimate_status,
        est.total_materials_cost,
        est.total_labor_cost,
        est.grand_total AS estimate_grand_total
      FROM projects p
      LEFT JOIN clients c ON p.client_id = c.id
      LEFT JOIN LATERAL (
        SELECT e.*
        FROM estimates e
        WHERE e.project_id = p.id AND e.is_active = true
        ORDER BY (e.status = 'approved') DESC, e.created_at DESC
        LIMIT 1
      ) est ON true
      ${where}
      ORDER BY p.created_at DESC
    `;
    const result = await db.query(query, params);

    return result.rows.map((row) => {
      const materialsCost = row.total_materials_cost
        ? parseFloat(row.total_materials_cost)
        : null;
      const laborCost = row.total_labor_cost
        ? parseFloat(row.total_labor_cost)
        : null;
      const projectValue =
        row.actual_value != null
          ? parseFloat(row.actual_value)
          : row.estimated_value != null
            ? parseFloat(row.estimated_value)
            : null;

      const hasCostData = materialsCost != null && laborCost != null;
      const profit =
        hasCostData && projectValue != null
          ? projectValue - materialsCost - laborCost
          : null;

      return {
        id: row.id,
        project_number: row.project_number,
        project_name: row.project_name,
        status: row.status,
        client_name: row.client_name,
        currency: row.currency,
        estimated_value: row.estimated_value,
        actual_value: row.actual_value,
        project_value: projectValue,
        materials_cost: materialsCost,
        labor_cost: laborCost,
        profit,
        cost_source: row.estimate_id ? "estimate" : null,
      };
    });
  }

  // --- TAB 3: Materials ---
  // "Consum" e calculat STRICT din estimate_items (singurul loc cu legătură
  // reală material_id → material). quote_items/invoice_items nu au
  // material_id, deci nu pot reflecta consumul real facturat — etichetat
  // explicit "planificat din estimări", nu "consum real".
  static async getMaterialsReport(userId, { from, to }) {
    const params = [userId];
    let usageWhere = `WHERE m.created_by = $1 AND m.is_active = true`;
    let usageDateFilter = "";
    if (from || to) {
      usageDateFilter = buildDateFilter("ei.created_at", from, to, params);
    }

    const query = `
      SELECT
        m.id, m.item_code, m.name, m.category, m.unit_of_measure,
        m.unit_price, m.stock_quantity, m.min_stock,
        (m.stock_quantity * m.unit_price) AS inventory_value,
        COALESCE(usage.total_quantity, 0) AS planned_usage_quantity,
        COALESCE(usage.total_cost, 0) AS planned_usage_cost
      FROM materials m
      LEFT JOIN LATERAL (
        SELECT SUM(ei.quantity) AS total_quantity, SUM(ei.total_price) AS total_cost
        FROM estimate_items ei
        JOIN estimates e ON ei.estimate_id = e.id
        WHERE ei.material_id = m.id AND e.is_active = true ${usageDateFilter}
      ) usage ON true
      ${usageWhere}
      ORDER BY m.name ASC
    `;
    const result = await db.query(query, params);

    return result.rows.map((row) => ({
      ...row,
      low_stock: parseFloat(row.stock_quantity) <= parseFloat(row.min_stock || 0),
    }));
  }

  // --- TAB 4: Clients ---
  // Valoare proiecte = all-time (nu filtrată pe date), fiindcă e o cifră de
  // profil client, nu una tranzacțională. Facturat/încasat/outstanding SUNT
  // filtrate pe perioada selectată (issue_date).
  static async getClientsReport(userId, { from, to }) {
    const invoiceParams = [userId];
    let invoiceDateFilter = buildDateFilter(
      "i.issue_date",
      from,
      to,
      invoiceParams,
    );

    const query = `
      SELECT
        c.id, c.company_name, c.email,
        COUNT(DISTINCT p.id) AS project_count,
        COALESCE(SUM(COALESCE(p.actual_value, p.estimated_value, 0)), 0) AS projects_value,
        COALESCE(inv.invoiced, 0) AS invoiced,
        COALESCE(inv.paid, 0) AS paid
      FROM clients c
      LEFT JOIN projects p ON p.client_id = c.id AND p.is_active = true
      LEFT JOIN (
        SELECT i.client_id,
               SUM(i.total_gross) FILTER (WHERE i.status IN (${BILLABLE_STATUSES.map((s) => `'${s}'`).join(",")})) AS invoiced,
               SUM(i.paid_amount) FILTER (WHERE i.status IN (${BILLABLE_STATUSES.map((s) => `'${s}'`).join(",")})) AS paid
        FROM invoices i
        WHERE i.created_by = $1 AND i.is_active = true ${invoiceDateFilter}
        GROUP BY i.client_id
      ) inv ON inv.client_id = c.id
      WHERE c.user_id = $1
      GROUP BY c.id, c.email, inv.invoiced, inv.paid
      ORDER BY c.company_name ASC
    `;
    const result = await db.query(query, invoiceParams);

    return result.rows.map((row) => {
      const invoiced = parseFloat(row.invoiced) || 0;
      const paid = parseFloat(row.paid) || 0;
      return {
        id: row.id,
        company_name: row.company_name,
        email: row.email,
        project_count: parseInt(row.project_count, 10),
        projects_value: parseFloat(row.projects_value) || 0,
        invoiced,
        paid,
        outstanding: Math.max(invoiced - paid, 0),
      };
    });
  }
}

module.exports = ReportsService;
