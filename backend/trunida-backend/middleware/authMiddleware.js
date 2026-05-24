import jwt from "jsonwebtoken";

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
        next();
    } catch (error) {
        console.error("❌ Token verification failed:", error.message);
        return res.status(401).json({ error: "Invalid token" });
    }
};

export { protect };
export default protect;
