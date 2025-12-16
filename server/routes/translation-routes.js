/**
 * server/routes/translation-routes.js
 *
 * Translation namespace routes.
 * Mounted at `/api/locales` in `api/index.js`.
 *
 * Routes:
 * - GET  /:lng/:ns            Returns a flat key/value map for the namespace.
 * - PUT  /:lng/:ns/:key/      Upserts a single translation key/value.
 * - POST /create              Creates a translation document.
 * - POST /transfer            Transfers i18nexus translations into MongoDB.
 *
 * Caching:
 * - GET responses are marked cacheable at the CDN/edge to reduce repeated fetch load.
 */

import express from "express";
import Translation from "../schemas/Translation.js";

const router = express.Router();

// Get Translation
router.get("/:lng/:ns", async (req, res) => {
  try {
    const { lng, ns } = req.params;

    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");

    const data = await Translation.find({ lng, ns }).select("key value -_id").lean();

    const translations = {};
    for (const kv of data) {
      translations[kv.key] = kv.value;
    }

    return res.json(translations);
  } catch (error) {
    return res.status(500).json({ message: "Failed to get translation" });
  }
});

// Edit Translation
router.put("/:lng/:ns/:key/", async (req, res) => {
  const { lng, ns, key } = req.params;
  const { newTranslation } = req.body;

  try {
    const updated = await Translation.findOneAndUpdate(
      { lng, ns, key },
      { $set: { value: newTranslation } },
      { new: true, upsert: true }
    );

    return res.status(200).json({ message: "Successfully updated translation", translation: updated });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update translation" });
  }
});

router.post("/create", async (req, res) => {
  const { lng, ns, key, value } = req.body;

  try {
    const translation = new Translation({
      lng,
      ns,
      key,
      value,
    });

    await translation.save();
    return res.status(201).json({ message: "Translation created successfully", data: translation });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create translation" });
  }
});

// Move all i18nexus translations to MongoDB
router.post("/transfer", async (req, res) => {
  try {
    const response = await fetch(
      `https://api.i18nexus.com/project_resources/translations.json?api_key=${process.env.I18NEXUS_API_KEY}`
    );

    if (!response.ok) {
      return res.status(response.status).json({ message: "Failed to fetch translations" });
    }

    const translations = await response.json();

    const translationsToInsert = [];
    for (const [lng, namespaces] of Object.entries(translations)) {
      for (const [ns, keys] of Object.entries(namespaces)) {
        for (const [key, value] of Object.entries(keys)) {
          translationsToInsert.push({
            lng,
            ns,
            key,
            value,
          });

          await fetch(
            `https://api.i18nexus.com/project_resources/base_strings.json?api_key=${process.env.I18NEXUS_API_KEY}`,
            {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.I18NEXUS_PAT}`,
              },
              body: JSON.stringify({
                id: {
                  key,
                  namespace: ns,
                },
              }),
            }
          );
        }
      }
    }

    await Translation.insertMany(translationsToInsert);

    return res.status(200).json({ message: "Successfully inserted translations" });
  } catch (error) {
    return res.status(500).json({ message: "Error transferring translations" });
  }
});

export default router;