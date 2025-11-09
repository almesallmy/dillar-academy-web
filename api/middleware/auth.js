// api/middleware/auth.js
// Centralized authentication & authorization for Express routes.
//
// Exports:
//   - requireAuth: ensures a valid Clerk session (401 if not signed in).
//   - requireAdminOrInstructor: only allows users whose Mongo `privilege` is
//     "admin" or "instructor" (403 otherwise).
//
// Prereqs:
//   • Backend env must include CLERK_SECRET_KEY.
//   • The signed-in Clerk user must have a matching users.clerkId in Mongo.

import { requireAuth as clerkRequireAuth } from '@clerk/express';
import User from '../schemas/User.js';

// Session guard (adds req.auth on success)
export const requireAuth = clerkRequireAuth();

export async function requireAdminOrInstructor(req, res, next) {
  try {
    const clerkId = req.auth?.userId; // set by requireAuth
    if (!clerkId) return res.status(401).json({ message: 'Unauthorized' });

    // Check app-level role from Mongo
    const me = await User.findOne({ clerkId }).select('privilege').lean();
    if (!me || !['admin', 'instructor'].includes(me.privilege)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    return next();
  } catch (err) {
    console.error('requireAdminOrInstructor error:', err);
    return res.status(500).json({ message: 'Auth check failed' });
  }
}