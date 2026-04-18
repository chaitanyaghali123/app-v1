// middleware/auth.js

import jwt from "jsonwebtoken";

// -----------------------------
// 🔐 Authenticate Middleware
// -----------------------------
export function authenticate(req, res, next) {
  try {
    const authHeader = req.headers["authorization"];

    // ✅ Check header exists
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Authorization header missing or invalid"
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        error: "Access token required"
      });
    }

    // ✅ Verify token
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ Attach full user info (future-ready)
    req.user = {
      id: payload.userId,
      email: payload.email || null,
      role: payload.role || "user"
    };

    next();
  } catch (err) {
    console.error("JWT verification failed:", err.message);

    // अलग-अलग error handling (better UX)
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        error: "Token expired"
      });
    }

    return res.status(403).json({
      error: "Invalid token"
    });
  }
}

// -----------------------------
// 🔐 Optional: Role-based access
// -----------------------------
export function authorizeRoles(...roles) {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          error: "Access denied"
        });
      }

      next();
    } catch (err) {
      console.error("Role check failed:", err);
      return res.status(500).json({ error: "Server error" });
    }
  };
}