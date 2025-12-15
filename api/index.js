// api/index.js
// Express entrypoint for the API.
// - Applies security headers, CORS, sanitization, and rate limiting.
// - Ensures a memoized MongoDB connection before routing.
// - Mounts feature routers and keeps a few legacy endpoints.
//
// Notes:
// - app.set("trust proxy", 1) is required so rate limiting uses the real client IP behind proxies.
// - If ALLOWED_ORIGINS is not set, CORS will allow requests (prevents accidental self-blocking).
//   If ALLOWED_ORIGINS is set, only those origins will be allowed.

import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import mongoSanitize from "express-mongo-sanitize";

// Stripe (Checkout for card donations)
import Stripe from "stripe";

// Utils
import { validateInput } from "../src/utils/backend/validate-utils.js";

// Schemas (used by a few legacy endpoints below)
import User from "../server/schemas/User.js";
import Class from "../server/schemas/Class.js";

// Routers
import translationRoutes from "../server/routes/translation-routes.js";
import emailRoutes from "../server/routes/email-routes.js";
import userRoutes from "../server/routes/user-routes.js";
import levelRoutes from "../server/routes/level-routes.js";
import classRoutes from "../server/routes/class-routes.js";
import volunteerRoutes from "../server/routes/volunteer-routes.js";

// Memoized DB connection (reuses an existing conn per instance)
import { dbConnect } from "../server/db.js";

// Security middleware (Helmet + CSP), centralized in /middleware
import security from "../server/middleware/security.js";

// Rate limiting
import { apiLimiter, burstLimiter } from "../server/middleware/rate-limit.js";

const app = express();

/* -------------------------------------------------------------------------- */
/* Donation helpers                                                           */
/* -------------------------------------------------------------------------- */
/**
 * Env vars used here:
 *  - BASE_URL (e.g., https://dillaracademy.org)
 *  - STRIPE_SECRET_KEY
 *  - PAYPAL_DONATE_URL
 *  - CRYPTO_DONATION_URL
 *
 * Placeholder handling:
 *  - If you set an env var to the literal string "placeholder", we treat it as unset and return 503.
 */

function isUnsetEnv(value) {
  const s = String(value || "").trim().toLowerCase();
  return s.length === 0 || s === "placeholder";
}

let _stripe = null;

function getStripe() {
  if (_stripe) return _stripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (isUnsetEnv(key)) {
    const err = new Error("Stripe is not configured");
    err.statusCode = 503;
    throw err;
  }

  _stripe = new Stripe(key);
  return _stripe;
}

function getBaseUrl() {
  const raw = String(process.env.BASE_URL || "").trim().replace(/\/+$/, ""); // remove trailing slash
  if (isUnsetEnv(raw)) return "";
  if (!/^https?:\/\//i.test(raw)) return "";
  return raw;
}

function parseAndValidateAmountUsd(amount) {
  const n = Number(amount);

  if (!Number.isFinite(n)) {
    const err = new Error("Invalid amount");
    err.statusCode = 400;
    throw err;
  }

  // Sensible guardrails
  if (n < 1) {
    const err = new Error("Minimum donation is $1");
    err.statusCode = 400;
    throw err;
  }
  if (n > 10000) {
    const err = new Error("Maximum donation is $10,000");
    err.statusCode = 400;
    throw err;
  }

  // Keep two decimals max (avoids weird floats like 10.0000002)
  return Math.round(n * 100) / 100;
}

function dollarsToCents(amountUsd) {
  return Math.round(amountUsd * 100);
}

// --- Global middleware (order matters) ---------------------------------------
app.disable("x-powered-by");

// Ensure correct client IPs behind Vercel/CF for rate limiting & logs
app.set("trust proxy", 1);

// Security headers (CSP, HSTS, etc.)
app.use(security);

// CORS: allow requests when no allowlist is configured; otherwise enforce allowlist.
const allowlist = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow non-browser requests (no Origin header)
      if (!origin) return cb(null, true);

      // If no allowlist is configured, avoid accidentally blocking your own frontend.
      if (allowlist.length === 0) return cb(null, true);

      if (allowlist.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"), false);
    },
    credentials: false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Origin", "Accept", "Content-Type", "Authorization", "X-Requested-With"],
  })
);

// Body parsing & basic injection protection
app.use(express.json({ limit: "100kb" }));
app.use(mongoSanitize());

// Rate limit early (before DB work)
app.use("/api", apiLimiter);
// Stricter limiter for sensitive endpoints
app.use("/api/sign-up", burstLimiter);

// Ensure DB is connected before any route runs.
// dbConnect() should be memoized so warm invocations are a fast no-op.
app.use(async (_req, res, next) => {
  try {
    await dbConnect();
    next();
  } catch (err) {
    console.error("DB connect failed:", err);
    res.status(500).json({ message: "Database connection failed" });
  }
});

// Attach one error listener per process to surface driver-level issues.
if (mongoose.connection.listenerCount("error") === 0) {
  mongoose.connection.on("error", (err) => {
    console.error("MongoDB connection error:", err);
  });
}

// --- Mount feature routers ----------------------------------------------------
app.use("/api/locales", translationRoutes);
app.use("/api", emailRoutes);
app.use("/api", userRoutes);
app.use("/api/levels", levelRoutes);
app.use("/api/classes", classRoutes);
app.use("/api/volunteer", volunteerRoutes);

/* -------------------------------------------------------------------------- */
/* Donations                                                                  */
/* -------------------------------------------------------------------------- */
/**
 * Donation session endpoint (Stripe + simple redirects for PayPal/Crypto)
 * POST /api/donate/create-session
 * Body: { amount: number|string, provider?: "stripe"|"paypal"|"crypto" }
 * Returns: { url: string }
 */
app.post("/api/donate/create-session", async (req, res) => {
  try {
    const baseUrl = getBaseUrl();
    if (!baseUrl) {
      return res.status(503).json({ error: "Donations are not configured (BASE_URL)" });
    }

    const { amount, provider = "stripe" } = req.body || {};
    const providerKey = String(provider || "stripe").trim().toLowerCase();
    const amountUsd = parseAndValidateAmountUsd(amount);

    // Provider: PayPal (frontend redirect; no server-side session)
    if (providerKey === "paypal") {
      const url = String(process.env.PAYPAL_DONATE_URL || "").trim();
      if (isUnsetEnv(url)) return res.status(503).json({ error: "PayPal donations are not configured" });
      return res.json({ url });
    }

    // Provider: Crypto (frontend redirect; set this to a trusted hosted checkout page)
    if (providerKey === "crypto") {
      const url = String(process.env.CRYPTO_DONATION_URL || "").trim();
      if (isUnsetEnv(url)) return res.status(503).json({ error: "Crypto donations are not configured" });
      return res.json({ url });
    }

    // Provider: Stripe (Checkout session)
    if (providerKey !== "stripe") {
      return res.status(400).json({ error: "Unknown provider" });
    }

    const stripe = getStripe();
    const cents = dollarsToCents(amountUsd);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      submit_type: "donate",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: cents,
            product_data: { name: "Dillar Academy Donation" },
          },
        },
      ],

      // Optional invoice creation (enabled by default here)
      invoice_creation: { enabled: true },

      success_url: `${baseUrl}/donate/thank-you?m=stripe&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/donate?canceled=1&m=stripe`,

      metadata: {
        purpose: "donation",
        amount_usd: amountUsd.toFixed(2),
      },
    });

    if (!session?.url) {
      return res.status(502).json({ error: "Stripe did not return a checkout URL" });
    }

    return res.json({ url: session.url });
  } catch (err) {
    console.error("Donate create-session error:", err);
    return res.status(err?.statusCode || 500).json({ error: err?.message || "Donation session failed" });
  }
});

// --- Health check -------------------------------------------------------------
app.get("/api/health", (_req, res) => {
  // readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
  res.json({ ok: true, db: mongoose.connection.readyState });
});

// ------------------ Legacy endpoints kept as-is ------------------------------

// Get All Classes (with simple filter support)
app.get("/api/all-classes", async (req, res) => {
  try {
    if ("level" in req.query) req.query.level = Number(req.query.level);

    const allowedFields = ["level", "instructor", "ageGroup"];
    const filters = validateInput(req.query, allowedFields);

    const data = await Class.find(filters);
    res.json(data);
  } catch (err) {
    res.status(500).send(err);
  }
});

// Enroll in a class
app.put("/api/users/:id/enroll", async (req, res) => {
  const { classId } = req.body;
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid ID" });
  }

  try {
    const user = await User.findById(id);
    if (user.enrolledClasses.includes(classId)) {
      return res.status(400).json({ message: "Already enrolled in this class" });
    }

    const cls = await Class.findById(classId);
    if (!cls) return res.status(404).json({ message: "Class not found" });
    if (!cls.isEnrollmentOpen) {
      return res.status(403).json({ message: "Enrollment is currently closed for this class." });
    }

    await User.findByIdAndUpdate(id, { $addToSet: { enrolledClasses: classId } });
    await Class.findByIdAndUpdate(classId, { $addToSet: { roster: id } });

    res.status(201).json({ message: "Enrolled successfully!" });
  } catch (err) {
    console.error("Error enrolling into class:", err);
    res.status(500).json({ message: "Error enrolling into class" });
  }
});

// Unenroll from a class
app.put("/api/users/:id/unenroll", async (req, res) => {
  const { classId } = req.body;
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid ID" });
  }

  try {
    const user = await User.findById(id);
    if (!user.enrolledClasses.includes(classId)) {
      return res.status(400).json({ message: "Not enrolled in this class" });
    }

    await User.findByIdAndUpdate(id, { $pull: { enrolledClasses: classId } });
    await Class.findByIdAndUpdate(classId, { $pull: { roster: id } });

    res.status(201).json({ message: "Successfully unenrolled" });
  } catch (err) {
    res.status(500).json({ message: "Error unenrolling into class" });
  }
});

// Students export
app.get("/api/students-export", async (_req, res) => {
  try {
    const students = await User.find({ privilege: "student" });
    const classes = await Class.find();
    const classMap = new Map(classes.map((c) => [c._id.toString(), c]));

    const formatTime = (hours, minutes) => {
      const period = hours >= 12 ? "pm" : "am";
      const hour12 = hours % 12 || 12;
      return `${hour12}:${minutes.toString().padStart(2, "0")}${period}`;
    };

    const formattedStudents = [];

    for (const student of students) {
      const enrolled = (student.enrolledClasses || [])
        .map((classId) => {
          const classInfo = classMap.get(classId.toString());
          if (!classInfo || !Array.isArray(classInfo.schedule)) return null;

          const scheduleEST = classInfo.schedule
            .map((s) => `${s.day} ${s.startTime}-${s.endTime}`)
            .join("\n");

          const scheduleIstanbul = classInfo.schedule
            .map((s) => {
              const [startHour, startMin] = s.startTime.split(":").map(Number);
              const [endHour, endMin] = s.endTime.split(":").map(Number);

              const estStart = new Date();
              const estEnd = new Date();
              estStart.setHours(startHour, startMin || 0);
              estEnd.setHours(endHour, endMin || 0);

              const istStart = new Date(estStart.getTime() + 7 * 60 * 60 * 1000);
              const istEnd = new Date(estEnd.getTime() + 7 * 60 * 60 * 1000);

              return `${s.day} ${formatTime(istStart.getHours(), istStart.getMinutes())}-${formatTime(
                istEnd.getHours(),
                istEnd.getMinutes()
              )}`;
            })
            .join("\n");

          return {
            level: classInfo.level,
            ageGroup: classInfo.ageGroup,
            instructor: classInfo.instructor,
            link: classInfo.link,
            scheduleEST,
            scheduleIstanbul,
          };
        })
        .filter(Boolean);

      if (enrolled.length === 0) {
        formattedStudents.push({
          firstName: student.firstName,
          lastName: student.lastName,
          email: student.email,
          creationDate: student.creationDate.toISOString().split("T")[0],
          level: "",
          ageGroup: "",
          instructor: "",
          link: "",
          scheduleEST: "",
          scheduleIstanbul: "",
        });
      } else {
        for (const classInfo of enrolled) {
          formattedStudents.push({
            firstName: student.firstName,
            lastName: student.lastName,
            email: student.email,
            creationDate: student.creationDate.toISOString().split("T")[0],
            ...classInfo,
          });
        }
      }
    }

    res.json({ student_data: formattedStudents });
  } catch (err) {
    console.error("Error exporting students:", err.stack || err);
    res.status(500).json({ message: "Error exporting students" });
  }
});

// --- Local dev only: start HTTP server ---------------------------------------
// Vercel (serverless) will NOT use this. It requires a default export.
if (process.env.VERCEL !== "1" && process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`API listening locally on http://localhost:${PORT}`);
  });
}

// --- Required for Vercel serverless ------------------------------------------
export default app;