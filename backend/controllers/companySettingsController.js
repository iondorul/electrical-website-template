const CompanySettingsService = require("../services/companySettingsService");
const { Errors } = require("../constants");

class CompanySettingsController {
  static async get(req, res) {
    try {
      const settings = await CompanySettingsService.getByUserId(req.user.id);
      return res.status(200).json({ success: true, data: settings });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: error.message,
      });
    }
  }

  static async update(req, res) {
    try {
      const { company_name } = req.body;

      if (!company_name || !company_name.trim()) {
        return res.status(400).json({
          success: false,
          error: Errors.MISSING_REQUIRED_FIELDS,
          message: "Numele firmei este obligatoriu.",
        });
      }

      const settings = await CompanySettingsService.upsert(
        req.user.id,
        req.body,
      );

      return res.status(200).json({ success: true, data: settings });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: error.message,
      });
    }
  }
}

module.exports = CompanySettingsController;
