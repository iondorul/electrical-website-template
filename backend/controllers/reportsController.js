const db = require("../config/db");
const ReportsService = require("../services/reportsService");
const ReportArchiveService = require("../services/reportArchiveService");
const { generateReportPdf } = require("../services/reportPdfService");
const CompanySettingsService = require("../services/companySettingsService");
const { Errors } = require("../constants");

const VALID_REPORT_TYPES = ["financial", "projects", "materials", "clients"];

function buildReportName(reportType, filters) {
  const typeLabels = {
    financial: "Financial",
    projects: "Projects",
    materials: "Materials",
    clients: "Clients",
  };
  const label = typeLabels[reportType] || reportType;

  let periodLabel;
  if (filters.from && filters.to) {
    const fromD = new Date(filters.from);
    const toD = new Date(filters.to);
    const sameMonth =
      fromD.getFullYear() === toD.getFullYear() &&
      fromD.getMonth() === toD.getMonth();
    if (sameMonth) {
      periodLabel = fromD.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
    } else {
      const fmt = (d) =>
        d.toLocaleDateString("en-US", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
      periodLabel = `${fmt(fromD)} - ${fmt(toD)}`;
    }
  } else {
    periodLabel = "All Time";
  }

  return `${label} Report – ${periodLabel}`;
}

async function resolveFilterLabels(filters) {
  const labels = {};
  if (filters.clientId) {
    const res = await db.query(
      `SELECT company_name FROM clients WHERE id = $1`,
      [filters.clientId],
    );
    labels.clientLabel = res.rows[0]?.company_name || null;
  }
  if (filters.projectId) {
    const res = await db.query(
      `SELECT project_name FROM projects WHERE id = $1`,
      [filters.projectId],
    );
    labels.projectLabel = res.rows[0]?.project_name || null;
  }
  return labels;
}

function parseFilters(query) {
  const filters = {};
  if (query.from) filters.from = query.from;
  if (query.to) filters.to = query.to;
  if (query.client_id) {
    const clientId = parseInt(query.client_id, 10);
    if (Number.isInteger(clientId) && clientId > 0) filters.clientId = clientId;
  }
  if (query.project_id) {
    const projectId = parseInt(query.project_id, 10);
    if (Number.isInteger(projectId) && projectId > 0)
      filters.projectId = projectId;
  }
  return filters;
}

class ReportsController {
  static async financial(req, res) {
    try {
      const filters = parseFilters(req.query);
      const [summary, timeseries] = await Promise.all([
        ReportsService.getFinancialSummary(req.user.id, filters),
        ReportsService.getFinancialTimeseries(req.user.id, filters),
      ]);
      return res.status(200).json({
        success: true,
        data: { summary, timeseries },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: error.message,
      });
    }
  }

  static async projects(req, res) {
    try {
      const filters = parseFilters(req.query);
      const data = await ReportsService.getProjectsReport(req.user.id, filters);
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: error.message,
      });
    }
  }

  static async materials(req, res) {
    try {
      const filters = parseFilters(req.query);
      const data = await ReportsService.getMaterialsReport(req.user.id, filters);
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: error.message,
      });
    }
  }

  static async clients(req, res) {
    try {
      const filters = parseFilters(req.query);
      const data = await ReportsService.getClientsReport(req.user.id, filters);
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: error.message,
      });
    }
  }

  // POST /reports/generate-pdf — generează PDF-ul, îl persistă în arhivă
  // (bytea, snapshot al datelor din acest moment) și returnează metadatele.
  // Corpul PDF-ului se preia ulterior prin GET /history/:id/download —
  // identic pentru "deschide acum" și "redeschide din arhivă mai târziu".
  static async generatePdf(req, res) {
    try {
      const reportType = req.body.report_type;
      if (!VALID_REPORT_TYPES.includes(reportType)) {
        return res.status(400).json({
          success: false,
          error: Errors.INVALID_REPORT_TYPE,
          message: `report_type trebuie să fie unul dintre: ${VALID_REPORT_TYPES.join(", ")}.`,
        });
      }

      const filters = parseFilters(req.body);
      const labels = await resolveFilterLabels(filters);

      let data;
      if (reportType === "financial") {
        const [summary, timeseries] = await Promise.all([
          ReportsService.getFinancialSummary(req.user.id, filters),
          ReportsService.getFinancialTimeseries(req.user.id, filters),
        ]);
        data = { summary, timeseries };
      } else if (reportType === "projects") {
        data = await ReportsService.getProjectsReport(req.user.id, filters);
      } else if (reportType === "materials") {
        data = await ReportsService.getMaterialsReport(req.user.id, filters);
      } else if (reportType === "clients") {
        data = await ReportsService.getClientsReport(req.user.id, filters);
      }

      const company = await CompanySettingsService.getByUserId(req.user.id);
      const reportName = buildReportName(reportType, filters);

      const pdfBuffer = await generateReportPdf({
        reportType,
        reportName,
        filters: { ...filters, ...labels },
        data,
        company,
      });

      const fileName = `${reportName.replace(/[^\w\- ]/g, "")}.pdf`;

      const archived = await ReportArchiveService.create(req.user.id, {
        reportType,
        reportName,
        filters: { ...filters, ...labels },
        fileName,
        fileBuffer: pdfBuffer,
      });

      return res.status(201).json({ success: true, data: archived });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: error.message,
      });
    }
  }

  // GET /reports/history — listare/căutare/filtrare arhivă
  static async history(req, res) {
    try {
      const { search, report_type, client_id, project_id, from, to } =
        req.query;
      const data = await ReportArchiveService.list(req.user.id, {
        search,
        reportType: report_type,
        clientId: client_id,
        projectId: project_id,
        from,
        to,
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: error.message,
      });
    }
  }

  // DELETE /reports/history/:id — restricționat la rolul Administrator.
  // JWT-ul nu conține rolul (semnat doar cu id+email la login), deci îl
  // verificăm direct din DB — un frontend care ascunde butonul nu e
  // suficient, altfel orice user autentificat ar putea apela endpointul direct.
  static async deleteHistoryItem(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          error: Errors.MISSING_REQUIRED_FIELDS,
          message: "Report ID must be a valid positive integer.",
        });
      }

      const roleRes = await db.query(`SELECT role FROM users WHERE id = $1`, [
        req.user.id,
      ]);
      const role = roleRes.rows[0]?.role;
      if (role !== "Administrator") {
        return res.status(403).json({
          success: false,
          error: Errors.REPORT_DELETE_FORBIDDEN,
          message:
            "Doar utilizatorii cu rol de Administrator pot șterge rapoarte din arhivă.",
        });
      }

      const deleted = await ReportArchiveService.deleteById(id, req.user.id);
      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: Errors.REPORT_NOT_FOUND,
          message: "Raportul nu a fost găsit.",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Raportul a fost șters cu succes.",
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: error.message,
      });
    }
  }

  // GET /reports/history/:id/download
  static async downloadHistoryItem(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          error: Errors.MISSING_REQUIRED_FIELDS,
          message: "Report ID must be a valid positive integer.",
        });
      }

      const report = await ReportArchiveService.getForDownload(
        id,
        req.user.id,
      );
      if (!report) {
        return res.status(404).json({
          success: false,
          error: Errors.REPORT_NOT_FOUND,
          message: "Raportul nu a fost găsit.",
        });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${report.file_name}"`,
      );
      return res.send(report.file_data);
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: error.message,
      });
    }
  }
}

module.exports = ReportsController;
