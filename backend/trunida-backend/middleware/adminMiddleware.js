import { User } from "../models/user.js";

/**
 * adminOnly — Must run AFTER protect middleware.
 * Verifies the authenticated user has the 'admin' role in the DB.
 */
const adminOnly = async (req, res, next) => {
    try {
        if (!req.user?._id) {
            return res.status(401).json({ error: "Access denied. Authentication required." });
        }

        // Re-verify role from DB (source of truth)
        const user = await User.findById(req.user._id).select('role').lean();

        if (!user) {
            return res.status(401).json({ error: "User not found." });
        }

        if (user.role !== 'admin') {
            return res.status(403).json({ error: "Access denied. Admin privileges required." });
        }

        // Enrich req.user with confirmed role
        req.user.role = user.role;
        next();

    } catch (error) {
        console.error("❌ adminOnly middleware error:", error.message);
        return res.status(500).json({ error: "Authorization check failed." });
    }
};

export { adminOnly };
export default adminOnly;
