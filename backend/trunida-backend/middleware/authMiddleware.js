import jwt from "jsonwebtoken";
import { attributeTo } from "../services/usageContext.js";

const SECRET_KEY = process.env.JWT_SECRET || "your_secret_key";

/**
 * protect — Verify JWT token and attach user to req.user
 * Exposes both _id (Mongoose style) and id (legacy) for compatibility.
 */
const protect = (req, res, next) => {
    const authHeader = req.header("Authorization");

    if (!authHeader) {
        return res.status(401).json({ error: "Access denied. No token provided." });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({ error: "Invalid token format" });
    }

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        // Attach both _id and id for Mongoose + legacy compatibility
        req.user = {
            _id:  decoded.userId,
            id:   decoded.userId,
            role: decoded.role || 'user',
        };
        // Every model call made under this request now lands in this
        // account's ledger row, without any of the ~30 call sites knowing.
        attributeTo(decoded.userId);
        next();
    } catch (error) {
        console.error("❌ Token verification failed:", error.message);
        return res.status(401).json({ error: "Invalid token" });
    }
};

/**
 * optionalAuth — Attach user to req.user if a valid JWT is present.
 * Does NOT block the request if token is missing or invalid.
 * Used for routes that support both authenticated and anonymous users.
 */
const optionalAuth = (req, res, next) => {
    const authHeader = req.header('Authorization');
    if (!authHeader) return next();           // anonymous — no token present

    const token = authHeader.split(' ')[1];
    if (!token) return next();

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.user = {
            _id:  decoded.userId,
            id:   decoded.userId,
            role: decoded.role || 'user',
        };
        attributeTo(decoded.userId);
    } catch {
        // Invalid/expired token — treat as anonymous, don't block
    }
    next();
};

export { protect, optionalAuth };
export default protect;
