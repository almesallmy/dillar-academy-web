// server/middleware/rate-limit.js
// Centralized rate-limiting for API routes.
// - apiLimiter: general throttle for all /api traffic
// - burstLimiter: stricter throttle for sensitive endpoints
//
// Notes:
// * app.set("trust proxy", 1) must be enabled in api/index.js so req.ip reflects the real client IP behind proxies.
// * Tunable via env vars without code changes.

import rateLimit from "express-rate-limit";

function intFromEnv(key, fallback) {
  const raw = process.env[key];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function rateLimitHandler(req, res, _next, options) {
  // Lightweight log for visibility when throttling happens
  console.warn("Rate limit exceeded", {
    ip: req.ip,
    path: req.originalUrl,
    method: req.method,
    windowMs: options.windowMs,
    limit: options.limit,
  });

  res.status(options.statusCode).json({
    message: "Too many requests. Please try again later.",
  });
}

export const apiLimiter = rateLimit({
  windowMs: intFromEnv("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
  max: intFromEnv("RATE_LIMIT_MAX", 100),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

export const burstLimiter = rateLimit({
  windowMs: intFromEnv("BURST_LIMIT_WINDOW_MS", 15 * 60 * 1000),
  max: intFromEnv("BURST_LIMIT_MAX", 20),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});
