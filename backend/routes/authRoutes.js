const express = require("express");

const router = express.Router();

const authController = require("../controllers/authController");
const authenticateToken = require("../middleware/authMiddleware");

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);

router.get("/me", authenticateToken, authController.getMe);
router.put("/profile", authenticateToken, authController.updateProfile);
router.put("/avatar", authenticateToken, authController.updateAvatar);
router.put("/password", authenticateToken, authController.changePassword);

module.exports = router;
