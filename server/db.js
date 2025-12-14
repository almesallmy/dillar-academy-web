// server/db.js
// Memoized Mongoose connection for serverless (Vercel).
// Keeps a single connection per warm instance to avoid re-creating pools on each request.

import mongoose from "mongoose";

const GLOBAL_KEY = "__mongooseCached";

// Reuse global cache across hot reloads / warm invocations
const g = globalThis;
if (!g[GLOBAL_KEY]) {
  g[GLOBAL_KEY] = { conn: null, promise: null };
}

const cached = g[GLOBAL_KEY];

/**
 * Establish (or reuse) a single Mongoose connection.
 * Returns the connected mongoose instance.
 */
export async function dbConnect() {
  if (cached.conn) return cached.conn;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(uri, {
        bufferCommands: false,
        serverSelectionTimeoutMS: 30000,
        socketTimeoutMS: 45000,
      })
      .then((m) => m)
      .catch((err) => {
        // Allow retries on the next invocation if the first attempt fails
        cached.promise = null;
        throw err;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}