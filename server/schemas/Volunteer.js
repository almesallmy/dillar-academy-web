// server/schemas/Volunteer.js
// Volunteer application schema (MongoDB / Mongoose).
// Stores a single volunteer interest submission and its review status.
//
// Notes:
// - Uses compact enum values for consistency across UI + API.
// - `timezone` is validated as a strict UTC offset string (e.g., "UTC-05:00").
// - `timestamps` adds createdAt/updatedAt automatically.

import mongoose from "mongoose";

const { Schema } = mongoose;

const TIMEZONE_RE = /^UTC[+-]\d{2}:\d{2}$/;

const VolunteerSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },

    phone: {
      type: String,
      trim: true,
      maxlength: 40,
    },

    roleInterest: {
      type: String,
      enum: ["teach", "admin", "both"],
      required: true,
      index: true,
    },

    weeklyHours: {
      type: String,
      enum: ["lt1", "1_2", "3_5", "6_plus"],
      required: true,
      index: true,
    },

    uyghurProficiency: {
      type: String,
      enum: ["fluent_native", "professional", "conversational", "none"],
      required: true,
      index: true,
    },

    startDate: {
      type: Date,
      required: true,
    },

    subjects: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    timezone: {
      type: String,
      required: true,
      trim: true,
      maxlength: 16,
      match: [TIMEZONE_RE, 'Timezone must match format "UTC±HH:MM" (e.g., "UTC-05:00").'],
    },

    preferredTimeOfDay: {
      type: String,
      enum: ["morning", "afternoon", "evening", "flexible"],
      required: true,
      index: true,
    },

    availabilityDetails: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    motivation: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
  },
  { timestamps: true }
);

VolunteerSchema.index({ createdAt: -1 });

const Volunteer =
  mongoose.models.Volunteer || mongoose.model("Volunteer", VolunteerSchema);

export default Volunteer;