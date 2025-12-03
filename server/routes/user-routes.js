// api/routes/user-routes.js
// Purpose: User CRUD + admin/student listing, with Clerk auth and least-privilege data exposure.

import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import User from "../schemas/User.js";
import Class from "../schemas/Class.js";
import { clerkClient } from "@clerk/express";
import { validateInput } from "../../src/utils/backend/validate-utils.js";
import { requireAuth, requireAdminOrInstructor } from "../../server/middleware/auth.js";

const router = express.Router();

/* -----------------------------
   Helpers
------------------------------*/

const isAdminOrInstructor = (u) => !!u && ["admin", "instructor"].includes(u.privilege);

async function getMe(req) {
  const clerkId = req.auth?.userId;
  if (!clerkId) return null;
  return User.findOne({ clerkId }).select("privilege").lean();
}

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

const escapeRx = (s) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");

/* -----------------------------
   Public signup
------------------------------*/

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

// GET /api/users
// Optional: privilege, q, page, limit
router.get("/users", requireAuth, requireAdminOrInstructor, async (req, res) => {
  try {
    const { privilege, q } = req.query;
    const page = Number(req.query.page);
    const limit = Number(req.query.limit);

    const filter = {};
    if (typeof privilege === "string" && privilege.trim()) {
      filter.privilege = privilege.trim();
    }
    if (typeof q === "string" && q.trim()) {
      const rx = new RegExp(escapeRx(q.trim()), "i");
      filter.$or = [{ firstName: rx }, { lastName: rx }, { email: rx }];
    }

    const projection = "firstName lastName email privilege creationDate";

    if (!Number.isNaN(page) && page > 0 && !Number.isNaN(limit) && limit > 0) {
      const cappedLimit = Math.min(200, Math.max(1, limit));
      const skip = (page - 1) * cappedLimit;

      const [items, total] = await Promise.all([
        User.find(filter)
          .select(projection)
          .sort({ lastName: 1, firstName: 1 })
          .skip(skip)
          .limit(cappedLimit)
          .lean(),
        User.countDocuments(filter),
      ]);

      return res.status(200).json({ items, total, page, limit: cappedLimit });
    }

    const users = await User.find(filter)
      .select(projection)
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

router.put("/user/:id", requireAuth, allowSelfOrPriv, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const originalUser = await User.findById(id);
    if (!originalUser) return res.status(404).json({ message: "User not found" });

    if (updates.email && originalUser.email !== updates.email) {
      await clerkClient.emailAddresses.createEmailAddress({
        userId: originalUser.clerkId,
        emailAddress: updates.email,
        verified: true,
        primary: true,
      });

      const clerkUser = await clerkClient.users.getUser(originalUser.clerkId);
      const oldEmail = clerkUser.emailAddresses.find((e) => e.emailAddress === originalUser.email);
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

router.delete("/user/:id", requireAuth, requireAdminOrInstructor, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const deletedUser = await User.findById(id);
    if (!deletedUser) return res.status(404).json({ message: "User not found" });

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

    await clerkClient.users.deleteUser(deletedUser.clerkId);
    await User.findByIdAndDelete(id);

    res.status(204).json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Failed to delete user:", error);
    res.status(500).json({ message: "Failed to delete user" });
  }
});

/* -----------------------------
   Student class views
------------------------------*/

router.get("/students-classes/:id", requireAuth, allowSelfOrPriv, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const classDetails = await User.findById(id)
      .select("enrolledClasses")
      .populate("enrolledClasses")
      .lean();

    if (!classDetails) return res.status(404).json({ message: "User not found" });
    res.json(classDetails.enrolledClasses || []);
  } catch (err) {
    console.error("students-classes error:", err);
    res.status(500).send(err);
  }
});

/* -----------------------------
   Admin Students (paginated + filters)
------------------------------*/

// GET /api/students-with-classes?limit=100&page=1[&level=1|conversation|ielts][&q=...]
router.get("/students-with-classes", requireAuth, requireAdminOrInstructor, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
    const page = Math.max(1, Number(req.query.page) || 1);
    const skip = (page - 1) * limit;

    const { level: levelParam, q } = req.query;

    // Build class-based filters first (for level and/or text on class fields)
    const classIdFilters = [];

    // Level filter (number or string: "conversation" | "ielts")
    if (typeof levelParam !== "undefined" && levelParam !== null && `${levelParam}`.trim() !== "") {
      const raw = `${levelParam}`.trim();
      const parsed = Number.isNaN(Number(raw)) ? raw.toLowerCase() : Number(raw);
      const levelClasses = await Class.find({ level: parsed }).select("_id").lean();
      const ids = levelClasses.map((c) => c._id);
      if (!ids.length) {
        return res.json({ items: [], total: 0, page, limit });
      }
      classIdFilters.push({ enrolledClasses: { $in: ids } });
    }

    // Optional q: match user name/email OR class instructor/ageGroup
    const userOr = [];
    if (typeof q === "string" && q.trim()) {
      const rx = new RegExp(escapeRx(q.trim()), "i");
      userOr.push({ firstName: rx }, { lastName: rx }, { email: rx });

      const qClasses = await Class.find({ $or: [{ instructor: rx }, { ageGroup: rx }] })
        .select("_id")
        .lean();
      const qIds = qClasses.map((c) => c._id);
      if (qIds.length) classIdFilters.push({ enrolledClasses: { $in: qIds } });
    }

    // Final user filter
    const userFilter = { privilege: "student" };
    if (userOr.length || classIdFilters.length) {
      userFilter.$and = [];
      if (userOr.length) userFilter.$and.push({ $or: userOr });
      if (classIdFilters.length) userFilter.$and.push({ $and: classIdFilters });
      if (!userFilter.$and.length) delete userFilter.$and;
    }

    const userSelect = "firstName lastName email privilege enrolledClasses creationDate";
    const classSelect = "level ageGroup instructor schedule isEnrollmentOpen image";

    const [items, total] = await Promise.all([
      User.find(userFilter)
        .select(userSelect)
        .sort({ lastName: 1, firstName: 1 })
        .skip(skip)
        .limit(limit)
        .populate({ path: "enrolledClasses", select: classSelect })
        .lean(),
      User.countDocuments(userFilter),
    ]);

    res.json({ items, total, page, limit });
  } catch (err) {
    console.error("students-with-classes error:", err);
    res.status(500).json({ message: "Failed to fetch students" });
  }
});

export default router;