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

const hasClerkSecret = Boolean(process.env.CLERK_SECRET_KEY);

// Session guard (adds req.auth on success)
// If secret is present, use Clerk; else respond 503 gracefully.
export const requireAuth = hasClerkSecret
  ? clerkRequireAuth()
  : (req, res) => res.status(503).json({ message: 'Auth disabled: missing CLERK_SECRET_KEY' });

export async function requireAdminOrInstructor(req, res, next) {
  try {
    if (!hasClerkSecret) {
      return res.status(503).json({ message: 'Auth disabled: missing CLERK_SECRET_KEY' });
    }
    const clerkId = req.auth?.userId; // set by requireAuth
    if (!clerkId) return res.status(401).json({ message: 'Unauthorized' });

    const me = await User.findOne({ clerkId }).select('privilege').lean();
    if (!me || !['admin', 'instructor'].includes(me.privilege)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  } catch (err) {
    console.error('requireAdminOrInstructor error:', err);
    res.status(500).json({ message: 'Auth check failed' });
  }
}