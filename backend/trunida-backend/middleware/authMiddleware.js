import jwt from "jsonwebtoken";

const SECRET_KEY = process.env.JWT_SECRET || "your_secret_key";

const authMiddleware = (req, res, next) => {
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
        const decoded = jwt.verify(token, SECRET_KEY);
        console.log("✅ Token Verified. Decoded User:", decoded);
        req.user = { id: decoded.userId }; // Attach user data to request
        next();
    } catch (error) {
        console.error("❌ Token verification failed:", error.message);
        return res.status(401).json({ error: "Invalid token" });
    }
};

export default authMiddleware; // ✅ Use default export
