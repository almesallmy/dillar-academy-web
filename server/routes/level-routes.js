/**
 * server/routes/level-routes.js
 *
 * Level API routes.
 * Mounted at `/api/levels` in `api/index.js`.
 *
 * Endpoints:
 * - GET    /           Returns all levels (optionally filtered), sorted ascending by `level`.
 * - POST   /           Creates a level and syncs translations.
 * - PUT    /:id        Updates a level and syncs translations.
 * - DELETE /:id        Deletes a level and its translations.
 *
 * Caching:
 * - Public GET responses are marked cacheable at the CDN/edge to reduce repeated fetch load.
 */

import express from "express";
import mongoose from "mongoose";
import Level from "../schemas/Level.js";
import { validateInput } from "../../src/utils/backend/validate-utils.js";
import { deleteLevelTranslations, createLevelTranslations } from "../../src/utils/backend/translation-utils.js";

const router = express.Router();

// Get Levels (sorted ascending by numeric level)
router.get("/", async (req, res) => {
  try {
    const allowedFields = ["level"];
    const filters = validateInput(req.query, allowedFields);

    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");

    const data = await Level.find(filters).sort({ level: 1 }).lean();
    res.json(data);
  } catch (err) {
    res.status(500).send(err);
  }
});

// Create Level
router.post("/", async (req, res) => {
  try {
    const { level, name, description, skills, image } = req.body;

    const existingLevel = await Level.findOne({ level });
    if (existingLevel) {
      return res.status(409).json({
        message: "Level with this number already exists",
        level: existingLevel,
      });
    }

    const newLevel = new Level({
      level,
      name,
      description,
      skills,
      image,
    });

    await newLevel.save();

    await createLevelTranslations(newLevel);

    return res.status(201).json({
      message: "Level created successfully",
      level: newLevel,
    });
  } catch (error) {
    console.error("Error creating:", error);
    return res.status(500).json({ message: "Failed to create level" });
  }
});

// Edit Level
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const existingLevel = await Level.findOne({ level: updates.level });
    if (existingLevel && existingLevel._id.toString() !== id.toString()) {
      return res.status(409).json({
        message: "Level with this number already exists",
        level: existingLevel,
      });
    }

    const currentLevel = await Level.findById(id);
    if (!currentLevel) {
      return res.status(404).json({ message: "Level not found" });
    }

    const updatedLevel = await Level.findByIdAndUpdate(id, updates, { new: true, runValidators: true });

    await deleteLevelTranslations(currentLevel);
    await createLevelTranslations(updatedLevel);

    res.status(200).json(updatedLevel);
  } catch (error) {
    console.error("Failed to update level details:", error);
    res.status(500).json({ message: "Failed to update level details" });
  }
});

// Delete Level
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const deletedLevel = await Level.findById(id);
    if (!deletedLevel) {
      return res.status(404).json({ message: "Level not found" });
    }

    await deleteLevelTranslations(deletedLevel);
    await Level.findByIdAndDelete(id);

    res.status(204).json({ message: "Level deleted successfully" });
  } catch (error) {
    console.error("Failed to delete level:", error);
    res.status(500).json({ message: "Failed to delete level" });
  }
});

export default router;