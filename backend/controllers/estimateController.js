const EstimateService = require("../services/estimateService");
const { Errors } = require("../constants");

const ALLOWED_STATUSES = [
  "draft",
  "planned",
  "in_progress",
  "on_hold",
  "completed",
  "cancelled",
  "converted",
];

class EstimateController {
  static async getAll(req, res) {
    try {
      const userId = req.user.id;
      const result = await EstimateService.getAllEstimates(userId, req.query);
      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (err) {
      console.error("Error in EstimateController.getAll:", err);
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: "Server error while retrieving estimates.",
      });
    }
  }

  static async getById(req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const estimate = await EstimateService.getEstimateById(id, userId);

      if (!estimate) {
        return res.status(404).json({
          success: false,
          error: Errors.ESTIMATE_NOT_FOUND,
          message: "Estimate not found.",
        });
      }

      return res.status(200).json({ success: true, data: estimate });
    } catch (err) {
      console.error("Error in EstimateController.getById:", err);
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: "Server error while retrieving the estimate.",
      });
    }
  }

  static async create(req, res) {
    try {
      const userId = req.user.id;
      const { title, client_id, status, items } = req.body;

      if (!title || typeof title !== "string" || title.trim() === "") {
        return res.status(400).json({
          success: false,
          error: Errors.ESTIMATE_TITLE_REQUIRED,
          message: "Estimate title is required.",
        });
      }

      if (!client_id || isNaN(parseInt(client_id, 10))) {
        return res.status(400).json({
          success: false,
          error: Errors.ESTIMATE_INVALID_CLIENT,
          message: "The selected client is invalid.",
        });
      }

      if (status && !ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          error: Errors.ESTIMATE_INVALID_STATUS,
          message: `Invalid status. Allowed values: ${ALLOWED_STATUSES.join(", ")}`,
        });
      }

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          error: Errors.ESTIMATE_NO_ITEMS,
          message: "The estimate must contain at least one line.",
        });
      }

      for (const [idx, item] of items.entries()) {
        if (!item.description || item.description.trim() === "") {
          return res.status(400).json({
            success: false,
            error: Errors.ESTIMATE_ITEM_DESCRIPTION_REQUIRED,
            message: `Description of line #${idx + 1} is required.`,
            data: { itemIndex: idx + 1 },
          });
        }
        if (parseFloat(item.quantity) <= 0) {
          return res.status(400).json({
            success: false,
            error: Errors.ESTIMATE_ITEM_QUANTITY_INVALID,
            message: `Quantity of line #${idx + 1} must be greater than 0.`,
            data: { itemIndex: idx + 1 },
          });
        }
        if (parseFloat(item.unit_cost) < 0) {
          return res.status(400).json({
            success: false,
            error: Errors.ESTIMATE_ITEM_UNIT_COST_INVALID,
            message: `Unit cost of line #${idx + 1} cannot be negative.`,
            data: { itemIndex: idx + 1 },
          });
        }
        if (parseFloat(item.margin_percent) < 0) {
          return res.status(400).json({
            success: false,
            error: Errors.ESTIMATE_ITEM_MARGIN_INVALID,
            message: `Margin of line #${idx + 1} cannot be negative.`,
            data: { itemIndex: idx + 1 },
          });
        }
      }

      const newEstimate = await EstimateService.createEstimate(
        userId,
        req.body,
      );
      return res.status(201).json({
        success: true,
        message: "Estimate saved successfully!",
        data: newEstimate,
      });
    } catch (err) {
      console.error("Error in EstimateController.create:", err);
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: "Server error while saving the estimate.",
      });
    }
  }

  static async update(req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { title, client_id, status, items } = req.body;

      if (!title || typeof title !== "string" || title.trim() === "") {
        return res.status(400).json({
          success: false,
          error: Errors.ESTIMATE_TITLE_REQUIRED,
          message: "Estimate title is required.",
        });
      }

      if (!client_id || isNaN(parseInt(client_id, 10))) {
        return res.status(400).json({
          success: false,
          error: Errors.ESTIMATE_INVALID_CLIENT,
          message: "The selected client is invalid.",
        });
      }

      if (status && !ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          error: Errors.ESTIMATE_INVALID_STATUS,
          message: `Invalid status. Allowed values: ${ALLOWED_STATUSES.join(", ")}`,
        });
      }

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          error: Errors.ESTIMATE_NO_ITEMS,
          message: "The estimate must contain at least one line.",
        });
      }

      for (const [idx, item] of items.entries()) {
        if (!item.description || item.description.trim() === "") {
          return res.status(400).json({
            success: false,
            error: Errors.ESTIMATE_ITEM_DESCRIPTION_REQUIRED,
            message: `Description of line #${idx + 1} is required.`,
            data: { itemIndex: idx + 1 },
          });
        }
        if (parseFloat(item.quantity) <= 0) {
          return res.status(400).json({
            success: false,
            error: Errors.ESTIMATE_ITEM_QUANTITY_INVALID,
            message: `Quantity of line #${idx + 1} must be greater than 0.`,
            data: { itemIndex: idx + 1 },
          });
        }
        if (parseFloat(item.unit_cost) < 0) {
          return res.status(400).json({
            success: false,
            error: Errors.ESTIMATE_ITEM_UNIT_COST_INVALID,
            message: `Unit cost of line #${idx + 1} cannot be negative.`,
            data: { itemIndex: idx + 1 },
          });
        }
        if (parseFloat(item.margin_percent) < 0) {
          return res.status(400).json({
            success: false,
            error: Errors.ESTIMATE_ITEM_MARGIN_INVALID,
            message: `Margin of line #${idx + 1} cannot be negative.`,
            data: { itemIndex: idx + 1 },
          });
        }
      }

      const updatedEstimate = await EstimateService.updateEstimate(
        id,
        userId,
        req.body,
      );

      if (!updatedEstimate) {
        return res.status(404).json({
          success: false,
          error: Errors.ESTIMATE_UPDATE_NOT_FOUND,
          message: "Estimate not found or the update failed.",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Estimate updated successfully!",
        data: updatedEstimate,
      });
    } catch (err) {
      console.error("Error in EstimateController.update:", err);
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: "Server error while updating the estimate.",
      });
    }
  }

  static async delete(req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const deleted = await EstimateService.softDeleteEstimate(id, userId);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: Errors.ESTIMATE_ALREADY_ARCHIVED,
          message: "Estimate not found or already archived.",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Estimate archived successfully!",
      });
    } catch (err) {
      console.error("Error in EstimateController.delete:", err);
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: "Server error while archiving the estimate.",
      });
    }
  }
}

module.exports = EstimateController;
