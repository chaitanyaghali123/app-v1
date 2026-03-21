// middleware/auth.js
import jwt from "jsonwebtoken";

export function authenticate(req, res, next) {
  // Expect header: Authorization: Bearer <token>
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // Attach user info to request for downstream handlers
    req.user = { id: payload.userId };
    next();
  } catch (err) {
    console.error("JWT verification failed:", err.message);
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}
