import { User } from "../models/user.js"; // ✅ Use named import (lowercase filename)
import EmailOtp from "../models/EmailOtp.js";
import { sendOtpEmail, sendPasswordResetEmail, mailConfigured } from "../services/mailService.js";
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

// ══════════════════════════════════════════════════════════════════════════════
// Email OTP sign-in (passwordless — powers the landing-page auth modal)
// ══════════════════════════════════════════════════════════════════════════════

const OTP_TTL_MS         = 10 * 60 * 1000; // code valid for 10 minutes
const OTP_RESEND_MS      = 60 * 1000;      // min gap between sends per email
const OTP_MAX_ATTEMPTS   = 5;              // failed verifies before code dies

const hashOtp = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ✅ Request a sign-in code
export const requestEmailOtp = async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ msg: "A valid email address is required" });
    }

    // Unconfigured mail used to be refused only when NODE_ENV was exactly
    // 'production'. Railway does not guarantee that variable, so a deployment
    // with no BREVO_API_KEY answered "Code sent" and emailed nobody — the one
    // failure mode indistinguishable from a delivery problem, and the reason
    // this comment exists. Now it refuses everywhere unless a developer has
    // explicitly asked to read codes out of the log.
    const consoleOtpAllowed = process.env.ALLOW_CONSOLE_OTP === '1'
      || process.env.NODE_ENV === 'development';
    if (!mailConfigured && !consoleOtpAllowed) {
      console.error('[auth] OTP requested but no mail transport is configured — set BREVO_API_KEY.');
      return res.status(503).json({ msg: "Email sign-in is temporarily unavailable. Please continue with Google." });
    }

    // Resend cooldown
    const existing = await EmailOtp.findOne({ email }).lean();
    if (existing?.lastSentAt && Date.now() - new Date(existing.lastSentAt).getTime() < OTP_RESEND_MS) {
      return res.status(429).json({ msg: "Code already sent — wait a minute before requesting another." });
    }

    const code = crypto.randomInt(100000, 1000000); // 6 digits, no leading zero
    await EmailOtp.updateOne(
      { email },
      {
        $set: {
          codeHash:   hashOtp(code),
          expiresAt:  new Date(Date.now() + OTP_TTL_MS),
          attempts:   0,
          lastSentAt: new Date(),
        },
      },
      { upsert: true }
    );

    let delivery;
    try {
      delivery = await sendOtpEmail(email, code);
    } catch (err) {
      // lastSentAt was written before the send, so a failed send would leave a
      // cooldown behind: the retry a minute later gets "Code already sent" for
      // a code that never went anywhere. Clear it so retrying works.
      await EmailOtp.updateOne({ email }, { $set: { lastSentAt: null } }).catch(() => {});
      throw err;
    }

    return res.status(200).json({
      msg: delivery === 'console' ? "Code written to the server log" : "Code sent",
      // The client shows a different instruction for each. Only ever
      // 'console' on a box that opted in above.
      delivery,
    });
  } catch (error) {
    console.error("❌ Email OTP request error:", error);
    return res.status(500).json({ msg: "Failed to send the code. Please try again." });
  }
};

// ✅ Verify the code — logs in an existing account or creates one
export const verifyEmailOtp = async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const code  = String(req.body.code || '').trim();

    if (!email || !code) {
      return res.status(400).json({ msg: "Email and code are required" });
    }

    const otp = await EmailOtp.findOne({ email });
    if (!otp || otp.expiresAt < new Date()) {
      return res.status(400).json({ msg: "Code expired — request a new one." });
    }
    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      await EmailOtp.deleteOne({ _id: otp._id });
      return res.status(429).json({ msg: "Too many attempts — request a new code." });
    }
    if (otp.codeHash !== hashOtp(code)) {
      await EmailOtp.updateOne({ _id: otp._id }, { $inc: { attempts: 1 } });
      return res.status(400).json({ msg: "Incorrect code. Please check and try again." });
    }

    await EmailOtp.deleteOne({ _id: otp._id });

    // Case-insensitive lookup so pre-existing mixed-case accounts still match
    let user = await User.findOne({ email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' } });
    if (!user) {
      user = new User({
        name:          email.split('@')[0],
        email,
        authProvider:  'local',
        emailVerified: true,
        // no password — OTP / OAuth account
      });
      await user.save();
    } else if (!user.emailVerified) {
      user.emailVerified = true;
      await user.save();
    }

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
    console.error("❌ Email OTP verify error:", error);
    return res.status(500).json({ msg: "Server Error" });
  }
};

/**
 * The user schema stores email exactly as typed and looks it up the same way,
 * so "Name@x.com" at signup and "name@x.com" at reset never match — and the
 * person is told a link was sent when nothing was looked up. Matched
 * case-insensitively here, anchored and escaped so the address cannot become
 * a pattern.
 */
function emailMatcher(email) {
  const escaped = String(email).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}$`, 'i');
}

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5500';

/** The same sentence whether or not the account exists. Saying anything else
 *  turns this endpoint into a way to check who has an account. */
const RESET_REQUESTED = "If an account exists with this email, we've sent a link to reset the password.";

// ✅ Request Password Reset
export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ msg: "Email is required" });
    }

    // Said once, before any lookup. This flow only works by email, and the
    // old version answered "instructions sent" with nothing configured to
    // send them — the person sat watching an empty inbox. In production that
    // is an outage to name, not a success to fake.
    if (!mailConfigured && process.env.NODE_ENV === 'production') {
      console.error('[auth] password reset requested but no mail transport is configured');
      return res.status(503).json({
        msg: "Password reset by email isn't available right now. Please contact us and we'll sort it out.",
      });
    }

    const user = await User.findOne({ email: emailMatcher(email) });
    if (!user) {
      return res.status(200).json({ msg: RESET_REQUESTED });
    }

    // The raw token goes into the email and nowhere else. It used to be
    // returned in this response as a "development only" convenience that
    // shipped to production: anyone who knew an address could POST here, read
    // the token back, and set that account's password. The hash is what is
    // stored, so a copy of the database is not a copy of every reset link.
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Built from FRONTEND_URL like every other link the backend hands out,
    // and pointing at the page that actually exists. The old one was a
    // hard-coded localhost with a path the frontend has never served.
    // The stored address is used, not the typed one, so the link carries the
    // casing the reset endpoint will match against.
    const resetUrl = `${FRONTEND_URL}/login/reset-password.html`
      + `?token=${resetToken}&email=${encodeURIComponent(user.email)}`;

    try {
      const how = await sendPasswordResetEmail(user.email, resetUrl);
      if (how === 'console') {
        // Development with no mailbox: the link is in the server log, and the
        // response says so rather than sending someone to check their email.
        return res.status(200).json({ msg: RESET_REQUESTED, delivery: 'console' });
      }
    } catch (err) {
      // The token is saved and valid, but the person will never see it. Tell
      // them the truth so they try again later or reach out, rather than
      // waiting for an email that is not coming.
      console.error('[auth] password reset email failed:', err.message);
      return res.status(502).json({
        msg: "We couldn't send the reset email just now. Please try again in a few minutes.",
      });
    }

    return res.status(200).json({ msg: RESET_REQUESTED });

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

    // Find user with matching token and email. Same case-insensitive match as
    // the request, so the two halves of the flow agree on which account.
    const user = await User.findOne({
      email: emailMatcher(email),
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
