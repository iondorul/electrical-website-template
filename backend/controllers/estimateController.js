const EstimateService = require("../services/estimateService");

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
        message: "Eroare de server la preluarea devizelor.",
      });
    }
  }

  static async getById(req, res) {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const estimate = await EstimateService.getEstimateById(id, userId);

      if (!estimate) {
        return res
          .status(404)
          .json({ success: false, message: "Devizul nu a fost găsit." });
      }

      return res.status(200).json({ success: true, data: estimate });
    } catch (err) {
      console.error("Error in EstimateController.getById:", err);
      return res.status(500).json({
        success: false,
        message: "Eroare de server la preluarea devizului.",
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
          message: "Titlul devizului este obligatoriu.",
        });
      }

      if (!client_id || isNaN(parseInt(client_id, 10))) {
        return res
          .status(400)
          .json({ success: false, message: "Clientul selectat este invalid." });
      }

      if (status && !ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Status invalid. Valori permise: ${ALLOWED_STATUSES.join(", ")}`,
        });
      }

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Devizul trebuie să conțină cel puțin o linie.",
        });
      }

      for (const [idx, item] of items.entries()) {
        if (!item.description || item.description.trim() === "") {
          return res.status(400).json({
            success: false,
            message: `Descrierea liniei #${idx + 1} este obligatorie.`,
          });
        }
        if (parseFloat(item.quantity) <= 0) {
          return res.status(400).json({
            success: false,
            message: `Cantitatea liniei #${idx + 1} trebuie să fie mai mare decât 0.`,
          });
        }
        if (parseFloat(item.unit_cost) < 0) {
          return res.status(400).json({
            success: false,
            message: `Costul unitar al liniei #${idx + 1} nu poate fi negativ.`,
          });
        }
        if (parseFloat(item.margin_percent) < 0) {
          return res.status(400).json({
            success: false,
            message: `Adaosul liniei #${idx + 1} nu poate fi negativ.`,
          });
        }
      }

      const newEstimate = await EstimateService.createEstimate(
        userId,
        req.body,
      );
      return res.status(201).json({
        success: true,
        message: "Estimare salvată cu succes!",
        data: newEstimate,
      });
    } catch (err) {
      console.error("Error in EstimateController.create:", err);
      return res.status(500).json({
        success: false,
        message: "Eroare de server la salvarea devizului.",
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
          message: "Titlul devizului este obligatoriu.",
        });
      }

      if (!client_id || isNaN(parseInt(client_id, 10))) {
        return res
          .status(400)
          .json({ success: false, message: "Clientul selectat este invalid." });
      }

      if (status && !ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Status invalid. Valori permise: ${ALLOWED_STATUSES.join(", ")}`,
        });
      }

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Devizul trebuie să conțină cel puțin o linie.",
        });
      }

      for (const [idx, item] of items.entries()) {
        if (!item.description || item.description.trim() === "") {
          return res.status(400).json({
            success: false,
            message: `Descrierea liniei #${idx + 1} este obligatorie.`,
          });
        }
        if (parseFloat(item.quantity) <= 0) {
          return res.status(400).json({
            success: false,
            message: `Cantitatea liniei #${idx + 1} trebuie să fie mai mare decât 0.`,
          });
        }
        if (parseFloat(item.unit_cost) < 0) {
          return res.status(400).json({
            success: false,
            message: `Costul unitar al liniei #${idx + 1} nu poate fi negativ.`,
          });
        }
        if (parseFloat(item.margin_percent) < 0) {
          return res.status(400).json({
            success: false,
            message: `Adaosul liniei #${idx + 1} nu poate fi negativ.`,
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
          message: "Devizul nu a fost găsit sau actualizarea a eșuat.",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Estimare actualizată cu succes!",
        data: updatedEstimate,
      });
    } catch (err) {
      console.error("Error in EstimateController.update:", err);
      return res.status(500).json({
        success: false,
        message: "Eroare de server la actualizarea devizului.",
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
          message: "Devizul nu a fost găsit sau este deja arhivat.",
        });
      }

      return res
        .status(200)
        .json({ success: true, message: "Estimare arhivată cu succes!" });
    } catch (err) {
      console.error("Error in EstimateController.delete:", err);
      return res.status(500).json({
        success: false,
        message: "Eroare de server la arhivarea devizului.",
      });
    }
  }
}

module.exports = EstimateController;
