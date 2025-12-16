// src/i18n.js
// i18next configuration for the client.
// - Loads translation namespaces from the API.
// - Detects user language with safe fallbacks.
// - Avoids duplicate initialization (e.g., during HMR).

import i18n from "i18next";
import HttpBackend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

if (!i18n.isInitialized) {
  i18n
    .use(HttpBackend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      fallbackLng: "en",

      supportedLngs: ["en", "ug", "ru", "tr", "zh"],
      load: "languageOnly",

      ns: ["default", "levels"],
      defaultNS: "default",

      backend: {
        loadPath: "/api/locales/{{lng}}/{{ns}}",
      },

      detection: {
        order: ["localStorage", "cookie", "navigator", "htmlTag"],
        caches: ["localStorage"],
      },

      interpolation: {
        escapeValue: false,
      },

      react: {
        useSuspense: false,
      },
    });
}

export default i18n;