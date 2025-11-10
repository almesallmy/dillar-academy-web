// api/routes/user-routes.js
// Purpose: User CRUD + admin/student listing, with Clerk auth and least-privilege data exposure.
//
// Conventions
// - Any route that reads many/arbitrary users is restricted to admin/instructor.
// - “Self” routes resolve the Mongo user via Clerk session (clerkId).
// - Use projection + .lean() where safe to reduce payloads.
// - On user delete, remove them from any class rosters (no Conversation model here).

import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import User from "../schemas/User.js";
import Class from "../schemas/Class.js";
import { clerkClient } from "@clerk/express";
import { validateInput } from "../../src/utils/backend/validate-utils.js";
import { requireAuth, requireAdminOrInstructor } from "../middleware/auth.js";

const router = express.Router();

/* -----------------------------
   Helpers
------------------------------*/

/** True if the user has admin or instructor privilege. */
const isAdminOrInstructor = (u) => !!u && ["admin", "instructor"].includes(u.privilege);

/** Resolve the current requester (“me”) by Clerk session (assumes requireAuth already ran). */
async function getMe(req) {
  const clerkId = req.auth?.userId;
  if (!clerkId) return null;
  return User.findOne({ clerkId }).select("privilege").lean();
}

/**
 * Gate: allow if requester is admin/instructor OR is requesting their own Mongo _id.
 * Expects :id in params and requireAuth upstream.
 */
async function allowSelfOrPriv(req, res, next) {
  try {
    const me = await getMe(req);
    if (isAdminOrInstructor(me)) return next();

    const paramId = req.params?.id;
    if (!paramId || !mongoose.Types.ObjectId.isValid(paramId)) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    const target = await User.findById(paramId).select("_id clerkId").lean();
    if (!target) return res.status(404).json({ message: "User not found" });

    const isSelf = target.clerkId === req.auth?.userId;
    return isSelf ? next() : res.status(403).json({ message: "Forbidden" });
  } catch (err) {
    console.error("allowSelfOrPriv error:", err);
    res.status(500).json({ message: "Auth check failed" });
  }
}

/* -----------------------------
   Public signup
------------------------------*/

// Creates Mongo profile after client-side Clerk account creation.
router.post("/sign-up", async (req, res) => {
  try {
    const { firstName, lastName, email, whatsapp, clerkId } = req.body;
    if (!firstName || !lastName || !email || !clerkId) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const existingUser = await User.findOne({ email }).select("_id").lean();
    if (existingUser) return res.status(409).json({ message: "Email already exists" });

    const newUser = await new User({ firstName, lastName, email, whatsapp, clerkId }).save();
    res.status(201).json(newUser);
  } catch (error) {
    console.error("Failed to sign up:", error);
    res.status(500).json({ message: "Failed to sign up" });
  }
});

/* -----------------------------
   Admin: list many users (restricted)
------------------------------*/

// GET /api/users[?privilege=instructor][&q=ali]
// - Admin/instructor only
// - Supports simple text search on firstName/lastName/email
// - Projects minimal safe fields
router.get("/users", requireAuth, requireAdminOrInstructor, async (req, res) => {
  try {
    const { privilege, q } = req.query;

    // Build a safe filter
    const filter = {};
    if (typeof privilege === "string" && privilege.trim()) {
      filter.privilege = privilege.trim(); // e.g., "instructor" | "student" | "admin"
    }
    if (typeof q === "string" && q.trim()) {
      const escape = (s) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      const rx = new RegExp(escape(q.trim()), "i");
      filter.$or = [{ firstName: rx }, { lastName: rx }, { email: rx }];
    }

    const users = await User.find(filter)
      .select("firstName lastName email privilege creationDate")
      .sort({ lastName: 1, firstName: 1 })
      .lean();

    res.status(200).json(users);
  } catch (err) {
    console.error("Get users error:", err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

/* -----------------------------
   Self or Admin: read/update/delete single user
------------------------------*/

// GET /api/user
// - Admin/instructor may query arbitrary user via ?_id / ?email / ?whatsapp
// - Non-privileged users get their own profile (from Clerk session)
router.get("/user", requireAuth, async (req, res) => {
  try {
    const allowedFields = ["_id", "email", "whatsapp"];
    const filters = validateInput(req.query, allowedFields);

    const me = await getMe(req);
    const isPriv = isAdminOrInstructor(me);

    let user;
    if (isPriv && Object.keys(filters).length) {
      user = await User.findOne(filters).lean();
    } else {
      const clerkId = req.auth.userId;
      user = await User.findOne({ clerkId }).lean();
    }

    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json(user);
  } catch (err) {
    console.error("Get user error:", err);
    res.status(500).send(err);
  }
});

// PUT /api/user/:id  (self or admin/instructor)
router.put("/user/:id", requireAuth, allowSelfOrPriv, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const originalUser = await User.findById(id);
    if (!originalUser) return res.status(404).json({ message: "User not found" });

    // If email changes, mirror in Clerk
    if (updates.email && originalUser.email !== updates.email) {
      await clerkClient.emailAddresses.createEmailAddress({
        userId: originalUser.clerkId,
        emailAddress: updates.email,
        verified: true,
        primary: true,
      });

      const clerkUser = await clerkClient.users.getUser(originalUser.clerkId);
      const oldEmail = clerkUser.emailAddresses.find(
        (e) => e.emailAddress === originalUser.email
      );
      if (oldEmail?.id) {
        await clerkClient.emailAddresses.deleteEmailAddress(oldEmail.id);
      }
    }

    const updatedUser = await User.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    res.status(200).json(updatedUser);
  } catch (error) {
    console.error("Failed to update user:", error);
    res.status(500).json({ message: "Failed to update user" });
  }
});

// DELETE /api/user/:id  (admin/instructor only)
router.delete("/user/:id", requireAuth, requireAdminOrInstructor, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const deletedUser = await User.findById(id);
    if (!deletedUser) return res.status(404).json({ message: "User not found" });

    // Remove the user from any class rosters
    if (Array.isArray(deletedUser.enrolledClasses) && deletedUser.enrolledClasses.length) {
      await Promise.all(
        deletedUser.enrolledClasses.map((classId) =>
          Class.findByIdAndUpdate(classId, { $pull: { roster: id } }).catch((err) => {
            console.error(`Failed to remove user ${id} from class ${classId} roster:`, err);
            throw err;
          })
        )
      );
    }

    // Delete Clerk user, then Mongo user
    await clerkClient.users.deleteUser(deletedUser.clerkId);
    await User.findByIdAndDelete(id);

    res.status(204).json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Failed to delete user:", error);
    res.status(500).json({ message: "Failed to delete user" });
  }
});

/* -----------------------------
   Admin Students (paginated, filterable)
------------------------------*/

// GET /api/students-with-classes?limit=100&page=1[&level=3|conversation|ielts][&q=ali]
// Purpose: server-driven pagination and accurate totals with optional level + text filters.
// Security: Clerk session + app role (admin or instructor) required.
router.get("/students-with-classes", requireAuth, requireAdminOrInstructor, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
    const page = Math.max(1, Number(req.query.page) || 1);
    const skip = (page - 1) * limit;

    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const levelRaw = typeof req.query.level === "string" ? req.query.level.trim() : "";
    const levelFilter = levelRaw === "" ? null : (Number.isNaN(Number(levelRaw)) ? levelRaw : Number(levelRaw));

    const pipeline = [];

    // 1) Base: students only
    pipeline.push({ $match: { privilege: "student" } });

    // 2) Optional text search
    if (q) {
      const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(escape(q), "i");
      pipeline.push({ $match: { $or: [{ firstName: rx }, { lastName: rx }, { email: rx }] } });
    }

    // 3) Join enrolled class docs
    pipeline.push({
      $lookup: {
        from: "classes",
        localField: "enrolledClasses",
        foreignField: "_id",
        as: "enrolledClasses"
      }
    });

    // 4) Project safe class fields only
    pipeline.push({
      $project: {
        firstName: 1,
        lastName: 1,
        email: 1,
        privilege: 1,
        creationDate: 1,
        enrolledClasses: {
          $map: {
            input: "$enrolledClasses",
            as: "c",
            in: {
              level: "$$c.level",
              ageGroup: "$$c.ageGroup",
              instructor: "$$c.instructor",
              schedule: "$$c.schedule",
              isEnrollmentOpen: "$$c.isEnrollmentOpen",
              image: "$$c.image"
            }
          }
        }
      }
    });

    // 5) Optional class level filter (retain only classes that match; drop students with none)
    if (levelFilter !== null) {
      pipeline.push({
        $set: {
          enrolledClasses: {
            $filter: {
              input: "$enrolledClasses",
              as: "c",
              cond: { $eq: ["$$c.level", levelFilter] }
            }
          }
        }
      });
      pipeline.push({ $match: { "enrolledClasses.0": { $exists: true } } });
    }

    // 6) Stable sort for UX
    pipeline.push({ $sort: { lastName: 1, firstName: 1, _id: 1 } });

    // 7) Facet for page + total count
    pipeline.push({
      $facet: {
        items: [{ $skip: skip }, { $limit: limit }],
        total: [{ $count: "count" }]
      }
    });

    const agg = await User.aggregate(pipeline).exec();
    const facet = Array.isArray(agg) ? agg[0] : { items: [], total: [] };
    const items = facet.items ?? [];
    const total = facet.total?.[0]?.count ?? 0;

    res.json({ items, total, page, limit });
  } catch (err) {
    console.error("students-with-classes error:", err);
    res.status(500).json({ message: "Failed to fetch students" });
  }
});

export default router;