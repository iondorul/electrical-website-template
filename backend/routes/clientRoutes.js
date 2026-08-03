const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const clientController = require("../controllers/clientController");

router.post("/", authMiddleware, clientController.createClient);

router.get("/", authMiddleware, clientController.getClients);

module.exports = router;
