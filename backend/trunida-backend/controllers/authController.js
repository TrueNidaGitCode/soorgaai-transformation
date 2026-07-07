import { User } from "../models/user.js"; // ✅ Use named import (lowercase filename)
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

// ✅ Signup Controller
export const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    let user = await User.findOne({ email }).lean();
    if (user) return res.status(400).json({ msg: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    user = new User({ name, email, password: hashedPassword });
    await user.save();

    return res.status(201).json({ msg: "Signup Successful" });
  } catch (error) {
    console.error("❌ Signup Error:", error);
    return res.status(500).json({ msg: "Server Error" });
  }
};

// ✅ Login Controller (Now Includes Username and Role)
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).lean();
    if (!user) return res.status(400).json({ msg: "Invalid Credentials" });

    // OAuth-only account has no password hash — direct them to social login
    if (!user.password) {
      const provider = user.authProvider === 'google' ? 'Google'
                     : user.authProvider === 'microsoft' ? 'Microsoft'
                     : 'social login';
      return res.status(400).json({
        msg: `This account uses ${provider} sign-in. Please use the ${provider} button above.`,
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: "Invalid Credentials" });

    // Include role in JWT payload.
    // 30d expiry: workspace sessions are conversational and revisited across
    // days — a short-lived token expired mid-conversation (or overnight) and
    // surfaced as a raw "Invalid token" error in the advisor chat.
    const token = jwt.sign(
      { userId: user._id, role: user.role || 'user' },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    return res.status(200).json({
      token,
      userId:   user._id.toString(),
      username: user.name,
      role:     user.role || 'user',
    });
  } catch (error) {
    console.error("❌ Login Error:", error);
    return res.status(500).json({ msg: "Server Error" });
  }
};

// ✅ Get User Profile (Token Validation)
export const getUserProfile = async (req, res) => {
  try {
    // 🔥 Extract Token Safely
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized - No token provided" });
    }

    const token = authHeader.split(" ")[1];

    // 🔥 Verify Token Synchronously
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded) return res.status(401).json({ error: "Unauthorized - Invalid token" });

    // 🔥 Fetch User Without Password
    const user = await User.findById(decoded.userId).select("-password").lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    return res.status(200).json(user);
  } catch (error) {
    console.error("❌ Error fetching user profile:", error);
    return res.status(500).json({ error: "Server error" });
  }
};

// ✅ Request Password Reset
export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ msg: "Email is required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if user exists or not (security best practice)
      return res.status(200).json({
        msg: "If an account exists with this email, a reset link will be sent"
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Save hashed token and expiry to user
    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // In production, send email with reset link
    // For now, return token in response (development only!)
    const resetUrl = `http://localhost:3000/reset-password?token=${resetToken}&email=${email}`;

    console.log("🔐 Password Reset Token:", resetToken);
    console.log("🔗 Reset URL:", resetUrl);

    // TODO: Send email with resetUrl
    // For now, just return success (in production, always return success)
    return res.status(200).json({
      msg: "Password reset instructions sent to email",
      // ⚠️ REMOVE IN PRODUCTION - only for testing
      resetToken: resetToken,
      resetUrl: resetUrl
    });

  } catch (error) {
    console.error("❌ Password Reset Request Error:", error);
    return res.status(500).json({ msg: "Server Error" });
  }
};

// ✅ Reset Password
export const resetPassword = async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;

    if (!email || !token || !newPassword) {
      return res.status(400).json({ msg: "Email, token, and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ msg: "Password must be at least 6 characters" });
    }

    // Hash the token to compare with stored hash
    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with matching token and email
    const user = await User.findOne({
      email: email,
      resetPasswordToken: resetTokenHash,
      resetPasswordExpires: { $gt: Date.now() } // Token not expired
    });

    if (!user) {
      return res.status(400).json({ msg: "Invalid or expired reset token" });
    }

    // Update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    console.log("✅ Password reset successful for:", email);

    return res.status(200).json({ msg: "Password reset successful. You can now login with your new password." });

  } catch (error) {
    console.error("❌ Password Reset Error:", error);
    return res.status(500).json({ msg: "Server Error" });
  }
};
