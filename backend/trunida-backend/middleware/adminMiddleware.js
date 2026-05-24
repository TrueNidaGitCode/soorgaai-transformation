import jwt from "jsonwebtoken";
import { User } from "../models/user.js"; // ✅ Fixed: lowercase filename for Linux compatibility

const SECRET_KEY = process.env.JWT_SECRET || "your_secret_key";

/**
 * Admin Middleware - Verify admin role
 * Checks both JWT token validity and user role in database
 */
const adminMiddleware = async (req, res, next) => {
    const authHeader = req.header("Authorization");

    if (!authHeader) {
        console.log("❌ No token found in headers");
        return res.status(401).json({ error: "Access denied. No token provided." });
    }

    const token = authHeader.split(" ")[1]; // Extract token after "Bearer"

    if (!token) {
        console.log("❌ Token format incorrect");
        return res.status(401).json({ error: "Invalid token format" });
    }

    try {
        // Verify JWT token
        const decoded = jwt.verify(token, SECRET_KEY);
        console.log("✅ Token Verified. User ID:", decoded.userId);

        // Fetch user from database to check role
        const user = await User.findById(decoded.userId).select('role').lean();

        if (!user) {
            console.log("❌ User not found in database");
            return res.status(401).json({ error: "User not found" });
        }

        // Check if user has admin role
        if (user.role !== 'admin') {
            console.log("❌ Access denied - user is not admin");
            return res.status(403).json({ error: "Access denied. Admin privileges required." });
        }

        console.log("✅ Admin access granted");

        // Attach user data to request
        req.user = { id: decoded.userId, role: user.role };
        next();

    } catch (error) {
        console.error("❌ Admin middleware error:", error.message);
        return res.status(401).json({ error: "Invalid token" });
    }
};

export default adminMiddleware;
