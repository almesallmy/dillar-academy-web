// server/routes/volunteer-routes.js
import express from "express";
import mongoose from "mongoose";
import { dbConnect } from "../db.js";
import Volunteer from "../schemas/Volunteer.js";
import { validateInput } from "../../src/utils/backend/validate-utils.js";

// Auth (Clerk)
import { requireAuth, requireAdminOrInstructor } from "../middleware/auth.js";

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLE_INTEREST = new Set(["teach", "admin", "both"]);
const WEEKLY_HOURS = new Set(["1", "2", "more"]);
const UYGHUR = new Set(["fluent", "somewhat", "no"]);
const STATUS = new Set(["pending", "approved", "rejected"]);

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

  // If not configured, silently skip
  if (!host || !port || !user || !pass || !from) return;

  let nodemailer;
  try {
    nodemailer = await import("nodemailer");
  } catch (e) {
    console.warn("Email not sent: nodemailer not installed.");
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465, // common convention
    auth: { user, pass },
  });

  const lines = [
    `New volunteer submission`,
    ``,
    `Name: ${volunteer.name}`,
    `Email: ${volunteer.email}`,
    `Phone: ${volunteer.phone || "-"}`,
    `Role interest: ${volunteer.roleInterest}`,
    `Weekly hours: ${volunteer.weeklyHours}`,
    `Uyghur proficiency: ${volunteer.uyghurProficiency}`,
    `Start date: ${volunteer.startDate ? new Date(volunteer.startDate).toISOString().slice(0, 10) : "-"}`,
    `Subjects: ${volunteer.subjects}`,
    `Availability: ${volunteer.availability}`,
    ``,
    `Motivation:`,
    `${volunteer.motivation}`,
    ``,
    `Notes:`,
    `${volunteer.notes || "-"}`,
  ].join("\n");

  // 1) Notify admin inbox (if configured)
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

  // 2) Confirmation email to volunteer
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
      "availability",
      "motivation",
      "notes",
      "website", // honeypot
    ];

    const body = validateInput(req.body || {}, allowedFields);

    // Honeypot: real users won't fill this. Bots often will.
    const website = (body.website || "").trim();
    if (website) {
      // Return success to avoid signaling to bots that they were detected.
      return res.status(201).json({ success: true });
    }

    const name = (body.name || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const phone = (body.phone || "").trim();
    const roleInterest = (body.roleInterest || "").toLowerCase();
    const weeklyHours = (body.weeklyHours || "").toLowerCase();
    const uyghurProficiency = (body.uyghurProficiency || "").toLowerCase();
    const subjects = (body.subjects || "").trim();
    const availability = (body.availability || "").trim();
    const motivation = (body.motivation || "").trim();
    const notes = (body.notes || "").trim();

    const startDateRaw = body.startDate;
    const startDate = startDateRaw ? new Date(startDateRaw) : null;

    const fieldErrors = {};

    if (!name) fieldErrors.name = "Name is required.";
    if (!email) fieldErrors.email = "Email is required.";
    else if (!EMAIL_RE.test(email)) fieldErrors.email = "Invalid email format.";

    if (!ROLE_INTEREST.has(roleInterest))
      fieldErrors.roleInterest = "Invalid selection.";

    if (!WEEKLY_HOURS.has(weeklyHours))
      fieldErrors.weeklyHours = "Invalid selection.";

    if (!UYGHUR.has(uyghurProficiency))
      fieldErrors.uyghurProficiency = "Invalid selection.";

    if (!startDateRaw)
      fieldErrors.startDate = "Start date is required.";
    else if (Number.isNaN(startDate?.getTime()))
      fieldErrors.startDate = "Invalid start date.";

    if (!subjects) fieldErrors.subjects = "Subjects are required.";
    if (!availability) fieldErrors.availability = "Availability is required.";
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
      availability,
      motivation,
      notes: notes || undefined,
      // status defaults to pending
    });

    // Email is best-effort; never block success on SMTP issues.
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
        { subjects: rx },
      ];
    }

    const [items, total] = await Promise.all([
      Volunteer.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select("name email phone roleInterest weeklyHours uyghurProficiency startDate subjects availability motivation notes status createdAt")
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

    const updated = await Volunteer.findByIdAndUpdate(
      id,
      { $set: { status: nextStatus } },
      { new: true }
    )
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
      filter.$or = [{ name: rx }, { email: rx }, { subjects: rx }];
    }

    const rows = await Volunteer.find(filter)
      .sort({ createdAt: -1 })
      .select("name email phone roleInterest weeklyHours uyghurProficiency startDate subjects availability motivation notes status createdAt")
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
      "availability",
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
          r.weeklyHours || "",
          r.uyghurProficiency || "",
          r.startDate ? new Date(r.startDate).toISOString().slice(0, 10) : "",
          r.subjects || "",
          r.availability || "",
          r.motivation || "",
          r.notes || "",
        ].map(csvEscape).join(",")
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