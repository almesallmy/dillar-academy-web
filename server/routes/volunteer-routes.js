// server/routes/volunteer-routes.js
// Volunteer application endpoints:
// - POST /apply (public)
// - GET  /all (admin/instructor)
// - PATCH /:id/status (admin/instructor)
// - GET /export.csv (admin/instructor)
//
// Notes:
// - Honeypot field ("website") returns success if filled (bot trap).
// - Optional email notifications.

import express from "express";
import mongoose from "mongoose";
import { dbConnect } from "../db.js";
import Volunteer from "../schemas/Volunteer.js";
import { validateInput } from "../../src/utils/backend/validate-utils.js";
import { requireAuth, requireAdminOrInstructor } from "../middleware/auth.js";

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIMEZONE_RE = /^UTC[+-]\d{2}:\d{2}$/;

const ROLE_INTEREST = new Set(["teach", "admin", "both"]);
const WEEKLY_HOURS = new Set(["lt1", "1_2", "3_5", "6_plus"]);
const UYGHUR = new Set(["fluent_native", "professional", "conversational", "none"]);
const PREF_TIME = new Set(["morning", "afternoon", "evening", "flexible"]);
const STATUS = new Set(["pending", "approved", "rejected"]);

function labelWeeklyHours(v) {
  const map = {
    lt1: "Less than 1 hour / week",
    "1_2": "1–2 hours / week",
    "3_5": "3–5 hours / week",
    "6_plus": "6+ hours / week",
  };
  return map[v] || v || "-";
}

function labelUyghur(v) {
  const map = {
    fluent_native: "Fluent / Native",
    professional: "Professional working proficiency",
    conversational: "Conversational",
    none: "Not proficient",
  };
  return map[v] || v || "-";
}

function labelPreferredTime(v) {
  const map = {
    morning: "Morning",
    afternoon: "Afternoon",
    evening: "Evening",
    flexible: "Flexible",
  };
  return map[v] || v || "-";
}

/**
 * Optional email notifications:
 * - If nodemailer is not installed or SMTP env vars missing, submissions still succeed.
 *
 * Env vars:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *   VOLUNTEER_NOTIFY_TO   (admin notification destination)
 *   VOLUNTEER_REPLY_TO    (optional)
 */
async function maybeSendEmails({ volunteer }) {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;
  const notifyTo = process.env.VOLUNTEER_NOTIFY_TO;
  const replyTo = process.env.VOLUNTEER_REPLY_TO;

  if (!host || !port || !user || !pass || !from) return;

  let nodemailer;
  try {
    nodemailer = await import("nodemailer");
  } catch {
    console.warn("Email not sent: nodemailer not installed.");
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user, pass },
  });

  const lines = [
    `New volunteer submission`,
    ``,
    `Name: ${volunteer.name}`,
    `Email: ${volunteer.email}`,
    `Phone: ${volunteer.phone || "-"}`,
    `Role interest: ${volunteer.roleInterest}`,
    `Weekly hours: ${labelWeeklyHours(volunteer.weeklyHours)}`,
    `Uyghur proficiency: ${labelUyghur(volunteer.uyghurProficiency)}`,
    `Start date: ${volunteer.startDate ? new Date(volunteer.startDate).toISOString().slice(0, 10) : "-"}`,
    `Subjects: ${volunteer.subjects}`,
    `Timezone: ${volunteer.timezone || "-"}`,
    `Preferred time: ${labelPreferredTime(volunteer.preferredTimeOfDay)}`,
    `Availability details: ${volunteer.availabilityDetails || "-"}`,
    ``,
    `Motivation:`,
    `${volunteer.motivation}`,
    ``,
    `Notes:`,
    `${volunteer.notes || "-"}`,
  ].join("\n");

  if (notifyTo) {
    try {
      await transporter.sendMail({
        from,
        to: notifyTo,
        subject: `New volunteer application: ${volunteer.name}`,
        text: lines,
        replyTo: replyTo || volunteer.email,
      });
    } catch (e) {
      console.error("Admin notification email failed:", e?.message || e);
    }
  }

  try {
    await transporter.sendMail({
      from,
      to: volunteer.email,
      subject: "Thanks for volunteering with Dillar Academy",
      text:
        `Hi ${volunteer.name},\n\n` +
        `Thanks for your interest in volunteering with Dillar Academy. We received your submission and will follow up soon.\n\n` +
        `— Dillar Academy`,
      replyTo: replyTo || undefined,
    });
  } catch (e) {
    console.error("Volunteer confirmation email failed:", e?.message || e);
  }
}

// -------------------- PUBLIC: submit application --------------------

router.post("/apply", async (req, res, next) => {
  try {
    await dbConnect();

    const allowedFields = [
      "name",
      "email",
      "phone",
      "roleInterest",
      "weeklyHours",
      "uyghurProficiency",
      "startDate",
      "subjects",
      "timezone",
      "preferredTimeOfDay",
      "availabilityDetails",
      "motivation",
      "notes",
      "website", // honeypot
    ];

    const body = validateInput(req.body || {}, allowedFields);

    // Honeypot: bots often fill it; real users won't.
    const website = (body.website || "").trim();
    if (website) return res.status(201).json({ success: true });

    const name = (body.name || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const phone = (body.phone || "").trim();

    const roleInterest = String(body.roleInterest || "").trim().toLowerCase();
    const weeklyHours = String(body.weeklyHours || "").trim().toLowerCase();
    const uyghurProficiency = String(body.uyghurProficiency || "").trim().toLowerCase();

    const subjects = (body.subjects || "").trim();

    // Normalize timezone casing so "utc-05:00" becomes "UTC-05:00"
    const timezone = String(body.timezone || "").trim().toUpperCase();

    const preferredTimeOfDay = String(body.preferredTimeOfDay || "").trim().toLowerCase();
    const availabilityDetails = (body.availabilityDetails || "").trim();

    const motivation = (body.motivation || "").trim();
    const notes = (body.notes || "").trim();

    const startDateRaw = body.startDate;
    const startDate = startDateRaw ? new Date(startDateRaw) : null;

    const fieldErrors = {};

    if (!name) fieldErrors.name = "Name is required.";
    if (!email) fieldErrors.email = "Email is required.";
    else if (!EMAIL_RE.test(email)) fieldErrors.email = "Invalid email format.";

    if (!ROLE_INTEREST.has(roleInterest)) fieldErrors.roleInterest = "Invalid selection.";
    if (!WEEKLY_HOURS.has(weeklyHours)) fieldErrors.weeklyHours = "Invalid selection.";
    if (!UYGHUR.has(uyghurProficiency)) fieldErrors.uyghurProficiency = "Invalid selection.";

    if (!startDateRaw) fieldErrors.startDate = "Start date is required.";
    else if (Number.isNaN(startDate?.getTime())) fieldErrors.startDate = "Invalid start date.";

    if (!subjects) fieldErrors.subjects = "Subjects are required.";

    if (!timezone) fieldErrors.timezone = "Timezone is required.";
    else if (!TIMEZONE_RE.test(timezone)) fieldErrors.timezone = "Invalid timezone format.";

    if (!PREF_TIME.has(preferredTimeOfDay)) fieldErrors.preferredTimeOfDay = "Invalid selection.";
    if (!availabilityDetails) fieldErrors.availabilityDetails = "Availability is required.";

    if (!motivation) fieldErrors.motivation = "Motivation is required.";

    if (Object.keys(fieldErrors).length > 0) {
      return res.status(422).json({
        success: false,
        message: "Please correct the highlighted fields.",
        fieldErrors,
      });
    }

    const created = await Volunteer.create({
      name,
      email,
      phone: phone || undefined,
      roleInterest,
      weeklyHours,
      uyghurProficiency,
      startDate,
      subjects,
      timezone,
      preferredTimeOfDay,
      availabilityDetails,
      motivation,
      notes: notes || undefined,
    });

    void maybeSendEmails({ volunteer: created.toObject() });

    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
});

// -------------------- ADMIN: list (paginated) --------------------

router.get("/all", requireAuth, requireAdminOrInstructor, async (req, res, next) => {
  try {
    await dbConnect();

    const page = Math.max(1, Number(req.query.page || 1));
    const limitRaw = Number(req.query.limit || 50);
    const limit = Math.min(200, Math.max(1, limitRaw));
    const q = String(req.query.q || "").trim();
    const status = String(req.query.status || "").trim();

    const filter = {};
    if (status && STATUS.has(status)) filter.status = status;

    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { name: rx },
        { email: rx },
        { phone: rx },
        { subjects: rx },
        { timezone: rx },
        { availabilityDetails: rx },
      ];
    }

    const [items, total] = await Promise.all([
      Volunteer.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select(
          "name email phone roleInterest weeklyHours uyghurProficiency startDate subjects timezone preferredTimeOfDay availabilityDetails motivation notes status createdAt"
        )
        .lean(),
      Volunteer.countDocuments(filter),
    ]);

    res.json({ items, total, page, limit });
  } catch (err) {
    next(err);
  }
});

// -------------------- ADMIN: update status --------------------

router.patch("/:id/status", requireAuth, requireAdminOrInstructor, async (req, res, next) => {
  try {
    await dbConnect();

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid id." });
    }

    const nextStatus = String(req.body?.status || "").trim();
    if (!STATUS.has(nextStatus)) {
      return res.status(422).json({
        success: false,
        message: "Invalid status.",
        fieldErrors: { status: "Status must be pending, approved, or rejected." },
      });
    }

    const updated = await Volunteer.findByIdAndUpdate(id, { $set: { status: nextStatus } }, { new: true })
      .select("status")
      .lean();

    if (!updated) return res.status(404).json({ success: false, message: "Not found." });

    res.json({ success: true, status: updated.status });
  } catch (err) {
    next(err);
  }
});

// -------------------- ADMIN: CSV export --------------------

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

router.get("/export.csv", requireAuth, requireAdminOrInstructor, async (req, res, next) => {
  try {
    await dbConnect();

    const q = String(req.query.q || "").trim();
    const status = String(req.query.status || "").trim();

    const filter = {};
    if (status && STATUS.has(status)) filter.status = status;

    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { name: rx },
        { email: rx },
        { phone: rx },
        { subjects: rx },
        { timezone: rx },
        { availabilityDetails: rx },
      ];
    }

    const rows = await Volunteer.find(filter)
      .sort({ createdAt: -1 })
      .select(
        "name email phone roleInterest weeklyHours uyghurProficiency startDate subjects timezone preferredTimeOfDay availabilityDetails motivation notes status createdAt"
      )
      .lean();

    const headers = [
      "createdAt",
      "status",
      "name",
      "email",
      "phone",
      "roleInterest",
      "weeklyHours",
      "uyghurProficiency",
      "startDate",
      "subjects",
      "timezone",
      "preferredTimeOfDay",
      "availabilityDetails",
      "motivation",
      "notes",
    ];

    const lines = [
      headers.join(","),
      ...rows.map((r) =>
        [
          r.createdAt ? new Date(r.createdAt).toISOString() : "",
          r.status || "",
          r.name || "",
          r.email || "",
          r.phone || "",
          r.roleInterest || "",
          labelWeeklyHours(r.weeklyHours),
          labelUyghur(r.uyghurProficiency),
          r.startDate ? new Date(r.startDate).toISOString().slice(0, 10) : "",
          r.subjects || "",
          r.timezone || "",
          labelPreferredTime(r.preferredTimeOfDay),
          r.availabilityDetails || "",
          r.motivation || "",
          r.notes || "",
        ]
          .map(csvEscape)
          .join(",")
      ),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="volunteers.csv"`);
    res.status(200).send(lines);
  } catch (err) {
    next(err);
  }
});

export default router;