const QuoteService = require("../services/quoteService");
const { Errors } = require("../constants");

class QuoteController {
  static async create(req, res) {
    try {
      const { estimate_id, valid_until } = req.body;

      if (!estimate_id || !valid_until) {
        return res.status(400).json({
          success: false,
          error: Errors.MISSING_REQUIRED_FIELDS,
          message: "estimate_id and valid_until are required fields.",
        });
      }

      const quote = await QuoteService.createFromEstimate(
        parseInt(estimate_id, 10),
        req.user.id,
        req.body,
      );

      return res.status(201).json({ success: true, data: quote });
    } catch (error) {
      if (error.message === Errors.ESTIMATE_NOT_FOUND) {
        return res.status(404).json({
          success: false,
          error: Errors.ESTIMATE_NOT_FOUND,
          message: "Target estimate does not exist or is inactive.",
        });
      }
      if (error.message === Errors.ESTIMATE_NOT_APPROVED) {
        return res.status(400).json({
          success: false,
          error: Errors.ESTIMATE_NOT_APPROVED,
          message: "Only approved estimates can be converted to quotes.",
        });
      }
      if (error.message === Errors.QUOTE_ALREADY_EXISTS) {
        return res.status(409).json({
          success: false,
          error: Errors.QUOTE_ALREADY_EXISTS,
          message: "A quote has already been created for this estimate.",
        });
      }
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: error.message,
      });
    }
  }

  static async getAll(req, res) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const { search, status } = req.query;

      const result = await QuoteService.getAll(req.user.id, {
        page,
        limit,
        search,
        status,
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
      const quote = await QuoteService.getById(id, req.user.id);

      if (!quote) {
        return res
          .status(404)
          .json({ success: false, error: Errors.QUOTE_NOT_FOUND });
      }

      return res.status(200).json({ success: true, data: quote });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: error.message,
      });
    }
  }

  static async updateStatus(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const { status } = req.body;

      if (!status) {
        return res
          .status(400)
          .json({ success: false, error: Errors.MISSING_REQUIRED_FIELDS });
      }

      const updatedQuote = await QuoteService.updateStatus(
        id,
        req.user.id,
        status,
      );

      if (!updatedQuote) {
        return res
          .status(404)
          .json({ success: false, error: Errors.QUOTE_NOT_FOUND });
      }

      return res.status(200).json({ success: true, data: updatedQuote });
    } catch (error) {
      if (error.message === Errors.INVALID_STATUS_TRANSITION) {
        return res.status(400).json({
          success: false,
          error: Errors.INVALID_STATUS_TRANSITION,
          message:
            "The requested status transition is not allowed by the workflow.",
        });
      }
      return res.status(500).json({
        success: false,
        error: Errors.SERVER_ERROR,
        message: error.message,
      });
    }
  }

  static async softDelete(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const success = await QuoteService.softDelete(id, req.user.id);

      if (!success) {
        return res
          .status(404)
          .json({ success: false, error: Errors.QUOTE_NOT_FOUND });
      }

      return res
        .status(200)
        .json({ success: true, message: "Quote soft deleted successfully" });
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
      await QuoteService.deleteAll(req.user.id);

      return res.status(200).json({
        success: true,
        message: "Toate ofertele au fost șterse cu succes.",
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

module.exports = QuoteController;
