// server/schemas/Volunteer.js
import mongoose from "mongoose";

const { Schema } = mongoose;

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
      enum: ["1", "2", "more"],
      required: true,
      index: true,
    },

    uyghurProficiency: {
      type: String,
      enum: ["fluent", "somewhat", "no"],
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

    availability: {
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
  {
    timestamps: true,
  }
);

VolunteerSchema.index({ createdAt: -1 });

const Volunteer =
  mongoose.models.Volunteer ||
  mongoose.model("Volunteer", VolunteerSchema);

export default Volunteer;