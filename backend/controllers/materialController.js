const MaterialService = require("../services/materialService");
const { Errors } = require("../constants");

class MaterialController {
  static async getAll(req, res) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const { search, category } = req.query;

      const result = await MaterialService.getAll(req.user.id, {
        page,
        limit,
        search,
        category,
      });

      return res.status(200).json({
        success: true,
        data: result.items,
        pagination: result.pagination,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: error.message,
      });
    }
  }

  static async getById(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          error: Errors.MISSING_REQUIRED_FIELDS,
          message: "Material ID must be a valid positive integer.",
        });
      }

      const material = await MaterialService.getById(id, req.user.id);
      if (!material) {
        return res.status(404).json({
          success: false,
          error: Errors.MATERIAL_NOT_FOUND,
          message: "Material not found.",
        });
      }

      return res.status(200).json({ success: true, data: material });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: error.message,
      });
    }
  }

  static async create(req, res) {
    try {
      const { name, category, unit_of_measure } = req.body;

      if (!name || !category || !unit_of_measure) {
        return res.status(400).json({
          success: false,
          error: Errors.MISSING_REQUIRED_FIELDS,
          message: "name, category și unit_of_measure sunt obligatorii.",
        });
      }

      const material = await MaterialService.create(req.user.id, req.body);
      return res.status(201).json({ success: true, data: material });
    } catch (error) {
      if (error.constraint === "uq_user_item_code") {
        return res.status(409).json({
          success: false,
          error: Errors.MATERIAL_CODE_ALREADY_EXISTS,
          message: "A material with this code already exists for your account.",
        });
      }
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: error.message,
      });
    }
  }

  static async update(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          error: Errors.MISSING_REQUIRED_FIELDS,
          message: "Material ID must be a valid positive integer.",
        });
      }

      const updated = await MaterialService.update(id, req.user.id, req.body);
      if (!updated) {
        return res.status(404).json({
          success: false,
          error: Errors.MATERIAL_NOT_FOUND,
          message: "Material not found.",
        });
      }

      return res.status(200).json({ success: true, data: updated });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: error.message,
      });
    }
  }

  static async delete(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const deleted = await MaterialService.delete(id, req.user.id);
      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: Errors.MATERIAL_NOT_FOUND,
          message: "Material not found.",
        });
      }
      return res.status(200).json({
        success: true,
        code: Errors.MATERIAL_DELETED,
        message: "Material deleted successfully.",
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: error.message,
      });
    }
  }

  static async deleteAll(req, res) {
    try {
      const deletedCount = await MaterialService.deleteAll(req.user.id);
      return res.status(200).json({
        success: true,
        code: Errors.ALL_MATERIALS_DELETED,
        message: "All materials deleted successfully.",
        data: { deletedCount },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: error.message,
      });
    }
  }
}

module.exports = MaterialController;
