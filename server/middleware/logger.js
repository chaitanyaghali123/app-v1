import { saveApiLog } from "../services/db.service.js";

export async function requestLogger(req, res, next) {
  const start = Date.now();

  // capture original end function
  const originalEnd = res.end;

  res.end = async function (...args) {
    const responseTime = Date.now() - start;

    try {
      await saveApiLog({
        user_id: req.user?.id || req.body?.user_id || "anon",
        method: req.method,
        endpoint: req.originalUrl,
        status_code: res.statusCode,
        response_time_ms: responseTime,
        ip: req.ip
      });
    } catch (err) {
      console.error("Logger error:", err.message);
    }

    originalEnd.apply(this, args);
  };

  next();
}
