import express from "express";
import {
  signup,
  login,
  getUserProfile,
  requestPasswordReset,
  resetPassword
} from "../controllers/authController.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.get("/me", getUserProfile);
router.post("/forgot-password", requestPasswordReset); // ✅ NEW: Request password reset
router.post("/reset-password", resetPassword); // ✅ NEW: Reset password with token

export default router;
