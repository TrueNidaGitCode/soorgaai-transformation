import jwt from "jsonwebtoken";

const SECRET_KEY = process.env.JWT_SECRET || "your_secret_key";

/**
 * protect — Verify JWT token and attach user to req.user
 * Exposes both _id (Mongoose style) and id (legacy) for compatibility.
 */
/**
 * When this account was last actually here.
 *
 * Nothing recorded it. A sales board tried to show "never came back" beside
 * the rows worth ignoring, and flagged 33 accounts out of 33 — including the
 * team's own, and a customer whose application was running at that moment —
 * because with no lastSeenAt the only fallback is createdAt, and by that
 * measure nobody has ever returned.
 *
 * Written from here because this runs on every authenticated request, which
 * is the only place that reliably knows somebody is present. Throttled to an
 * hour: the question is "did they come back", not "how many requests did they
 * make", and a write per request would be a database call bolted onto every
 * endpoint for a field nothing reads in real time.
 *
 * Fire-and-forget and failure-swallowing on purpose. A bookkeeping write must
 * never be the reason a request fails.
 */
const SEEN_THROTTLE_MS = 60 * 60 * 1000;
const seenRecently = new Map();

function touchLastSeen(userId) {
    if (!userId) return;
    const now = Date.now();
    const last = seenRecently.get(userId) || 0;
    if (now - last < SEEN_THROTTLE_MS) return;
    seenRecently.set(userId, now);

    // Bounded: this is a cache of write times, not a session store.
    if (seenRecently.size > 5000) seenRecently.clear();

    import('../models/user.js')
        .then(({ User }) => User.updateOne({ _id: userId }, { $set: { lastSeenAt: new Date(now) } }))
        .catch(() => { /* bookkeeping must not break a request */ });
}

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
        touchLastSeen(decoded.userId);
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
    } catch {
        // Invalid/expired token — treat as anonymous, don't block
    }
    next();
};

export { protect, optionalAuth };
export default protect;
